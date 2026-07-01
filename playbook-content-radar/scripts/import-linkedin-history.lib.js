import { normalizeLinkedInBatch } from '../src/contentMetrics/normalize.js';

export function parseImportArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (token.startsWith('--')) {
      values[token.slice(2)] = argv[index + 1];
      index += 1;
    }
  }

  if (!values.file) throw new Error('--file é obrigatório');
  if (!values.owner) throw new Error('--owner é obrigatório');
  if (!values['account-url']) throw new Error('--account-url é obrigatório');
  try {
    new URL(values['account-url']);
  } catch {
    throw new Error('--account-url deve ser uma URL válida');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values['collected-at'] || '')) {
    throw new Error('--collected-at deve usar YYYY-MM-DD');
  }

  return {
    file: values.file,
    owner: values.owner,
    accountUrl: values['account-url'],
    collectedAt: values['collected-at'],
    dryRun: Boolean(values.dryRun),
  };
}

export function prepareHistoricalImport(items, options) {
  const { normalized, skipped } = normalizeLinkedInBatch(items, {
    ownerName: options.owner,
    accountUrl: options.accountUrl,
    collectedAt: options.collectedAt,
  });

  const account = normalized[0]?.account || {
    platform: 'linkedin',
    owner_name: options.owner,
    account_name: `${options.owner} LinkedIn`,
    account_url: options.accountUrl,
    status: 'active',
  };

  return {
    account,
    posts: normalized.map(({ post }) => post),
    metrics: normalized.map(({ post, metric }) => {
      const { engagement_total: _total, engagement_score: _score, ...insertableMetric } = metric;
      return {
        ...insertableMetric,
        external_post_id: post.external_post_id,
        post_url: post.post_url,
      };
    }),
    batch: {
      source: 'historical_json',
      platform: 'linkedin',
      owner_name: options.owner,
      file_name: options.fileName,
      collected_at: `${options.collectedAt}T12:00:00.000Z`,
      total_items: Array.isArray(items) ? items.length : 0,
      imported_items: normalized.length,
      skipped_items: skipped.length,
      status: skipped.length && !normalized.length ? 'failed' : skipped.length ? 'partial' : 'success',
      raw_metadata: { skipped },
    },
    skipped,
  };
}
