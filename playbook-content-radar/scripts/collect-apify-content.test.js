import { describe, expect, it } from 'vitest';
import {
  buildInstagramActorInput,
  buildLinkedInActorInput,
  buildYoutubeActorInput,
  latestDateByOwner,
  mergeInstagramSnapshot,
  mergeLinkedInSnapshot,
  mergeYoutubeSnapshot,
  normalizeApifyInstagramItem,
  normalizeHarvestLinkedInPost,
  normalizeApifyYoutubeItem,
} from './collect-apify-content.lib.js';

const instagramAccounts = [
  { ownerName: 'Victor Baggio', accountUrl: 'https://www.instagram.com/victor.baggio.ai/', handle: 'victor.baggio.ai' },
];

const linkedinAccounts = [
  { ownerName: 'Victor Baggio', accountUrl: 'https://www.linkedin.com/in/victorzbaggio/' },
  { ownerName: 'Fernando Tedesco', accountUrl: 'https://www.linkedin.com/in/fernando-tedesco/' },
];

describe('collect-apify-content helpers', () => {
  it('detects where LinkedIn collection stopped by owner', () => {
    expect(latestDateByOwner([
      { owner_name: 'Victor Baggio', published_at: '2026-05-01T00:00:00Z' },
      { owner_name: 'Victor Baggio', published_at: '2026-05-12T00:00:00Z' },
      { owner_name: 'Fernando Tedesco', published_at: '2026-04-20T00:00:00Z' },
    ])).toEqual({ 'Victor Baggio': '2026-05-12', 'Fernando Tedesco': '2026-04-20' });
  });

  it('builds no-cookie LinkedIn actor input from profile URL and since date', () => {
    expect(buildLinkedInActorInput(linkedinAccounts[0], { since: '2026-05-12', maxPosts: 80 })).toMatchObject({
      authorUrls: ['https://www.linkedin.com/in/victorzbaggio/'],
      postedLimitDate: '2026-05-12',
      maxPosts: 80,
      sortBy: 'date',
    });
  });

  it('builds YouTube channel actor input from channel URL and oldest date', () => {
    expect(buildYoutubeActorInput({ accountUrl: 'https://www.youtube.com/@VictorBaggio-AI' }, { since: '2026-01-01', maxVideos: 50 })).toMatchObject({
      startUrls: [{ url: 'https://www.youtube.com/@VictorBaggio-AI' }],
      oldestPostDate: '2026-01-01',
      maxResults: 50,
      maxResultsShorts: 50,
      sortVideosBy: 'NEWEST',
    });
  });

  it('normalizes HarvestAPI LinkedIn output into dashboard records', () => {
    const record = normalizeHarvestLinkedInPost({
      id: 'urn:li:activity:1234567890',
      url: 'https://www.linkedin.com/posts/victorzbaggio_x-activity-1234567890-x',
      text: 'Comenta MAPS para receber',
      postedAt: '2026-06-01T10:00:00Z',
      stats: { likeCount: 10, commentCount: 4, repostCount: 2 },
      author: { name: 'Victor Baggio', url: 'https://www.linkedin.com/in/victorzbaggio/' },
    }, linkedinAccounts[0], '2026-07-01');

    expect(record).toMatchObject({
      platform: 'linkedin',
      external_post_id: '1234567890',
      owner_name: 'Victor Baggio',
      cta_keyword: 'MAPS',
      likes: 10,
      comments: 4,
      shares: 2,
      engagement_score: 30,
    });
  });

  it('normalizes Apify YouTube output into dashboard records', () => {
    const record = normalizeApifyYoutubeItem({
      id: 'abc123',
      url: 'https://www.youtube.com/watch?v=abc123',
      title: 'Agentes IA',
      date: '2026-06-02T10:00:00Z',
      viewCount: 1500,
      likes: 90,
      commentsCount: 14,
      channelName: 'Victor Baggio AI',
      numberOfSubscribers: 1234,
    }, { ownerName: 'Victor Baggio', accountUrl: 'https://www.youtube.com/@VictorBaggio-AI' }, '2026-07-01');

    expect(record).toMatchObject({ video_id: 'abc123', owner_name: 'Victor Baggio', views: 1500, likes: 90, comments: 14, subscribers: 1234 });
  });

  it('builds Instagram actor input from profile URL and since date', () => {
    expect(buildInstagramActorInput(instagramAccounts[0], { since: '2026-05-12', maxPosts: 60 })).toMatchObject({
      directUrls: ['https://www.instagram.com/victor.baggio.ai/'],
      resultsType: 'posts',
      onlyPostsNewerThan: '2026-05-12',
      resultsLimit: 60,
    });
  });

  it('normalizes Apify Instagram output into dashboard records', () => {
    const record = normalizeApifyInstagramItem({
      shortCode: 'CabcDEF123',
      url: 'https://www.instagram.com/reel/CabcDEF123/',
      type: 'Video',
      productType: 'clips',
      caption: 'Comenta AGENTE para receber o material',
      timestamp: '2026-06-05T12:00:00Z',
      likesCount: 120,
      commentsCount: 30,
      videoPlayCount: 5000,
      ownerUsername: 'victor.baggio.ai',
      ownerFullName: 'Victor Baggio',
    }, instagramAccounts[0], '2026-07-01');

    expect(record).toMatchObject({
      platform: 'instagram',
      external_post_id: 'CabcDEF123',
      owner_name: 'Victor Baggio',
      author_identifier: 'victor.baggio.ai',
      format: 'reel',
      cta_keyword: 'AGENTE',
      likes: 120,
      comments: 30,
      views: 5000,
      engagement_total: 150,
      engagement_score: 210,
    });
  });

  it('derives Instagram id from url when shortCode is absent', () => {
    const record = normalizeApifyInstagramItem({
      url: 'https://www.instagram.com/p/XyZ789/',
      caption: 'Post',
      timestamp: '2026-06-05T12:00:00Z',
      likesCount: 1,
    }, instagramAccounts[0], '2026-07-01');
    expect(record.external_post_id).toBe('XyZ789');
    expect(record.format).toBe('image');
  });

  it('merges Instagram snapshot without duplicating existing records', () => {
    const merged = mergeInstagramSnapshot(
      { records: [{ external_post_id: 'a', owner_name: 'Victor Baggio', published_at: '2026-05-01T00:00:00Z' }] },
      [
        { external_post_id: 'a', owner_name: 'Victor Baggio', published_at: '2026-05-01T00:00:00Z' },
        { external_post_id: 'b', owner_name: 'Victor Baggio', published_at: '2026-06-01T00:00:00Z' },
      ],
      instagramAccounts,
    );
    expect(merged.records.map((row) => row.external_post_id)).toEqual(['b', 'a']);
    expect(merged.summary['Victor Baggio'].normalizedCount).toBe(2);
    expect(merged.source).toBe('apify_instagram');
  });

  it('merges snapshots without duplicating existing LinkedIn or YouTube records', () => {
    const linked = mergeLinkedInSnapshot({ records: [{ external_post_id: '1', owner_name: 'Victor Baggio', published_at: '2026-05-01T00:00:00Z' }] }, [{ external_post_id: '1', published_at: '2026-05-01T00:00:00Z' }, { external_post_id: '2', owner_name: 'Victor Baggio', published_at: '2026-06-01T00:00:00Z' }], linkedinAccounts);
    expect(linked.records.map((row) => row.external_post_id)).toEqual(['2', '1']);
    expect(linked.summary['Victor Baggio'].normalizedCount).toBe(2);

    const youtube = mergeYoutubeSnapshot({ records: [{ video_id: 'a', published_at: '2026-05-01T00:00:00Z' }] }, [{ video_id: 'a', published_at: '2026-05-01T00:00:00Z' }, { video_id: 'b', published_at: '2026-06-01T00:00:00Z' }]);
    expect(youtube.records.map((row) => row.video_id)).toEqual(['b', 'a']);
  });
});
