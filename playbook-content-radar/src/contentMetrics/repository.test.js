import { describe, expect, it } from 'vitest';
import { loadContentMetrics } from './repository.js';
import bundledYoutubeHistory from './data/youtube-history.json';

function fakeSupabase(results, calls = []) {
  return {
    from(name) {
      return {
        select(columns = '*') {
          calls.push({ name, columns });
          return Promise.resolve(results[name] || { data: [], error: null });
        },
      };
    },
  };
}

describe('loadContentMetrics', () => {
  it('uses Supabase as the authoritative source when the metrics view exists', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'db-post' }], error: null },
        v_latest_youtube_video_metrics: { data: [{ id: 'db-video' }], error: null },
        content_accounts: { data: [{ id: 'account' }], error: null },
        import_batches: { data: [{ id: 'import' }], error: null },
        collection_runs: { data: [{ id: 'run' }], error: null },
        account_daily_metrics: { data: [{ account_id: 'account', metric_date: '2026-07-01', followers: 123, source: 'apify_linkedin_profile' }], error: null },
      }),
      fallback: { records: [{ id: 'local' }], collected_at: '2026-05-12' },
    });

    expect(result.source).toBe('supabase');
    expect(result.linkedin).toEqual([{ id: 'db-post' }]);
    expect(result.youtube).toEqual([{ id: 'db-video' }]);
  });

  it('does not treat generated historical account growth as real audience data', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'db-post' }], error: null },
        v_latest_youtube_video_metrics: { data: [], error: null },
        content_accounts: { data: [
          { id: 'linkedin-fernando', owner_name: 'Fernando Tedesco', platform: 'linkedin', account_name: 'Fernando LinkedIn', account_url: 'https://www.linkedin.com/in/fernando-tedesco/' },
          { id: 'youtube-fernando', owner_name: 'Fernando Tedesco', platform: 'youtube', account_name: 'Fernando YouTube', account_url: 'https://www.youtube.com/@fernando_tedesco' },
        ], error: null },
        import_batches: { data: [], error: null },
        collection_runs: { data: [], error: null },
        account_daily_metrics: { data: [
          { account_id: 'linkedin-fernando', metric_date: '2026-06-26', followers: 12450, source: 'historical_json' },
          { account_id: 'linkedin-fernando', metric_date: '2026-06-27', followers: 12501, source: 'apify_linkedin_profile' },
          { account_id: 'youtube-fernando', metric_date: '2026-06-26', subscribers: 2890, total_views: 92000, source: 'historical_json' },
          { account_id: 'youtube-fernando', metric_date: '2026-06-27', subscribers: 2, total_views: null, total_videos: 3, source: 'public_youtube' },
        ], error: null },
      }),
      fallback: { records: [], collected_at: '2026-05-12' },
    });

    expect(result.growth).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'linkedin-fernando', owner_name: 'Fernando Tedesco', platform: 'linkedin', followers: 12501, source: 'apify_linkedin_profile' }),
      expect.objectContaining({ account_id: 'youtube-fernando', owner_name: 'Fernando Tedesco', platform: 'youtube', subscribers: 2, total_videos: 3, source: 'public_youtube' }),
    ]));
    expect(result.growth).toHaveLength(2);
    expect(result.growth).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'linkedin-fernando', followers: 12450, source: 'historical_json' }),
      expect.objectContaining({ account_id: 'youtube-fernando', subscribers: 2890, source: 'historical_json' }),
    ]));
  });

  it('falls back to the bundled historical snapshot when the schema is unavailable', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: null, error: { message: 'relation does not exist' } },
      }),
      fallback: { records: [{ id: 'local' }], collected_at: '2026-05-12' },
    });

    expect(result).toMatchObject({
      source: 'local_snapshot',
      linkedin: [{ id: 'local' }],
      youtube: bundledYoutubeHistory.records || [],
      growth: [],
      freshness: '2026-05-12',
      warning: 'linkedin: relation does not exist',
    });
  });

  it('loads only the lightweight data needed by the Leads ICP page', async () => {
    const calls = [];
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1', hook: 'Post' }], error: null },
        leads: { data: [{ id: 'lead-1', full_name: 'Lead', created_at: '2026-08-05' }], error: null },
      }, calls),
      mode: 'leads',
      force: true,
    });

    expect(result.source).toBe('supabase');
    expect(result.leads).toEqual([expect.objectContaining({ id: 'lead-1' })]);
    expect(calls.map((call) => call.name)).toEqual([
      'v_latest_linkedin_post_metrics',
      'leads',
      'lead_outreach',
      'lead_comments',
      'prospect_settings',
    ]);
    expect(calls.find((call) => call.name === 'leads')?.columns).not.toBe('*');
    expect(calls.find((call) => call.name === 'leads')?.columns).not.toContain('profile_raw');
    expect(calls.find((call) => call.name === 'leads')?.columns).not.toContain('company_raw');
  });

  it('marks a leads query failure instead of reporting an empty successful database', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1' }], error: null },
        leads: { data: null, error: { message: 'statement timeout' } },
      }),
      fallback: { records: [], collected_at: '2026-05-12' },
      mode: 'leads',
      force: true,
    });

    expect(result.source).toBe('local_snapshot');
    expect(result.loadError).toBe(true);
    expect(result.warning).toContain('leads: statement timeout');
  });
});
