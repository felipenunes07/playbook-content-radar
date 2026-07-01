// CONTRACT FUZZ: feed messy, adversarial Apify-shaped payloads through the REAL shared
// normalizers (the exact code the edge functions run) and assert every row they emit is
// one the database will actually accept — right columns, valid CHECK enums, non-negative
// metrics, no writes to generated columns. If a normalizer can ever produce a row the DB
// would reject, the sync silently drops that item; this test makes that impossible to ship.

import { describe, it, expect } from 'vitest';
import { normalizeApifyPost, normalizeApifyYouTubeVideo } from '../../supabase/functions/_shared/content.ts';
import { validateRow } from './schema.js';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const POST_ID = '00000000-0000-0000-0000-000000000002';

// A deliberately hostile matrix of LinkedIn Apify items.
const LINKEDIN_ITEMS = [
  { id: '7000000000000000001', linkedinUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000001/', content: 'Olá\nsegunda linha', engagement: { likes: 10, comments: 2, shares: 1 } },
  { urn: 'urn:li:activity:7000000000000000002', url: 'https://x/activity-7000000000000000002', text: 'comenta "PLAYBOOK" pra receber', likeCount: '1.234', commentCount: 5 },
  { entityId: 7000000000000000003, postUrl: 'https://x/activity:7000000000000000003', postVideo: { url: 'https://v/x.mp4' }, stats: { likes: -5, comments: 'abc', shares: null } },
  { id: 'abc', link: 'https://x/p/abc', postImages: ['a', 'b', 'c'], reactionCount: 999999999999, views: '2,5 mil' },
  { id: 'rp1', linkedinUrl: 'https://x/activity-9', repostId: 'orig1', content: '' },
  { id: 'noviews', linkedinUrl: 'https://x/activity-10', content: 'x', views: null },
  { id: 'weird', linkedinUrl: 'https://x/activity-11', content: 'x'.repeat(5000), engagement: { reactions: [{ count: 3 }, { count: 'nope' }, { count: -2 }] } },
];

const YOUTUBE_ITEMS = [
  { id: 'vid00000001', title: 'Título', description: 'desc', viewCount: '10.000', likes: 50, commentsCount: 3, date: '2026-06-01' },
  { url: 'https://www.youtube.com/watch?v=vid00000002', title: 'x', views: -10, likeCount: 'NaN' },
  { url: 'https://youtu.be/vid00000003', name: 'y' },
  { url: 'https://youtube.com/shorts/vid00000004', title: 'short', viewCount: 999999999999999 },
  { videoId: 'vid00000005', title: '', description: '', publishedAt: 'not-a-real-date' },
];

describe('normalizeApifyPost emits DB-valid content_posts + content_post_daily_metrics rows', () => {
  for (const [i, item] of LINKEDIN_ITEMS.entries()) {
    it(`LinkedIn item #${i} normalizes to schema-valid rows`, () => {
      let out;
      try {
        out = normalizeApifyPost(item, '2026-07-01');
      } catch (e) {
        // Items without any usable identity are expected to throw and be skipped upstream.
        expect(String(e.message)).toMatch(/identidade|id/i);
        return;
      }
      const postCheck = validateRow('content_posts', { ...out.post, account_id: ACCOUNT_ID });
      expect(postCheck.errors, `content_posts row invalid for item #${i}`).toEqual([]);

      const metricCheck = validateRow('content_post_daily_metrics', { ...out.metric, post_id: POST_ID });
      expect(metricCheck.errors, `content_post_daily_metrics row invalid for item #${i}`).toEqual([]);

      // Metrics must never be negative (DB CHECK >= 0).
      for (const k of ['likes', 'comments', 'shares', 'reactions_total']) {
        expect(out.metric[k], `${k} must be >= 0`).toBeGreaterThanOrEqual(0);
      }
      expect(out.metric.views === null || out.metric.views >= 0).toBe(true);
    });
  }
});

describe('normalizeApifyYouTubeVideo emits DB-valid youtube rows', () => {
  for (const [i, item] of YOUTUBE_ITEMS.entries()) {
    it(`YouTube item #${i} normalizes to schema-valid rows`, () => {
      let out;
      try {
        out = normalizeApifyYouTubeVideo(item, '2026-07-01');
      } catch (e) {
        expect(String(e.message)).toMatch(/id/i);
        return;
      }
      const videoCheck = validateRow('youtube_videos', { ...out.video, account_id: ACCOUNT_ID });
      expect(videoCheck.errors, `youtube_videos row invalid for item #${i}`).toEqual([]);

      const metricCheck = validateRow('youtube_video_daily_metrics', { ...out.metric, video_id: POST_ID });
      expect(metricCheck.errors, `youtube_video_daily_metrics row invalid for item #${i}`).toEqual([]);

      for (const k of ['views', 'likes', 'comments']) {
        expect(out.metric[k], `${k} must be >= 0`).toBeGreaterThanOrEqual(0);
      }
    });
  }
});
