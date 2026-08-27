// STATIC GUARD against the #1 cause of a silent sync failure:
// a .select()/.insert()/.update()/.upsert() that names a column or CHECK value the
// database does not have. Postgres rejects the whole statement, the collector logs an
// error, and data never lands. This test scans every file that talks to Supabase and
// cross-checks each literal column/value reference against schema.js.
//
// It cannot see columns injected via spread (...normalized.post) — those are covered by
// normalizerContract.test.js — but it catches every hard-coded column name and enum value.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TABLES, columnNames, columnSpec } from './schema.js';

const FILES = [
  'supabase/functions/collect-linkedin/index.ts',
  'supabase/functions/collect-youtube/index.ts',
  'supabase/functions/collect-instagram/index.ts',
  'supabase/functions/classify-content/index.ts',
  'supabase/functions/content-dashboard-api/index.ts',
  'supabase/functions/scrape-linkedin/index.ts',
  // Camada comercial: passou a ser escaneável quando leads/lead_outreach/
  // lead_qualifications e as tabelas do pipeline entraram no schema.js.
  'supabase/functions/lead-outreach/index.ts',
  'supabase/functions/lead-pipeline/index.ts',
  'supabase/functions/enrich-leads/index.ts',
  'supabase/functions/prospect-post/index.ts',
  'scripts/bulk-import-all.mjs',
];

// Grab the balanced {...} object literal ONLY when it is the immediate next token after
// the call open-paren. A dynamic payload (e.g. .update(payload)) returns null so we don't
// wander into an unrelated object literal further down the chain.
function balancedObject(src, from) {
  let start = from;
  while (start < src.length && /\s/.test(src[start])) start += 1;
  if (src[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

// Replace the contents of string/template literals with spaces (preserving length and
// offsets) so `key:`-looking text inside a value (e.g. '00:00:00', https://…) is ignored.
function blankStrings(src) {
  let out = '';
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { out += '  '; i += 1; continue; }
      if (ch === quote) { quote = null; out += ch; continue; }
      out += ' ';
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}

// Top-level `key:` names inside an object literal (skips nested objects and string bodies).
function topLevelKeys(objText) {
  const keys = [];
  let depth = 0;
  const inner = blankStrings(objText).slice(1, -1);
  const re = /(\w+)\s*:/g;
  // Track brace depth so we only capture depth-0 keys.
  let idx = 0;
  const marks = [];
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '{' || inner[i] === '[' || inner[i] === '(') depth += 1;
    else if (inner[i] === '}' || inner[i] === ']' || inner[i] === ')') depth -= 1;
    marks[i] = depth;
  }
  let m;
  while ((m = re.exec(inner))) {
    const at = m.index;
    if ((marks[at] || 0) !== 0) { idx = at; continue; }
    // Um `nome:` só é CHAVE se vier logo depois de '{' (início do objeto) ou de ','.
    // Sem esta checagem, o ':' de um ternário no VALOR de uma propriedade
    // (`company_url: empregado ? company.url : null`) fazia o identificador
    // anterior — 'url' — ser lido como coluna, e o guard acusava fantasma onde o
    // código estava certo. Falso positivo é tão ruim quanto falso negativo aqui:
    // ele treina quem lê a suíte a ignorar o vermelho.
    let before = at - 1;
    while (before >= 0 && /\s/.test(inner[before])) before -= 1;
    if (before >= 0 && inner[before] !== ',' && inner[before] !== '{') { idx = at; continue; }
    keys.push({ key: m[1], at });
    idx = at;
  }
  void idx;
  return keys;
}

// A literal string value for `key: 'value'` at depth 0, else null.
function literalValueFor(objText, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*'([^']*)'`);
  const m = objText.match(re);
  return m ? m[1] : null;
}

