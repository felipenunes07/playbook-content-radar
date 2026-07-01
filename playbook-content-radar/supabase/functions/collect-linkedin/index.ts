import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage, normalizeApifyPost, parseApifyInput } from '../_shared/content.ts';
import { adminClient, corsHeaders, finishRun, json, requireCollectorSecret, startRun } from '../_shared/server.ts';

const APIFY_API = 'https://api.apify.com/v2';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function apify(path: string, token: string, init?: RequestInit) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${APIFY_API}/${path}${separator}token=${encodeURIComponent(token)}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `Apify API ${response.status}`);
  return body.data ?? body;
}

async function runActor(actorId: string, token: string, input: Record<string, unknown>) {
  let run = await apify(`acts/${encodeURIComponent(actorId)}/runs?waitForFinish=100`, token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  for (let attempt = 0; attempt < 8 && !['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status); attempt += 1) {
    await wait(5000);
    run = await apify(`actor-runs/${run.id}`, token);
  }
  if (run.status !== 'SUCCEEDED') throw new Error(`Actor terminou com status ${run.status || 'desconhecido'}`);
  return apify(`datasets/${run.defaultDatasetId}/items?clean=true&limit=1000`, token);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let runId: string | null = null;
  try {
    requireCollectorSecret(request);
    const token = Deno.env.get('APIFY_TOKEN');
    const actorId = Deno.env.get('APIFY_LINKEDIN_ACTOR_ID');
    if (!token || !actorId) throw new Error('APIFY_TOKEN e APIFY_LINKEDIN_ACTOR_ID são obrigatórios');
    const client = adminClient();
    runId = await startRun(client, 'apify_linkedin');
    const { data: accounts, error: accountsError } = await client.from('content_accounts').select('*').eq('platform', 'linkedin').eq('status', 'active');
    if (accountsError) throw accountsError;

    const metricDate = new Date().toISOString().slice(0, 10);
    let accountsProcessed = 0;
    let itemsProcessed = 0;
    const errors: Array<{ account: string; error: string }> = [];

    for (const account of accounts || []) {
      try {
        const input = parseApifyInput(Deno.env.get('APIFY_LINKEDIN_INPUT_JSON'), account.account_url);
        const items = await runActor(actorId, token, input);
        for (const item of Array.isArray(items) ? items : []) {
          const normalized = normalizeApifyPost(item, metricDate);
          const { data: savedPost, error: postError } = await client.from('content_posts')
            .upsert({ ...normalized.post, account_id: account.id }, { onConflict: 'external_post_id' }).select('id').single();
          if (postError) throw postError;
          const { error: metricError } = await client.from('content_post_daily_metrics')
            .upsert({ ...normalized.metric, post_id: savedPost.id }, { onConflict: 'post_id,metric_date,source' });
          if (metricError) throw metricError;
          itemsProcessed += 1;
        }
        await client.from('content_accounts').update({ last_collected_at: new Date().toISOString(), last_error: null }).eq('id', account.id);
        accountsProcessed += 1;
      } catch (error) {
        const message = errorMessage(error);
        errors.push({ account: account.owner_name, error: message });
        await client.from('content_accounts').update({ last_error: message }).eq('id', account.id);
      }
    }

    const status = errors.length ? (accountsProcessed ? 'partial' : 'failed') : 'success';
    await finishRun(client, runId, { status, accounts_processed: accountsProcessed, items_processed: itemsProcessed, error_message: errors.length ? `${errors.length} conta(s) falharam` : null, raw: { errors } });
    return json({ success: status !== 'failed', runId, status, accountsProcessed, itemsProcessed, errors });
  } catch (error) {
    const message = errorMessage(error);
    if (runId) await finishRun(adminClient(), runId, { status: 'failed', error_message: message });
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
