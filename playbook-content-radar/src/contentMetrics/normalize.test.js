import { describe, expect, it } from 'vitest';
import {
  detectFormat,
  extractCtaKeyword,
  extractHook,
  normalizeLinkedInBatch,
  normalizeLinkedInPost,
  reactionTotal,
} from './normalize.js';

const basePost = {
  id: '7457516755402362881',
  entityId: '7457516755402362881',
  shareUrn: 'urn:li:share:7457516753787678722',
  linkedinUrl: 'https://www.linkedin.com/posts/example_activity-7457516755402362881',
  content: '\n  Primeira linha forte\n\nComente “MAPS” para receber.',
  author: { name: 'Fernando Tedesco', publicIdentifier: 'fernando-tedesco' },
  postedAt: { date: '2026-05-05T19:49:08.449Z' },
  engagement: {
    likes: 57,
    comments: 7,
    shares: 3,
    reactions: [
      { type: 'LIKE', count: 50 },
      { type: 'EMPATHY', count: 5 },
      { type: 'APPRECIATION', count: 2 },
    ],
  },
};

describe('detectFormat', () => {
  it('uses the required repost, video, carousel, image, text priority', () => {
    expect(detectFormat({ repostId: '1', postVideo: {}, postImages: [{}, {}] })).toBe('repost');
    expect(detectFormat({ postVideo: {}, postImages: [{}, {}] })).toBe('video');
    expect(detectFormat({ postImages: [{}, {}] })).toBe('carousel');
    expect(detectFormat({ postImages: [{}] })).toBe('image');
    expect(detectFormat({})).toBe('text');
  });
});

describe('extractHook', () => {
  it('returns the first non-empty trimmed line capped at 240 characters', () => {
    expect(extractHook('\n  Um hook direto  \nresto')).toBe('Um hook direto');
    expect(extractHook(`\n${'x'.repeat(300)}`)).toHaveLength(240);
    expect(extractHook('')).toBe('');
  });
});

describe('extractCtaKeyword', () => {
  it.each([
    ['Comenta "MAPS" que eu te mando', 'MAPS'],
    ['Comente “PIPEDRIVE” abaixo', 'PIPEDRIVE'],
    ['comenta MCP para receber', 'MCP'],
    ['Comente 20 aqui', '20'],
  ])('extracts an explicit comment CTA from %s', (content, expected) => {
    expect(extractCtaKeyword(content)).toBe(expected);
  });

  it('does not invent a CTA', () => {
    expect(extractCtaKeyword('Veja o link e saiba mais.')).toBeNull();
    expect(extractCtaKeyword('Se conhece alguém, comenta aqui!')).toBeNull();
    expect(extractCtaKeyword('Comente abaixo o que achou.')).toBeNull();
    expect(extractCtaKeyword('Comenta aí se fez sentido.')).toBeNull();
    expect(extractCtaKeyword('Comente quais ferramentas você usa.')).toBeNull();
    expect(extractCtaKeyword('Comenta resumo e eu respondo.')).toBeNull();
  });
});

describe('reactionTotal', () => {
  it('sums the reaction breakdown and falls back to likes', () => {
    expect(reactionTotal(basePost.engagement)).toBe(57);
    expect(reactionTotal({ likes: 12 })).toBe(12);
  });
});

describe('normalizeLinkedInPost', () => {
  it('normalizes identity, classification hints, media and weighted metrics', () => {
    const normalized = normalizeLinkedInPost(
      { ...basePost, postImages: [{ url: 'https://img.test/post.jpg' }] },
      { ownerName: 'Fernando Tedesco', accountUrl: 'https://linkedin.com/in/fernando-tedesco', collectedAt: '2026-05-12' },
    );

    expect(normalized.post).toMatchObject({
      external_post_id: '7457516755402362881',
      entity_id: '7457516755402362881',
      author_name: 'Fernando Tedesco',
      author_identifier: 'fernando-tedesco',
      hook: 'Primeira linha forte',
      format: 'image',
      cta_keyword: 'MAPS',
      media_type: 'image',
      media_url: 'https://img.test/post.jpg',
      classification_status: 'pending',
    });
    expect(normalized.metric).toMatchObject({
      metric_date: '2026-05-12',
      likes: 57,
      comments: 7,
      shares: 3,
      reactions_total: 57,
      engagement_total: 67,
      engagement_score: 90,
      source: 'historical_json',
      metric_type: 'snapshot',
    });
  });

  it('rejects malformed records with no stable id or URL', () => {
    expect(() => normalizeLinkedInPost({ content: 'sem identidade' }, {
      ownerName: 'Victor Baggio',
      accountUrl: 'https://linkedin.com/in/victorzbaggio',
      collectedAt: '2026-05-12',
    })).toThrow(/identidade/i);
  });
});

describe('normalizeLinkedInBatch', () => {
  it('keeps unique valid posts and reports duplicates and malformed rows', () => {
    const context = {
      ownerName: 'Fernando Tedesco',
      accountUrl: 'https://linkedin.com/in/fernando-tedesco',
      collectedAt: '2026-05-12',
    };
    const result = normalizeLinkedInBatch([basePost, { ...basePost }, { content: 'sem id' }], context);

    expect(result.normalized).toHaveLength(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({ index: 1, reason: 'duplicate' }),
      expect.objectContaining({ index: 2, reason: expect.stringMatching(/identidade/i) }),
    ]);
  });
});
