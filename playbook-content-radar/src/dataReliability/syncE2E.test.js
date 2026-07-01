// END-TO-END sync test: runs the REAL normalizer through the collector write pattern
// against an in-memory Supabase that enforces the true schema (UNIQUE, CHECK, generated
// columns, onConflict, .single()). This exercises the exact failure modes the red-team
// found and locks in the fixes:
//   - one bad item must NOT abort the rest of the account (per-item isolation)
//   - re-collecting the same posts must be idempotent (no duplicate rows)
//   - re-collection must NOT reset a classified post back to 'pending'
//   - a post_url collision on the un-named UNIQUE must be contained to one item

import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeApifyPost } from '../../supabase/functions/_shared/content.ts';
import { createFakeSupabase } from './fakeSupabase.js';

const ACCOUNT_ID = 'acc-1';

function seededClient() {
  return createFakeSupabase({
    content_accounts: [{ id: ACCOUNT_ID, platform: 'linkedin', owner_name: 'Tester', account_url: 'https://in/tester', status: 'active' }],
  });
}

// Mirror of the FIXED collect-linkedin per-item write loop (strip classification_status,
// per-item try/catch). Keeping it here lets us test the write contract deterministically.
async function runLinkedInCollect(client, accountId, items, metricDate) {
  let itemsProcessed = 0;
  let itemErrors = 0;
  for (const item of items) {
    try {
      const normalized = normalizeApifyPost(item, metricDate);
      const { classification_status: _s, ...postFields } = normalized.post;
      const { data: savedPost, error: postError } = await client.from('content_posts')
        .upsert({ ...postFields, account_id: accountId }, { onConflict: 'external_post_id' }).select('id').single();
      if (postError) throw new Error(postError.message);
      const { error: metricError } = await client.from('content_post_daily_metrics')
        .upsert({ ...normalized.metric, post_id: savedPost.id }, { onConflict: 'post_id,metric_date,source' });
      if (metricError) throw new Error(metricError.message);
      itemsProcessed += 1;
    } catch {
      itemErrors += 1;
    }
  }
  return { itemsProcessed, itemErrors };
}

const baseItems = [
  { id: 'p1', linkedinUrl: 'https://in/activity-1', content: 'primeiro', engagement: { likes: 5, comments: 1, shares: 0 } },
  { id: 'p2', linkedinUrl: 'https://in/activity-2', content: 'segundo', engagement: { likes: 9, comments: 2, shares: 1 } },
  { id: 'p3', linkedinUrl: 'https://in/activity-3', content: 'terceiro', engagement: { likes: 3, comments: 0, shares: 0 } },
];

describe('LinkedIn collect end-to-end against schema-enforcing FakeSupabase', () => {
  let client;
  beforeEach(() => { client = seededClient(); });

  it('lands every valid post and its metric', async () => {
    const res = await runLinkedInCollect(client, ACCOUNT_ID, baseItems, '2026-07-01');
    expect(res).toEqual({ itemsProcessed: 3, itemErrors: 0 });
    expect(client._dump('content_posts')).toHaveLength(3);
    expect(client._dump('content_post_daily_metrics')).toHaveLength(3);
    // generated columns are computed by the DB layer
    const m = client._dump('content_post_daily_metrics').find((r) => r.likes === 9);
    expect(m.engagement_total).toBe(12); // 9 + 2 + 1
    expect(m.engagement_score).toBe(9 + 2 * 3 + 1 * 4); // 19
  });

  it('is idempotent: re-collecting the same items creates no duplicate rows', async () => {
    await runLinkedInCollect(client, ACCOUNT_ID, baseItems, '2026-07-01');
    await runLinkedInCollect(client, ACCOUNT_ID, baseItems, '2026-07-01');
    expect(client._dump('content_posts')).toHaveLength(3);
    expect(client._dump('content_post_daily_metrics')).toHaveLength(3);
  });

  it('does NOT reset a classified post back to pending on re-collection', async () => {
    await runLinkedInCollect(client, ACCOUNT_ID, baseItems, '2026-07-01');
    // Simulate a classification having happened.
    await client.from('content_posts').update({ classification_status: 'classified', theme: 'IA' }).eq('external_post_id', 'p1');
    // Next day's collection.
    await runLinkedInCollect(client, ACCOUNT_ID, baseItems, '2026-07-02');
    const p1 = client._dump('content_posts').find((r) => r.external_post_id === 'p1');
    expect(p1.classification_status).toBe('classified');
    expect(p1.theme).toBe('IA');
  });

  it('captures a new daily metric snapshot per date without touching prior days', async () => {
    await runLinkedInCollect(client, ACCOUNT_ID, baseItems, '2026-07-01');
    await runLinkedInCollect(client, ACCOUNT_ID, baseItems, '2026-07-02');
    const p1 = client._dump('content_posts').find((r) => r.external_post_id === 'p1');
    const history = client._dump('content_post_daily_metrics').filter((r) => r.post_id === p1.id);
    expect(history.map((r) => r.metric_date).sort()).toEqual(['2026-07-01', '2026-07-02']);
  });

  it('contains a post_url collision to the single bad item (per-item isolation)', async () => {
    // p3b has a NEW external_post_id but the SAME post_url as p1 -> collides on UNIQUE(post_url)
    // which is not the onConflict target, so its insert throws. p4 must still land.
    const items = [
      baseItems[0], // p1 -> https://in/activity-1
      { id: 'p3b', linkedinUrl: 'https://in/activity-1', content: 'colisão de url', engagement: { likes: 1 } },
      { id: 'p4', linkedinUrl: 'https://in/activity-4', content: 'depois da colisão', engagement: { likes: 7 } },
    ];
    const res = await runLinkedInCollect(client, ACCOUNT_ID, items, '2026-07-01');
    expect(res.itemErrors).toBe(1);
    expect(res.itemsProcessed).toBe(2);
    // p1 and p4 landed; the colliding p3b did not.
    const ids = client._dump('content_posts').map((r) => r.external_post_id).sort();
    expect(ids).toEqual(['p1', 'p4']);
  });
});
