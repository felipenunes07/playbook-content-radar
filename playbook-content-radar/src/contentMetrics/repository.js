import bundledHistory from './data/linkedin-history.json';
import bundledYoutubeHistory from './data/youtube-history.json';
import bundledInstagramHistory from './data/instagram-history.json';

const empty = {
  youtube: bundledYoutubeHistory.records || [],
  instagram: bundledInstagramHistory.records || [],
  accounts: [],
  imports: [],
  runs: [],
  growth: [],
};

function latestDate(rows, fallback) {
  return rows.reduce((latest, row) => {
    const candidate = row.metric_date || row.published_at;
    return candidate && (!latest || candidate > latest) ? candidate : latest;
  }, fallback || null);
}

const generatedAccountGrowthSources = new Set(['historical_json', 'historical_import']);

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

export async function loadContentMetrics({ supabase, fallback = bundledHistory } = {}) {
  if (!supabase) {
    return {
      source: 'local_snapshot',
      linkedin: fallback.records || [],
      ...empty,
      freshness: fallback.collected_at || null,
      warning: 'Supabase não configurado',
    };
  }

  try {
    const linkedinResult = await supabase.from('v_latest_linkedin_post_metrics').select('*');
    if (linkedinResult.error) throw new Error(linkedinResult.error.message || 'Falha ao ler métricas do LinkedIn');

    const [youtubeResult, instagramResult, accountsResult, importsResult, runsResult, accountMetricsResult] = await Promise.all([
      supabase.from('v_latest_youtube_video_metrics').select('*'),
      supabase.from('v_latest_instagram_post_metrics').select('*'),
      supabase.from('content_accounts').select('*'),
      supabase.from('import_batches').select('*'),
      supabase.from('collection_runs').select('*'),
      supabase.from('account_daily_metrics').select('*'),
    ]);
    const accounts = accountsResult.data || [];
    const growth = buildAccountGrowth(accountMetricsResult.data || [], accounts);

    return {
      source: 'supabase',
      linkedin: linkedinResult.data || [],
      youtube: youtubeResult.data?.length ? youtubeResult.data : (bundledYoutubeHistory.records || []),
      instagram: instagramResult.data?.length ? instagramResult.data : (bundledInstagramHistory.records || []),
      accounts,
      imports: importsResult.data || [],
      runs: runsResult.data || [],
      growth,
      freshness: latestDate(linkedinResult.data || []),
      warning: [youtubeResult, accountsResult, importsResult, runsResult, accountMetricsResult]
        .map((result) => result.error?.message)
        .filter(Boolean)
        .join(' · ') || null,
    };
  } catch (error) {
    return {
      source: 'local_snapshot',
      linkedin: fallback.records || [],
      ...empty,
      freshness: fallback.collected_at || null,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export { bundledHistory };