// Find each `.from('table')....(payload)` occurrence and return references to check.
function extractReferences(src) {
  const refs = [];
  const fromRe = /\.from\(\s*['"]([a-z_]+)['"]\s*\)/g;
  let m;
  const froms = [];
  while ((m = fromRe.exec(src))) froms.push({ table: m[1], index: m.index });

  for (let i = 0; i < froms.length; i += 1) {
    const { table, index } = froms[i];
    const end = i + 1 < froms.length ? froms[i + 1].index : src.length;
    const chunk = src.slice(index, end);

    // Only schema tables (skip views v_* and unknowns — those are read-only views).
    if (!TABLES[table]) continue;

    // .select('a, b, c') string literal
    const selRe = /\.select\(\s*(['"])([^'"]*)\1\s*\)/g;
    let s;
    while ((s = selRe.exec(chunk))) {
      const list = s[2];
      if (list.includes('(') || list.trim() === '*') continue; // skip aggregates/star
      for (const raw of list.split(',')) {
        const name = raw.trim().split(':')[0].trim();
        if (name && name !== '*') refs.push({ table, op: 'select', column: name });
      }
    }

    // .insert / .update / .upsert object payloads
    for (const op of ['insert', 'update', 'upsert']) {
      const callRe = new RegExp(`\\.${op}\\(`, 'g');
      let c;
      while ((c = callRe.exec(chunk))) {
        const obj = balancedObject(chunk, callRe.lastIndex); // lastIndex is just past the '('
        if (!obj) continue;
        for (const { key } of topLevelKeys(obj)) {
          const value = literalValueFor(obj, key);
          refs.push({ table, op, column: key, value });
        }
      }
    }
  }
  return refs;
}

function scanSource(src) {
  const problems = [];
  for (const ref of extractReferences(src)) {
    const cols = columnNames(ref.table);
    if (!cols) continue;
    if (!cols.includes(ref.column)) {
      problems.push(`${ref.op} ${ref.table}.${ref.column} — column does not exist`);
      continue;
    }
    if (ref.value != null) {
      const spec = columnSpec(ref.table, ref.column);
      if (spec?.check && !spec.check.includes(ref.value)) {
        problems.push(`${ref.op} ${ref.table}.${ref.column} = '${ref.value}' — violates CHECK (${spec.check.join(', ')})`);
      }
    }
  }
  return problems;
}

describe('Supabase column references match the schema (no phantom columns/enums)', () => {
  for (const file of FILES) {
    it(`${file} only references columns/enums that exist`, () => {
      let src;
      try {
        src = readFileSync(resolve(process.cwd(), file), 'utf8');
      } catch {
        return; // file may not exist in every checkout
      }
      const problems = scanSource(src);
      expect(problems, `Phantom column/enum references in ${file}:\n  - ${problems.join('\n  - ')}`).toEqual([]);
    });
  }
});

// Meta-test: prove the scanner actually detects the bug classes it is meant to guard,
// so it can never silently rot into a no-op. These are the exact defects the red-team found.
describe('scanner self-test (guards against a no-op scanner)', () => {
  it('catches a phantom column in a select list', () => {
    const bad = `client.from('content_post_daily_metrics').select('id, metric_date, impressions, collected_at')`;
    expect(scanSource(bad)).toEqual(expect.arrayContaining([
      expect.stringContaining('content_post_daily_metrics.impressions'),
      expect.stringContaining('content_post_daily_metrics.collected_at'),
    ]));
  });

  it('catches a phantom column in an update payload', () => {
    const bad = `client.from('content_posts').update({ theme: 'IA', classified_at: now })`;
    expect(scanSource(bad)).toEqual(expect.arrayContaining([
      expect.stringContaining('content_posts.classified_at'),
    ]));
  });

  it('catches a CHECK-enum violation in an upsert payload', () => {
    const bad = `client.from('content_post_daily_metrics').upsert({ post_id: id, source: 'apify_linkedin' }, { onConflict: 'post_id,metric_date,source' })`;
    expect(scanSource(bad)).toEqual(expect.arrayContaining([
      expect.stringContaining("content_post_daily_metrics.source = 'apify_linkedin'"),
    ]));
  });

  it('does not false-positive on valid references', () => {
    const good = `client.from('content_posts').update({ theme: 'IA', classification_status: 'manual' })`;
    expect(scanSource(good)).toEqual([]);
  });

  // Um ternário no VALOR de uma propriedade tem ':' no meio da expressão. O token
  // antes dele não é chave — e antes desta guarda o scanner acusava coluna fantasma
  // em código correto (enrich-leads e lead-outreach, ambos legítimos).
  it('does not mistake a ternary inside a value for a column key', () => {
    const good = `client.from('leads').update({ company_url: empregado ? company.url : null })`;
    expect(scanSource(good)).toEqual([]);
  });

  it('still catches a phantom column that FOLLOWS a ternary in the same payload', () => {
    const bad = `client.from('leads').update({ company_url: empregado ? company.url : null, classified_at: hoje })`;
    expect(scanSource(bad)).toEqual(expect.arrayContaining([
      expect.stringContaining('leads.classified_at'),
    ]));
  });
});
