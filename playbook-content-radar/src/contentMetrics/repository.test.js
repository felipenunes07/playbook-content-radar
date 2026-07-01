import { describe, expect, it } from 'vitest';
import { loadContentMetrics } from './repository.js';

function fakeSupabase(results) {
  return {
    from(name) {
      return {
        select() {
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
        v_account_growth: { data: [{ account_id: 'account' }], error: null },
      }),
      fallback: { records: [{ id: 'local' }], collected_at: '2026-05-12' },
    });

    expect(result.source).toBe('supabase');
    expect(result.linkedin).toEqual([{ id: 'db-post' }]);
    expect(result.youtube).toEqual([{ id: 'db-video' }]);
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
      youtube: [],
      freshness: '2026-05-12',
      warning: 'relation does not exist',
    });
  });
});
