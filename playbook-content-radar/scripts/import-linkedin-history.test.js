import { describe, expect, it } from 'vitest';
import { parseImportArgs, prepareHistoricalImport } from './import-linkedin-history.lib.js';

const sample = {
  id: '1234567890123456',
  linkedinUrl: 'https://www.linkedin.com/posts/example_activity-1234567890123456',
  content: 'Hook\n\nComente MAPS',
  author: { name: 'Victor Baggio', publicIdentifier: 'victorzbaggio' },
  postedAt: { date: '2026-04-27T18:24:04.345Z' },
  engagement: { likes: 10, comments: 2, shares: 1 },
};

describe('parseImportArgs', () => {
  it('parses the required CLI contract and dry-run flag', () => {
    expect(parseImportArgs([
      '--file', 'victor-posts.json',
      '--owner', 'Victor Baggio',
      '--account-url', 'https://linkedin.com/in/victorzbaggio',
      '--collected-at', '2026-05-12',
      '--dry-run',
    ])).toEqual({
      file: 'victor-posts.json',
      owner: 'Victor Baggio',
      accountUrl: 'https://linkedin.com/in/victorzbaggio',
      collectedAt: '2026-05-12',
      dryRun: true,
    });
  });

  it('rejects missing or invalid required arguments', () => {
    expect(() => parseImportArgs(['--file', 'x.json'])).toThrow(/owner/i);
    expect(() => parseImportArgs([
      '--file', 'x.json', '--owner', 'Victor', '--account-url', 'not-a-url', '--collected-at', '12/05/2026',
    ])).toThrow(/account-url|collected-at/i);
  });
});

describe('prepareHistoricalImport', () => {
  it('returns account, post and append-only snapshot payloads with audit totals', () => {
    const prepared = prepareHistoricalImport([sample, { ...sample }, { content: 'invalid' }], {
      owner: 'Victor Baggio',
      accountUrl: 'https://linkedin.com/in/victorzbaggio',
      collectedAt: '2026-05-12',
      fileName: 'victor-posts.json',
    });

    expect(prepared.account).toMatchObject({ platform: 'linkedin', owner_name: 'Victor Baggio' });
    expect(prepared.posts).toHaveLength(1);
    expect(prepared.metrics[0]).toMatchObject({
      metric_date: '2026-05-12', source: 'historical_json', metric_type: 'snapshot',
    });
    expect(prepared.metrics[0]).not.toHaveProperty('engagement_total');
    expect(prepared.metrics[0]).not.toHaveProperty('engagement_score');
    expect(prepared.batch).toMatchObject({
      source: 'historical_json',
      platform: 'linkedin',
      total_items: 3,
      imported_items: 1,
      skipped_items: 2,
    });
    expect(prepared.skipped).toHaveLength(2);
  });
});
