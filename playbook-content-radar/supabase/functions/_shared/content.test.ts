import { describe, expect, it } from 'vitest';
import {
  chunk,
  normalizeApifyPost,
  normalizeApifyYouTubeVideo,
  normalizeYouTubeVideo,
  parseApifyInput,
  validateClassification,
} from './content.ts';

describe('normalizeYouTubeVideo', () => {
  it('normalizes Apify YouTube scraper output without requiring Google API shape', () => {
    const result = normalizeApifyYouTubeVideo({
      id: 'apify-video-id',
      url: 'https://www.youtube.com/watch?v=apify-video-id',
      title: 'Playbook no YouTube',
      text: 'Descrição pública',
      date: '2026-06-20T12:00:00Z',
      thumbnailUrl: 'https://img.youtube.com/vi/apify-video-id/hqdefault.jpg',
      duration: '00:12:30',
      viewCount: '1500',
      likes: 90,
      commentsCount: 14,
    }, '2026-07-01');

    expect(result.video).toMatchObject({ video_id: 'apify-video-id', title: 'Playbook no YouTube', video_url: 'https://www.youtube.com/watch?v=apify-video-id' });
    expect(result.metric).toMatchObject({ metric_date: '2026-07-01', views: 1500, likes: 90, comments: 14, source: 'apify_youtube' });
  });

  it('normalizes public metadata and statistics without inventing values', () => {
    expect(normalizeYouTubeVideo({
      id: 'abc123',
      snippet: {
        title: 'Agentes de IA', description: 'Descrição', publishedAt: '2026-06-01T10:00:00Z',
        thumbnails: { high: { url: 'https://img.test/high.jpg' } },
      },
      contentDetails: { duration: 'PT12M30S' },
      statistics: { viewCount: '1200', likeCount: '80', commentCount: '12' },
    })).toEqual({
      video: expect.objectContaining({ video_id: 'abc123', video_url: 'https://www.youtube.com/watch?v=abc123', title: 'Agentes de IA', duration: 'PT12M30S' }),
      metric: expect.objectContaining({ views: 1200, likes: 80, comments: 12, source: 'youtube_data_api' }),
    });
  });
});

describe('normalizeApifyPost', () => {
  it('maps actor output to a LinkedIn entity and daily snapshot', () => {
    const result = normalizeApifyPost({
      id: '9999999999999999', linkedinUrl: 'https://linkedin.com/posts/x_activity-9999999999999999',
      content: 'Hook real', author: { name: 'Victor Baggio', publicIdentifier: 'victorzbaggio' },
      postedAt: { date: '2026-06-30T10:00:00Z' }, engagement: { likes: 20, comments: 4, shares: 2 },
    }, '2026-07-01');
    expect(result.post).toMatchObject({ external_post_id: '9999999999999999', hook: 'Hook real', author_name: 'Victor Baggio' });
    expect(result.metric).toMatchObject({ metric_date: '2026-07-01', source: 'apify_linkedin', metric_type: 'daily_collect' });
  });

  it('accepts HarvestAPI no-cookie LinkedIn fields', () => {
    const result = normalizeApifyPost({
      postId: 'urn:li:activity:1234567890123456',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456/',
      text: 'Comenta "MAPS" que eu mando o material',
      authorName: 'Fernando Tedesco',
      postedDate: '2026-06-29T08:30:00Z',
      likeCount: '40',
      commentCount: '12',
      repostCount: '3',
    }, '2026-07-01');

    expect(result.post).toMatchObject({ hook: 'Comenta "MAPS" que eu mando o material', cta_keyword: 'MAPS', author_name: 'Fernando Tedesco' });
    expect(result.metric).toMatchObject({ likes: 40, comments: 12, shares: 3, source: 'apify_linkedin' });
  });
});

describe('collector helpers', () => {
  it('chunks API batches and renders an actor input template', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(parseApifyInput('{"profileUrls":["{{accountUrl}}"]}', 'https://linkedin.com/in/victor')).toEqual({ profileUrls: ['https://linkedin.com/in/victor'] });
  });

  it('validates classification enums and rejects malformed model output', () => {
    expect(validateClassification({ theme: 'IA', content_pillar: 'IA & LLMs', cta_keyword: 'MAPS', funnel_stage: 'lead_magnet', commercial_intent: 'high' })).toMatchObject({ theme: 'IA', commercial_intent: 'high' });
    expect(() => validateClassification({ theme: 'Crypto', content_pillar: 'Outro', funnel_stage: 'viral', commercial_intent: 'extreme' })).toThrow(/classificação/i);
  });
});