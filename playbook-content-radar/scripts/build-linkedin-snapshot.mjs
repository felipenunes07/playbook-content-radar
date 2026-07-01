import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLinkedInBatch } from '../src/contentMetrics/normalize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const defaultRawRoot = 'C:/Users/Felipe/Dropbox/Obsidian/raw/linkedin';
const rawRoot = process.env.LINKEDIN_HISTORY_DIR || defaultRawRoot;

const sources = [
  {
    file: path.join(rawRoot, 'fernando-posts.json'),
    ownerName: 'Fernando Tedesco',
    accountUrl: 'https://www.linkedin.com/in/fernando-tedesco/',
  },
  {
    file: path.join(rawRoot, 'victor-posts.json'),
    ownerName: 'Victor Baggio',
    accountUrl: 'https://www.linkedin.com/in/victorzbaggio/',
  },
];

const records = [];
const summary = {};
const globalIds = new Set();
let duplicateCount = 0;

for (const source of sources) {
  const posts = JSON.parse(await readFile(source.file, 'utf8'));
  const { normalized, skipped } = normalizeLinkedInBatch(posts, {
    ownerName: source.ownerName,
    accountUrl: source.accountUrl,
    collectedAt: '2026-05-12',
  });

  for (const item of normalized) {
    const identity = item.post.external_post_id || item.post.post_url;
    if (globalIds.has(identity)) {
      duplicateCount += 1;
      continue;
    }
    globalIds.add(identity);
    records.push({
      ...item.post,
      ...item.metric,
      owner_name: source.ownerName,
      account_url: source.accountUrl,
      raw: undefined,
    });
  }

  summary[source.ownerName] = {
    sourceCount: posts.length,
    normalizedCount: normalized.length,
    skippedCount: skipped.length,
  };
}

records.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
const output = {
  generated_at: new Date().toISOString(),
  collected_at: '2026-05-12',
  source: 'historical_json',
  summary,
  duplicate_count: duplicateCount,
  records,
};

const outputFile = path.join(appRoot, 'src/contentMetrics/data/linkedin-history.json');
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  Fernando: summary['Fernando Tedesco'].normalizedCount,
  Victor: summary['Victor Baggio'].normalizedCount,
  total: records.length,
  duplicates: duplicateCount,
  output: outputFile,
}, null, 2));
