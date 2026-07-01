import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { parseImportArgs, prepareHistoricalImport } from './import-linkedin-history.lib.js';

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), args.file);
  const items = JSON.parse(await readFile(filePath, 'utf8'));
  if (!Array.isArray(items)) throw new Error('O arquivo precisa conter um array JSON');

  const prepared = prepareHistoricalImport(items, {
    ...args,
    fileName: path.basename(filePath),
  });

  if (args.dryRun) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      owner: args.owner,
      total: prepared.batch.total_items,
      imported: prepared.batch.imported_items,
      skipped: prepared.batch.skipped_items,
      sample: prepared.posts.slice(0, 2).map((post) => ({
        id: post.external_post_id,
        format: post.format,
        hook: post.hook,
        cta: post.cta_keyword,
      })),
    }, null, 2));
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para importar; use --dry-run para validar sem credenciais');
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: account, error: accountError } = await supabase
    .from('content_accounts')
    .upsert(prepared.account, { onConflict: 'platform,account_url' })
    .select('id')
    .single();
  if (accountError) throw accountError;

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert(prepared.batch)
    .select('id')
    .single();
  if (batchError) throw batchError;

  let imported = 0;
  const runtimeSkipped = [];
  for (let index = 0; index < prepared.posts.length; index += 1) {
    const post = { ...prepared.posts[index], account_id: account.id };
    const metric = prepared.metrics[index];
    try {
      const { data: savedPost, error: postError } = await supabase
        .from('content_posts')
        .upsert(post, { onConflict: 'external_post_id' })
        .select('id')
        .single();
      if (postError) throw postError;

      const { external_post_id: _externalPostId, post_url: _postUrl, ...metricPayload } = metric;
      const { error: metricError } = await supabase
        .from('content_post_daily_metrics')
        .upsert({ ...metricPayload, post_id: savedPost.id, import_batch_id: batch.id }, {
          onConflict: 'post_id,metric_date,source',
          ignoreDuplicates: true,
        });
      if (metricError) throw metricError;
      imported += 1;
    } catch (error) {
      runtimeSkipped.push({
        external_post_id: post.external_post_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const skippedCount = prepared.skipped.length + runtimeSkipped.length;
  await supabase.from('import_batches').update({
    imported_items: imported,
    skipped_items: skippedCount,
    status: skippedCount ? (imported ? 'partial' : 'failed') : 'success',
    error_message: runtimeSkipped.length ? `${runtimeSkipped.length} itens falharam durante a gravação` : null,
    raw_metadata: { skipped: [...prepared.skipped, ...runtimeSkipped] },
  }).eq('id', batch.id);

  console.log(JSON.stringify({ batchId: batch.id, owner: args.owner, imported, skipped: skippedCount }, null, 2));
  if (runtimeSkipped.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
