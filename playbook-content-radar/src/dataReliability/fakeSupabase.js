// An in-memory Supabase-compatible client that enforces the real schema contract
// (unknown/generated columns, CHECK enums, NOT NULL, UNIQUE, onConflict upsert,
// .single()/.maybeSingle() semantics). It lets the actual collector write loops run
// end-to-end in CI without touching the production database — so we catch a row the
// DB would reject BEFORE it fails in production.
//
// It is deliberately faithful to the failure modes that break a real sync:
//   - writing a column that does not exist            -> throws (like Postgres 42703)
//   - writing a value outside a CHECK constraint       -> throws (like Postgres 23514)
//   - upsert onConflict not covering a 2nd UNIQUE hit  -> throws (like Postgres 23505)
//   - .single() when 0 rows matched                    -> throws (like PostgREST PGRST116)

import { TABLES, validateRow } from './schema.js';

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${(idCounter += 1)}`;

function applyGenerated(table, row) {
  const spec = TABLES[table];
  if (!spec?.generatedValues) return row;
  const out = { ...row };
  for (const [key, fn] of Object.entries(spec.generatedValues)) out[key] = fn(row);
  return out;
}

function fillDefaults(table, row) {
  const spec = TABLES[table];
  const out = { ...row };
  for (const c of spec.columns) {
    if (Object.prototype.hasOwnProperty.call(out, c.name)) continue;
    if (c.name === 'id') { out.id = nextId(table); continue; }
    if (c.generated || c.generatedByDefault) continue;
    if (Object.prototype.hasOwnProperty.call(c, 'default')) {
      out[c.name] = c.default === '__current_date__' ? '2026-07-01' : c.default;
    }
  }
  if (!out.id) out.id = nextId(table);
  return out;
}

function conflictKey(cols, row) {
  return cols.map((c) => JSON.stringify(row[c] ?? null)).join('|');
}

// Every UNIQUE constraint on the table except the primary key ['id'].
function uniqueConstraints(table) {
  return (TABLES[table].unique || []).filter((cols) => !(cols.length === 1 && cols[0] === 'id'));
}

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this._op = 'select';
    this._filters = [];
    this._payload = null;
    this._onConflict = null;
    this._ignoreDuplicates = false;
    this._selectCols = '*';
    this._single = null;
    this._order = [];
  }

  select(cols = '*') {
    if (this._op === 'select') this._selectCols = cols;
    else this._returning = cols;
    // Validate that a select column list references only real columns.
    this._validateSelectCols(cols);
    return this;
  }

  _validateSelectCols(cols) {
    if (typeof cols !== 'string' || cols.trim() === '*') return;
    const names = cols.split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean);
    const valid = new Set(TABLES[this.table]?.columns.map((c) => c.name) || []);
    for (const n of names) {
      if (n === '*') continue;
      if (!valid.has(n)) {
        this._selectError = `column ${this.table}.${n} does not exist`;
      }
    }
  }

  insert(payload) { this._op = 'insert'; this._payload = payload; return this; }
  update(payload) { this._op = 'update'; this._payload = payload; return this; }

  upsert(payload, opts = {}) {
    this._op = 'upsert';
    this._payload = payload;
    this._onConflict = opts.onConflict ? String(opts.onConflict).split(',').map((s) => s.trim()) : null;
    this._ignoreDuplicates = Boolean(opts.ignoreDuplicates);
    return this;
  }

  eq(col, val) { this._filters.push((r) => r[col] === val); return this; }
  is(col, val) { this._filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val)); return this; }
  not(col, _op, val) { this._filters.push((r) => !(val === null ? r[col] === null || r[col] === undefined : r[col] === val)); return this; }
  gte(col, val) { this._filters.push((r) => r[col] != null && r[col] >= val); return this; }
  lte(col, val) { this._filters.push((r) => r[col] != null && r[col] <= val); return this; }
  order(col, opts = {}) { this._order.push({ col, ascending: opts.ascending !== false }); return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = 'single'; return this._run(); }
  maybeSingle() { this._single = 'maybe'; return this._run(); }
  then(resolve, reject) { return this._run().then(resolve, reject); }

  _rows() {
    const rows = this.db.store[this.table] || [];
    return rows.filter((r) => this._filters.every((f) => f(r)));
  }

  async _run() {
    try {
      if (this._selectError) return { data: null, error: { message: this._selectError, code: '42703' } };
      let result;
      if (this._op === 'select') result = this._doSelect();
      else if (this._op === 'insert') result = this._doWrite(false);
      else if (this._op === 'upsert') result = this._doWrite(true);
      else if (this._op === 'update') result = this._doUpdate();
      return this._shape(result);
    } catch (error) {
      return { data: null, error: { message: error.message, code: error.code || 'XXXXX' } };
    }
  }

  _doSelect() {
    let rows = this._rows();
    for (const { col, ascending } of this._order) {
      rows = [...rows].sort((a, b) => {
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        const cmp = String(av).localeCompare(String(bv));
        return ascending ? cmp : -cmp;
      });
    }
    if (this._limit) rows = rows.slice(0, this._limit);
    return rows;
  }

  _writeOne(rowInput) {
    // 1. Reject unknown/generated columns and CHECK/NOT NULL violations.
    const validation = validateRow(this.table, rowInput);
    if (!validation.ok) {
      const err = new Error(validation.errors[0]);
      err.code = '23514';
      throw err;
    }
    return fillDefaults(this.table, rowInput);
  }

  _doWrite(isUpsert) {
    const inputs = Array.isArray(this._payload) ? this._payload : [this._payload];
    const store = (this.db.store[this.table] ||= []);
    const written = [];

    for (const input of inputs) {
      const candidate = this._writeOne(input);

      if (isUpsert && this._onConflict) {
        const target = this._onConflict;
        const existing = store.find((r) => conflictKey(target, r) === conflictKey(target, candidate));
        if (existing) {
          if (this._ignoreDuplicates) { written.push(existing); continue; }
          // ON CONFLICT DO UPDATE sets only the columns actually supplied in the payload —
          // NOT default-filled columns — so an omitted column keeps its existing value.
          const provided = {};
          for (const k of Object.keys(input)) provided[k] = input[k];
          const merged = applyGenerated(this.table, { ...existing, ...provided, id: existing.id });
          // The merged row must still satisfy OTHER unique constraints.
          this._assertUnique(merged, existing);
          Object.assign(existing, merged);
          written.push(existing);
          continue;
        }
      }

      // Fresh insert path (insert, or upsert with no conflict match on target).
      const stored = applyGenerated(this.table, candidate);
      this._assertUnique(stored, null);
      store.push(stored);
      written.push(stored);
    }

    return written;
  }

  // Enforce EVERY unique constraint — this is how a post_url collision throws even
  // when the upsert only declared onConflict: external_post_id.
  _assertUnique(row, skip) {
    const store = this.db.store[this.table] || [];
    for (const cols of uniqueConstraints(this.table)) {
      // Postgres treats NULLs as distinct: a NULL in any column of the key => no conflict.
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue;
      const key = conflictKey(cols, row);
      const clash = store.find((r) => r !== skip && conflictKey(cols, r) === key);
      if (clash) {
        const err = new Error(`duplicate key value violates unique constraint on ${this.table} (${cols.join(', ')})`);
        err.code = '23505';
        throw err;
      }
    }
  }

  _doUpdate() {
    const rows = this._rows();
    const spec = TABLES[this.table];
    const allowed = new Set(spec.columns.map((c) => c.name));
    for (const key of Object.keys(this._payload)) {
      if (!allowed.has(key)) {
        const err = new Error(`column "${key}" of relation "${this.table}" does not exist`);
        err.code = '42703';
        throw err;
      }
      const c = spec.columns.find((x) => x.name === key);
      if (c.generated) { const e = new Error(`cannot update generated column "${key}"`); e.code = '428C9'; throw e; }
      const val = this._payload[key];
      if (val != null && c.check && !c.check.includes(val)) {
        const e = new Error(`new row violates CHECK on ${this.table}.${key}`); e.code = '23514'; throw e;
      }
    }
    for (const r of rows) Object.assign(r, applyGenerated(this.table, { ...r, ...this._payload }));
    return rows;
  }

  _shape(rows) {
    if (this._single === 'single') {
      if (rows.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      return { data: rows[0], error: null };
    }
    if (this._single === 'maybe') {
      if (rows.length > 1) return { data: null, error: { message: 'multiple rows returned', code: 'PGRST116' } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }
}

export function createFakeSupabase(seed = {}) {
  const db = { store: {} };
  for (const table of Object.keys(TABLES)) db.store[table] = [];
  for (const [table, rows] of Object.entries(seed)) {
    db.store[table] = (rows || []).map((r) => applyGenerated(table, fillDefaults(table, r)));
  }
  return {
    from(table) {
      if (!TABLES[table]) throw new Error(`relation "${table}" does not exist`);
      return new QueryBuilder(db, table);
    },
    _dump(table) { return db.store[table]; },
    _db: db,
  };
}
