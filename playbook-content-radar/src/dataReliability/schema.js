// Single source of truth for the Supabase schema, transcribed from
// supabase/migrations/202607010001_content_metrics.sql and 202607011000_instagram.sql.
//
// Every test in this folder validates the data-sync pipeline against THIS contract.
// If a migration changes a column or CHECK, update it here and the whole suite follows.
// The goal: guarantee that anything a normalizer/collector emits is a row the real
// database will actually accept — so a sync can never fail the way it did on ingest.

// Helper to build a column spec compactly.
const col = (name, opts = {}) => ({ name, ...opts });

export const TABLES = {
  content_accounts: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('platform', { notNull: true, check: ['linkedin', 'youtube', 'instagram'] }),
      col('owner_name', { notNull: true }),
      col('account_name'),
      col('account_url', { notNull: true }),
      col('handle'),
      col('external_id'),
      col('status', { notNull: true, check: ['active', 'paused', 'error'], default: 'active' }),
      col('notes'),
      col('last_collected_at'),
      col('last_error'),
      col('created_at', { generatedByDefault: true }),
      col('updated_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['platform', 'account_url']],
    primaryKey: ['id'],
  },

  content_posts: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('account_id', { notNull: true }),
      col('platform', { notNull: true, check: ['linkedin'], default: 'linkedin' }),
      col('external_post_id', { notNull: true }),
      col('entity_id'),
      col('share_urn'),
      col('post_url'),
      col('author_name'),
      col('author_identifier'),
      col('published_at'),
      col('content', { notNull: true, default: '' }),
      col('hook'),
      col('format', { check: ['text', 'image', 'carousel', 'video', 'repost', 'article', 'unknown'], nullable: true }),
      col('theme'),
      col('content_pillar'),
      col('cta_keyword'),
      col('funnel_stage', { check: ['awareness', 'lead_magnet', 'conversion', 'community', 'hiring', 'authority', 'personal'], nullable: true }),
      col('commercial_intent', { check: ['none', 'low', 'medium', 'high'], nullable: true }),
      col('is_repost', { notNull: true, default: false }),
      col('repost_id'),
      col('media_url'),
      col('media_type'),
      col('classification_status', { notNull: true, check: ['pending', 'processing', 'classified', 'manual', 'error'], default: 'pending' }),
      col('classification_error'),
      col('raw', { notNull: true, default: {} }),
      col('created_at', { generatedByDefault: true }),
      col('updated_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['external_post_id'], ['post_url']],
    primaryKey: ['id'],
  },

  content_post_daily_metrics: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('post_id', { notNull: true }),
      col('metric_date', { notNull: true, default: '__current_date__' }),
      col('likes', { notNull: true, default: 0, min: 0 }),
      col('comments', { notNull: true, default: 0, min: 0 }),
      col('shares', { notNull: true, default: 0, min: 0 }),
      col('reactions_total', { notNull: true, default: 0, min: 0 }),
      col('views', { nullable: true, min: 0 }),
      col('engagement_total', { generated: true }),
      col('engagement_score', { generated: true }),
      col('source', { notNull: true, check: ['historical_json', 'apify_daily', 'manual', 'automated'], default: 'automated' }),
      col('metric_type', { notNull: true, check: ['snapshot', 'daily_collect', 'manual_correction'], default: 'daily_collect' }),
      col('import_batch_id'),
      col('raw', { notNull: true, default: {} }),
      col('created_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['post_id', 'metric_date', 'source']],
    primaryKey: ['id'],
    generatedValues: {
      engagement_total: (r) => num(r.likes) + num(r.comments) + num(r.shares),
      engagement_score: (r) => num(r.likes) + num(r.comments) * 3 + num(r.shares) * 4,
    },
  },

  youtube_videos: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('account_id', { notNull: true }),
      col('video_id', { notNull: true }),
      col('video_url'),
      col('title'),
      col('description'),
      col('published_at'),
      col('thumbnail_url'),
      col('duration'),
      col('theme'),
      col('content_pillar'),
      col('classification_status', { notNull: true, check: ['pending', 'processing', 'classified', 'manual', 'error'], default: 'pending' }),
      col('classification_error'),
      col('raw', { notNull: true, default: {} }),
      col('created_at', { generatedByDefault: true }),
      col('updated_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['video_id']],
    primaryKey: ['id'],
  },

  youtube_video_daily_metrics: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('video_id', { notNull: true }),
      col('metric_date', { notNull: true, default: '__current_date__' }),
      col('views', { notNull: true, default: 0, min: 0 }),
      col('likes', { notNull: true, default: 0, min: 0 }),
      col('comments', { notNull: true, default: 0, min: 0 }),
      col('engagement_total', { generated: true }),
      col('engagement_rate', { generated: true }),
      col('source', { notNull: true, default: 'youtube_data_api' }), // no CHECK constraint
      col('raw', { notNull: true, default: {} }),
      col('created_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['video_id', 'metric_date', 'source']],
    primaryKey: ['id'],
    generatedValues: {
      engagement_total: (r) => num(r.likes) + num(r.comments),
      engagement_rate: (r) => (num(r.views) > 0 ? Number((((num(r.likes) + num(r.comments)) / num(r.views)) * 100).toFixed(2)) : null),
    },
  },

  account_daily_metrics: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('account_id', { notNull: true }),
      col('metric_date', { notNull: true, default: '__current_date__' }),
      col('followers', { nullable: true, min: 0 }),
      col('connections'),
      col('subscribers', { nullable: true, min: 0 }),
      col('total_views', { nullable: true, min: 0 }),
      col('total_posts', { nullable: true, min: 0 }),
      col('total_videos', { nullable: true, min: 0 }),
      col('source', { notNull: true, default: 'automated' }), // no CHECK constraint
      col('raw', { notNull: true, default: {} }),
      col('created_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['account_id', 'metric_date', 'source']],
    primaryKey: ['id'],
  },

  import_batches: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('source', { notNull: true }),
      col('platform', { notNull: true }),
      col('owner_name'),
      col('file_name'),
      col('collected_at'),
      col('imported_at', { generatedByDefault: true }),
      col('total_items', { notNull: true, default: 0, min: 0 }),
      col('imported_items', { notNull: true, default: 0, min: 0 }),
      col('skipped_items', { notNull: true, default: 0, min: 0 }),
      col('status', { notNull: true, check: ['running', 'success', 'partial', 'failed'], default: 'success' }),
      col('error_message'),
      col('notes'),
      col('raw_metadata', { notNull: true, default: {} }),
    ],
    unique: [['id']],
    primaryKey: ['id'],
  },

  collection_runs: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('source', { notNull: true }),
      col('status', { notNull: true, check: ['running', 'success', 'partial', 'failed'] }),
      col('started_at', { generatedByDefault: true }),
      col('finished_at'),
      col('accounts_processed', { notNull: true, default: 0, min: 0 }),
      col('items_processed', { notNull: true, default: 0, min: 0 }),
      col('error_message'),
      col('raw', { notNull: true, default: {} }),
    ],
    unique: [['id']],
    primaryKey: ['id'],
  },

  instagram_posts: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('account_id', { notNull: true }),
      col('external_post_id', { notNull: true }),
      col('post_url'),
      col('shortcode'),
      col('published_at'),
      col('caption', { notNull: true, default: '' }),
      col('hook'),
      col('format', { check: ['image', 'carousel', 'reel', 'video', 'story', 'unknown'], nullable: true }),
      col('theme'),
      col('content_pillar'),
      col('cta_keyword'),
      col('is_repost', { notNull: true, default: false }),
      col('media_url'),
      col('media_type'),
      col('classification_status', { notNull: true, check: ['pending', 'processing', 'classified', 'manual', 'error'], default: 'pending' }),
      col('classification_error'),
      col('raw', { notNull: true, default: {} }),
      col('created_at', { generatedByDefault: true }),
      col('updated_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['external_post_id']],
    primaryKey: ['id'],
  },

  instagram_post_daily_metrics: {
    columns: [
      col('id', { generatedByDefault: true }),
      col('post_id', { notNull: true }),
      col('metric_date', { notNull: true, default: '__current_date__' }),
      col('likes', { notNull: true, default: 0, min: 0 }),
      col('comments', { notNull: true, default: 0, min: 0 }),
      col('shares', { notNull: true, default: 0, min: 0 }),
      col('saves', { notNull: true, default: 0, min: 0 }),
      col('views', { nullable: true, min: 0 }),
      col('plays', { nullable: true, min: 0 }),
      col('reach', { nullable: true, min: 0 }),
      col('engagement_total', { generated: true }),
      col('engagement_score', { generated: true }),
      col('source', { notNull: true, default: 'apify_instagram' }), // no CHECK constraint
      col('raw', { notNull: true, default: {} }),
      col('created_at', { generatedByDefault: true }),
    ],
    unique: [['id'], ['post_id', 'metric_date', 'source']],
    primaryKey: ['id'],
    generatedValues: {
      engagement_total: (r) => num(r.likes) + num(r.comments) + num(r.shares) + num(r.saves),
      engagement_score: (r) => num(r.likes) + num(r.comments) * 3 + num(r.shares) * 4 + num(r.saves) * 2,
    },
  },
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function tableNames() {
  return Object.keys(TABLES);
}

