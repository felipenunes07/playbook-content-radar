import { describe, expect, it } from 'vitest';
import {
  aggregateContentMetrics,
  buildCreatorComparison,
  buildMonthlyTrend,
  aggregateYoutubeMetrics,
  filterContent,
  filterYoutube,
  groupPerformance,
  rankContent,
} from './analytics.js';

const posts = [
  { external_post_id: '1', owner_name: 'Victor Baggio', published_at: '2026-01-10T10:00:00Z', format: 'image', theme: 'IA', cta_keyword: 'MAPS', likes: 100, comments: 10, shares: 2, engagement_total: 112, engagement_score: 138 },
  { external_post_id: '2', owner_name: 'Fernando Tedesco', published_at: '2026-01-20T10:00:00Z', format: 'text', theme: 'Vendas', cta_keyword: null, likes: 50, comments: 20, shares: 5, engagement_total: 75, engagement_score: 130 },
  { external_post_id: '3', owner_name: 'Victor Baggio', published_at: '2026-02-05T10:00:00Z', format: 'video', theme: 'IA', cta_keyword: 'MCP', likes: 20, comments: 2, shares: 1, engagement_total: 23, engagement_score: 30 },
];

describe('filterContent', () => {
  it('combines person, date, format, theme, CTA and free text filters', () => {
    expect(filterContent(posts, {
      owner: 'Victor Baggio', from: '2026-01-01', to: '2026-01-31', format: 'image', theme: 'IA', cta: 'MAPS', search: 'victor',
    }).map((post) => post.external_post_id)).toEqual(['1']);
  });

  it('filters funnel stage and commercial intent', () => {
    const classified = posts.map((post, index) => ({ ...post, funnel_stage: index ? 'awareness' : 'lead_magnet', commercial_intent: index ? 'low' : 'high' }));
    expect(filterContent(classified, { funnelStage: 'lead_magnet', commercialIntent: 'high' }).map((post) => post.external_post_id)).toEqual(['1']);
  });

  it('returns all rows for empty filters and none for a non-matching selection', () => {
    expect(filterContent(posts, {})).toHaveLength(3);
    expect(filterContent(posts, { owner: 'Felipe' })).toEqual([]);
  });
});

describe('YouTube analytics', () => {
  const videos = [
    { video_id: 'y1', owner_name: 'Victor Baggio', title: 'Agentes IA', published_at: '2026-06-01', theme: 'IA', views: 1200, likes: 80, comments: 12, engagement_total: 92, engagement_rate: 7.67 },
    { video_id: 'y2', owner_name: 'Fernando Tedesco', title: 'Vendas', published_at: '2026-05-01', theme: 'Vendas', views: 800, likes: 40, comments: 8, engagement_total: 48, engagement_rate: 6 },
  ];

  it('filters by channel, period, video and theme', () => {
    expect(filterYoutube(videos, { owner: 'Victor Baggio', from: '2026-06-01', to: '2026-06-30', theme: 'IA', search: 'agentes' }).map((video) => video.video_id)).toEqual(['y1']);
  });

  it('calculates public YouTube totals and rate', () => {
    expect(aggregateYoutubeMetrics(videos)).toEqual({ videos: 2, views: 2000, likes: 120, comments: 20, engagement: 140, engagementRate: 7 });
  });
});

describe('aggregateContentMetrics', () => {
  it('calculates all LinkedIn totals and per-post averages', () => {
    expect(aggregateContentMetrics(posts)).toEqual({
      contentCount: 3,
      likes: 170,
      comments: 32,
      shares: 8,
      engagementTotal: 210,
      engagementScore: 298,
      averageLikes: 56.67,
      averageComments: 10.67,
      averageShares: 2.67,
      withCta: 2,
      withoutCta: 1,
    });
  });

  it('returns stable zeros for an empty selection', () => {
    expect(aggregateContentMetrics([])).toMatchObject({ contentCount: 0, engagementTotal: 0, averageComments: 0 });
  });
});

describe('trend and rankings', () => {
  it('groups chronologically by month without mixing creators', () => {
    expect(buildMonthlyTrend(posts)).toEqual([
      { period: '2026-01', label: 'jan. 26', posts: 2, likes: 150, comments: 30, shares: 7, engagement: 187, score: 268 },
      { period: '2026-02', label: 'fev. 26', posts: 1, likes: 20, comments: 2, shares: 1, engagement: 23, score: 30 },
    ]);
  });

  it('compares creators and ranks content by requested metric', () => {
    expect(buildCreatorComparison(posts)[0]).toMatchObject({ owner: 'Victor Baggio', posts: 2, engagement: 135 });
    expect(rankContent(posts, 'comments', 2).map((post) => post.external_post_id)).toEqual(['2', '1']);
    expect(rankContent(posts, 'engagement_score', 2).map((post) => post.external_post_id)).toEqual(['1', '2']);
  });

  it('groups format, theme and CTA performance with averages', () => {
    expect(groupPerformance(posts, 'theme')[0]).toEqual({ key: 'IA', posts: 2, engagement: 135, comments: 12, score: 168, averageScore: 84 });
    expect(groupPerformance(posts, 'cta_keyword').map((row) => row.key)).toEqual(['MAPS', 'Sem CTA', 'MCP']);
  });
});
