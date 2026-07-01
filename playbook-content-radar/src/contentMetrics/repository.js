import bundledHistory from './data/linkedin-history.json';
import bundledYoutubeHistory from './data/youtube-history.json';

const empty = {
  youtube: bundledYoutubeHistory.records || [],
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

    const [youtubeResult, accountsResult, importsResult, runsResult, growthResult] = await Promise.all([
      supabase.from('v_latest_youtube_video_metrics').select('*'),
      supabase.from('content_accounts').select('*'),
      supabase.from('import_batches').select('*'),
      supabase.from('collection_runs').select('*'),
      supabase.from('v_account_growth').select('*'),
    ]);

    return {
      source: 'supabase',
      linkedin: linkedinResult.data || [],
      youtube: youtubeResult.data?.length ? youtubeResult.data : (bundledYoutubeHistory.records || []),
      accounts: accountsResult.data || [],
      imports: importsResult.data || [],
      runs: runsResult.data || [],
      growth: growthResult.data || [],
      freshness: latestDate(linkedinResult.data || []),
      warning: [youtubeResult, accountsResult, importsResult, runsResult, growthResult]
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
