import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildInstagramActorInput,
  buildLinkedInActorInput,
  buildYoutubeActorInput,
  defaultAccounts,
  latestDateByOwner,
  mergeInstagramSnapshot,
  mergeLinkedInSnapshot,
  mergeYoutubeSnapshot,
  normalizeApifyInstagramItem,
  normalizeApifyYoutubeItem,
  normalizeHarvestLinkedInPost,
} from './collect-apify-content.lib.js';

const APIFY_API = 'https://api.apify.com/v2';
const appRoot = process.cwd();
const paths = {
  linkedin: path.join(appRoot, 'src/contentMetrics/data/linkedin-history.json'),
  youtube: path.join(appRoot, 'src/contentMetrics/data/youtube-history.json'),
  instagram: path.join(appRoot, 'src/contentMetrics/data/instagram-history.json'),
  rawDir: path.join(appRoot, 'tmp/apify-content'),
};

function optionKey(token) {
  return token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseArgs(argv) {
  const values = { platform: 'all', writeLocal: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write-local') values.writeLocal = true;
    else if (token === '--dry-run') values.dryRun = true;
    else if (token.startsWith('--')) {
      values[optionKey(token)] = argv[index + 1];
      index += 1;
    }
  }
  if (!['all', 'linkedin', 'youtube', 'instagram'].includes(values.platform)) throw new Error('--platform deve ser all, linkedin, youtube ou instagram');
  return values;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function apify(pathname, token, init) {
  const separator = pathname.includes('?') ? '&' : '?';
  const response = await fetch(`${APIFY_API}/${pathname}${separator}token=${encodeURIComponent(token)}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Apify API ${response.status}`);
  return body.data ?? body;
}

async function runActor(actorId, token, input, { waitSecs = 120 } = {}) {
  let run = await apify(`acts/${encodeURIComponent(actorId)}/runs?waitForFinish=${waitSecs}`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const pollIntervalMs = 5000;
  const maxPolls = 60; // 5 minutes max polling
  let pollCount = 0;

  while (['READY', 'RUNNING'].includes(run.status) && pollCount < maxPolls) {
    pollCount += 1;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    run = await apify(`actor-runs/${run.id}`, token);
  }

  if (run.status !== 'SUCCEEDED') throw new Error(`Actor ${actorId} terminou com status ${run.status || 'desconhecido'}`);
  return apify(`datasets/${run.defaultDatasetId}/items?clean=true&limit=5000`, token);
}

async function collectLinkedIn(token, options) {
  const actorId = options.linkedinActor || process.env.APIFY_LINKEDIN_ACTOR_ID || 'harvestapi/linkedin-post-search';
  const existing = await readJson(paths.linkedin, { records: [] });
  const latest = latestDateByOwner(existing.records || []);
  const metricDate = new Date().toISOString().slice(0, 10);
  const raw = [];
  const normalized = [];
  const errors = [];

  for (const account of defaultAccounts.linkedin) {
    const input = buildLinkedInActorInput(account, {
      since: options.since || latest[account.ownerName] || '2020-01-01',
      maxPosts: options.maxPosts || process.env.APIFY_LINKEDIN_MAX_POSTS || 500,
    });
    if (options.dryRun) {
      raw.push({ account, actorId, input, items: [] });
      continue;
    }
    try {
      const items = await runActor(actorId, token, input, { waitSecs: Number(options.waitSecs || 180) });
      raw.push({ account, actorId, input, items });
      for (const item of Array.isArray(items) ? items : []) {
        try { normalized.push(normalizeHarvestLinkedInPost(item, account, metricDate)); }
        catch (error) { errors.push({ platform: 'linkedin', account: account.ownerName, error: error.message, item }); }
      }
    } catch (error) {
      errors.push({ platform: 'linkedin', account: account.ownerName, error: error.message });
    }
  }

  const merged = mergeLinkedInSnapshot(existing, normalized, defaultAccounts.linkedin, metricDate);
  return { platform: 'linkedin', actorId, existing: existing.records?.length || 0, collected: normalized.length, merged, raw, errors };
}

async function collectYouTube(token, options) {
  const actorId = options.youtubeActor || process.env.APIFY_YOUTUBE_ACTOR_ID || 'streamers/youtube-scraper';
  const existing = await readJson(paths.youtube, { records: [] });
  const latest = latestDateByOwner(existing.records || []);
  const metricDate = new Date().toISOString().slice(0, 10);
  const raw = [];
  const normalized = [];
  const errors = [];

  for (const account of defaultAccounts.youtube) {
    const input = buildYoutubeActorInput(account, {
      since: options.since || latest[account.ownerName] || '2020-01-01',
      maxVideos: options.maxVideos || process.env.APIFY_YOUTUBE_MAX_VIDEOS || 200,
      maxShorts: options.maxShorts ?? process.env.APIFY_YOUTUBE_MAX_SHORTS,
    });
    if (options.dryRun) {
      raw.push({ account, actorId, input, items: [] });
      continue;
    }
    try {
      const items = await runActor(actorId, token, input, { waitSecs: Number(options.waitSecs || 240) });
      raw.push({ account, actorId, input, items });
      for (const item of Array.isArray(items) ? items : []) {
        try {
          const norm = normalizeApifyYoutubeItem(item, account, metricDate);
          if (norm) normalized.push(norm);
        }
        catch (error) { errors.push({ platform: 'youtube', account: account.ownerName, error: error.message, item }); }
      }
    } catch (error) {
      errors.push({ platform: 'youtube', account: account.ownerName, error: error.message });
    }
  }

  const merged = mergeYoutubeSnapshot(existing, normalized, metricDate);
  return { platform: 'youtube', actorId, existing: existing.records?.length || 0, collected: normalized.length, merged, raw, errors };
}

async function collectInstagram(token, options) {
  const actorId = options.instagramActor || process.env.APIFY_INSTAGRAM_ACTOR_ID || 'apify/instagram-scraper';
  const existing = await readJson(paths.instagram, { records: [] });
  const latest = latestDateByOwner(existing.records || []);
  const metricDate = new Date().toISOString().slice(0, 10);
  const raw = [];
  const normalized = [];
  const errors = [];

  for (const account of defaultAccounts.instagram) {
    const input = buildInstagramActorInput(account, {
      resultsType: 'posts',
      since: options.since || latest[account.ownerName] || '2020-01-01',
      maxPosts: options.maxPosts || process.env.APIFY_INSTAGRAM_MAX_POSTS || 200,
    });
    if (options.dryRun) {
      raw.push({ account, actorId, input, items: [] });
      continue;
    }
    try {
      const items = await runActor(actorId, token, input, { waitSecs: Number(options.waitSecs || 240) });
      raw.push({ account, actorId, input, items });
      for (const item of Array.isArray(items) ? items : []) {
        try {
          const norm = normalizeApifyInstagramItem(item, account, metricDate);
          if (norm) normalized.push(norm);
        }
        catch (error) { errors.push({ platform: 'instagram', account: account.ownerName, error: error.message, item }); }
      }
    } catch (error) {
      errors.push({ platform: 'instagram', account: account.ownerName, error: error.message });
    }

    // Capture active stories
    const storyActorId = process.env.APIFY_INSTAGRAM_STORY_ACTOR_ID || 'datavoyantlab/instagram-story-downloader';
    const storyHandle = account.handle || account.accountUrl.match(/instagram\.com\/([^/?#]+)/i)?.[1] || '';
    const storyInput = { usernames: [storyHandle] };
    try {
      console.log(`Coletando stories ativos para ${account.ownerName}...`);
      const items = await runActor(storyActorId, token, storyInput, { waitSecs: Number(options.waitSecs || 120) });
      raw.push({ account, actorId: storyActorId, input: storyInput, items });
      for (const item of Array.isArray(items) ? items : []) {
        try {
          const norm = normalizeApifyInstagramItem(item, account, metricDate);
          if (norm) normalized.push(norm);
        }
        catch (error) { errors.push({ platform: 'instagram-stories', account: account.ownerName, error: error.message, item }); }
      }
    } catch (error) {
      console.warn(`Stories indisponíveis para ${account.ownerName}:`, error.message);
    }
  }

  const merged = mergeInstagramSnapshot(existing, normalized, defaultAccounts.instagram, metricDate);
  return { platform: 'instagram', actorId, existing: existing.records?.length || 0, collected: normalized.length, merged, raw, errors };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.APIFY_TOKEN;
  if (!token && !options.dryRun) throw new Error('Defina APIFY_TOKEN na sessão do terminal. Não coloque token no front-end nem em arquivo commitado.');

  await mkdir(paths.rawDir, { recursive: true });
  const results = [];
  if (options.platform === 'all' || options.platform === 'linkedin') results.push(await collectLinkedIn(token, options));
  if (options.platform === 'all' || options.platform === 'youtube') results.push(await collectYouTube(token, options));
  if (options.platform === 'all' || options.platform === 'instagram') results.push(await collectInstagram(token, options));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const result of results) {
    await writeFile(path.join(paths.rawDir, `${stamp}-${result.platform}-raw.json`), JSON.stringify(result.raw, null, 2));
    if (options.writeLocal && !options.dryRun) {
      await writeFile(paths[result.platform], JSON.stringify(result.merged, null, 2));
    }
  }

  console.log(JSON.stringify({
    mode: options.dryRun ? 'dry-run' : options.writeLocal ? 'write-local' : 'raw-only',
    results: results.map((result) => ({
      platform: result.platform,
      actorId: result.actorId,
      existing: result.existing,
      collected: result.collected,
      merged: result.merged.records.length,
      duplicates: result.merged.duplicate_count,
      errors: result.errors.length,
      errorDetails: result.errors.map((e) => ({ account: e.account, error: e.error })),
      rawSavedTo: paths.rawDir,
    })),
  }, null, 2));

  if (results.some((result) => result.errors.length)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
