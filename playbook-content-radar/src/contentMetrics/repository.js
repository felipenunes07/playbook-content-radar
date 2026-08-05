import bundledHistory from './data/linkedin-history.json';
import bundledYoutubeHistory from './data/youtube-history.json';
import bundledInstagramHistory from './data/instagram-history.json';

const empty = {
  youtube: [],
  instagram: [],
  accounts: [],
  imports: [],
  runs: [],
  growth: [],
  prospecting: [],
  leads: [],
  leadOutreach: [],
  leadComments: [],
  prospectSettings: null,
  goals: [],
  bookings: [],
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const cacheByClient = new WeakMap();

const LEAD_COLUMNS = [
  'id',
  'first_seen_post_id',
  'full_name',
  'public_identifier',
  'profile_url',
  'score',
  'headline',
  'job_title',
  'company_name',
  'company_size',
  'area',
  'seniority',
  'enrichment_status',
  'qualification_status',
  'qualification_reason',
  'suggested_angle',
  'created_at',
].join(', ');

const LEAD_POST_COLUMNS = [
  'id',
  'external_post_id',
  'owner_name',
  'author_name',
  'published_at',
  'hook',
  'content',
  'format',
  'media_url',
  'media_type',
  'is_repost',
  'repost_id',
].join(', ');

function localSnapshot(fallback, warning, { loadError = false } = {}) {
  return {
    source: 'local_snapshot',
    linkedin: withoutReposts(fallback.records),
    ...empty,
    youtube: bundledYoutubeHistory.records || [],
    instagram: bundledInstagramHistory.records || [],
    freshness: fallback.collected_at || null,
    warning,
    loadError,
  };
}

function clientCache(supabase) {
  let cache = cacheByClient.get(supabase);
  if (!cache) {
    cache = new Map();
    cacheByClient.set(supabase, cache);
  }
  return cache;
}

function queryPlan(supabase, mode) {
  const queries = new Map();
  const add = (key, query) => queries.set(key, query);

  if (mode !== 'goals') {
    add('linkedin', supabase
      .from('v_latest_linkedin_post_metrics')
      .select(mode === 'leads' ? LEAD_POST_COLUMNS : '*'));
  }

  if (mode === 'full') {
    add('youtube', supabase.from('v_latest_youtube_video_metrics').select('*'));
    add('instagram', supabase.from('v_latest_instagram_post_metrics').select('*'));
    add('accounts', supabase.from('content_accounts').select('*'));
    add('imports', supabase.from('import_batches').select('*'));
    add('runs', supabase.from('collection_runs').select('id, source, started_at, accounts_processed, items_processed, status, error_message'));
    add('accountMetrics', supabase.from('account_daily_metrics').select('*'));
    add('goals', supabase.from('content_goals').select('*'));
    add('bookings', supabase.from('lead_magnet_bookings').select('booking_uid, lead_magnet, lead_name, lead_email, status, trigger_event, start_time, created_at, utm_source, utm_campaign'));
  } else if (mode === 'prospecting') {
    add('prospecting', supabase.from('v_post_prospecting_stats').select('*'));
  } else if (mode === 'leads') {
    add('leads', supabase.from('leads').select(LEAD_COLUMNS));
    add('leadOutreach', supabase.from('lead_outreach').select('lead_id, status, generated_message'));
    add('leadComments', supabase.from('lead_comments').select('lead_id, post_id, comment_text, commented_at, created_at'));
    add('prospectSettings', supabase.from('prospect_settings').select('icp_rules, message_template'));
  } else if (mode === 'goals') {
    add('accounts', supabase.from('content_accounts').select('*'));
    add('accountMetrics', supabase.from('account_daily_metrics').select('*'));
    add('goals', supabase.from('content_goals').select('*'));
  }

  return queries;
}

async function fetchContentMetrics({ supabase, fallback, mode }) {
  try {
    const queries = queryPlan(supabase, mode);
    const entries = await Promise.all([...queries.entries()].map(async ([key, query]) => [key, await query]));
    const results = Object.fromEntries(entries);
    const failed = entries.find(([, result]) => result.error);
    if (failed) {
      const [key, result] = failed;
      throw new Error(`${key}: ${result.error.message || 'Falha ao carregar dados'}`);
    }

    const accounts = results.accounts?.data || [];
    const linkedin = withoutReposts(results.linkedin?.data || []);
    const growth = buildAccountGrowth(results.accountMetrics?.data || [], accounts);

    return {
      source: 'supabase',
      ...empty,
      linkedin,
      youtube: results.youtube?.data?.length ? results.youtube.data : (mode === 'full' ? bundledYoutubeHistory.records || [] : []),
      instagram: results.instagram?.data?.length ? results.instagram.data : (mode === 'full' ? bundledInstagramHistory.records || [] : []),
      accounts,
      imports: results.imports?.data || [],
      runs: results.runs?.data || [],
      growth,
      prospecting: results.prospecting?.data || [],
      leads: (results.leads?.data || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      leadOutreach: results.leadOutreach?.data || [],
      leadComments: results.leadComments?.data || [],
      prospectSettings: results.prospectSettings?.data?.[0] || null,
      goals: results.goals?.data || [],
      bookings: (results.bookings?.data || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      freshness: latestDate(linkedin),
      warning: null,
      loadError: false,
    };
  } catch (error) {
    return localSnapshot(fallback, error instanceof Error ? error.message : String(error), { loadError: true });
  }
}

function latestDate(rows, fallback) {
  return rows.reduce((latest, row) => {
    const candidate = row.metric_date || row.published_at;
    return candidate && (!latest || candidate > latest) ? candidate : latest;
  }, fallback || null);
}

const generatedAccountGrowthSources = new Set(['historical_json', 'historical_import']);

// Reposts não contam como conteúdo próprio (engagement pertence ao post original).
// A view do Supabase já os exclui; este filtro garante o mesmo no snapshot local.
function withoutReposts(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !(row.is_repost || row.format === 'repost'));
}

function buildAccountGrowth(metrics = [], accounts = []) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return (Array.isArray(metrics) ? metrics : [])
    .map((metric) => {
      const account = accountById.get(metric.account_id);
      if (!account) return null;
      return {
        ...metric,
        owner_name: account.owner_name,
        platform: account.platform,
        account_name: account.account_name,
        account_url: account.account_url,
      };
    })
    .filter(Boolean)
    .filter((row) => !generatedAccountGrowthSources.has(row.source))
    .sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
}

export async function loadContentMetrics({ supabase, fallback = bundledHistory, mode = 'full', force = false } = {}) {
  if (!supabase) {
    return localSnapshot(fallback, 'Supabase não configurado', { loadError: mode !== 'full' });
  }

  const cache = clientCache(supabase);
  const cached = cache.get(mode);
  if (!force && cached?.data && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.data;
  if (cached?.inFlight) return cached.inFlight;

  const inFlight = fetchContentMetrics({ supabase, fallback, mode }).then((result) => {
    if (!result.loadError) cache.set(mode, { data: result, savedAt: Date.now(), inFlight: null });
    return result;
  }).finally(() => {
    const current = cache.get(mode);
    if (current?.inFlight === inFlight) cache.set(mode, { ...current, inFlight: null });
  });

  cache.set(mode, { ...cached, inFlight });
  return inFlight;
}

export { bundledHistory };