export function columnNames(table) {
  const spec = TABLES[table];
  if (!spec) return null;
  return spec.columns.map((c) => c.name);
}

export function columnSpec(table, column) {
  return TABLES[table]?.columns.find((c) => c.name === column) || null;
}

// Columns a client is allowed to WRITE (excludes generated columns, which Postgres rejects on insert).
export function writableColumns(table) {
  const spec = TABLES[table];
  if (!spec) return null;
  return spec.columns.filter((c) => !c.generated).map((c) => c.name);
}

// Validate a row a collector intends to write. Returns { ok, errors: [...] }.
// This mirrors what Postgres would reject at INSERT/UPSERT time.
export function validateRow(table, row) {
  const spec = TABLES[table];
  if (!spec) return { ok: false, errors: [`unknown table "${table}"`] };
  const errors = [];
  const allowed = new Set(spec.columns.map((c) => c.name));

  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) {
      errors.push(`column "${key}" does not exist on ${table}`);
      continue;
    }
    const c = spec.columns.find((x) => x.name === key);
    if (c.generated) errors.push(`cannot write generated column "${key}" on ${table}`);
  }

  for (const c of spec.columns) {
    if (c.generated || c.generatedByDefault) continue;
    const present = Object.prototype.hasOwnProperty.call(row, c.name);
    const value = row[c.name];
    const hasDefault = Object.prototype.hasOwnProperty.call(c, 'default');

    if (c.notNull && !hasDefault && (!present || value === null || value === undefined)) {
      errors.push(`null value in NOT NULL column "${c.name}" on ${table}`);
    }
    if (c.notNull && present && value === null) {
      errors.push(`null value in NOT NULL column "${c.name}" on ${table}`);
    }
    if (present && value !== null && value !== undefined) {
      if (c.check && !c.check.includes(value)) {
        errors.push(`value "${value}" violates CHECK on ${table}.${c.name} (allowed: ${c.check.join(', ')})`);
      }
      if (typeof c.min === 'number' && Number(value) < c.min) {
        errors.push(`value ${value} violates CHECK ${table}.${c.name} >= ${c.min}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
