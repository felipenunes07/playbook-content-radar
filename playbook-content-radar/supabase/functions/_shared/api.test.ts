import { describe, expect, it } from 'vitest';
import { apiRoute, contentQuery } from './api.ts';

describe('content dashboard API routing', () => {
  it('extracts routes from Edge Function and conventional API URLs', () => {
    expect(apiRoute('https://project.supabase.co/functions/v1/content-dashboard-api/overview')).toBe('/overview');
    expect(apiRoute('https://app.test/api/content-dashboard/linkedin/posts')).toBe('/linkedin/posts');
    expect(apiRoute('https://project.supabase.co/functions/v1/content-dashboard-api')).toBe('/overview');
  });

  it('normalizes supported filters and safe sorting', () => {
    expect(contentQuery(new URL('https://app.test/x?owner=Victor%20Baggio&from=2026-01-01&to=2026-07-01&theme=IA&format=image&cta=MAPS&sort=comments'))).toEqual({
      owner: 'Victor Baggio', from: '2026-01-01', to: '2026-07-01', theme: 'IA', format: 'image', cta: 'MAPS', sort: 'comments',
    });
    expect(contentQuery(new URL('https://app.test/x?sort=drop%20table'))?.sort).toBe('engagement_score');
  });
});
