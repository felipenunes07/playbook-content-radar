import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { collectorDeadline, remainingMs, runActor } from '../_shared/apify.ts';
import { errorMessage, normalizeApifyPost, parseApifyInput } from '../_shared/content.ts';
import { adminClient, corsHeaders, finishRun, json, requireCollectorSecret, startRun } from '../_shared/server.ts';

async function latestLinkedInSince(client: ReturnType<typeof adminClient>, accountId: string) {
  const { data, error } = await client
    .from('content_posts')
    .select('published_at')
    .eq('account_id', accountId)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const latest = data?.published_at ? String(data.published_at).slice(0, 10) : '2020-01-01';
  // Janela mínima de 30 dias: se `since` fosse só o último post, assim que alguém
  // publica o postedLimitDate avança e os posts anteriores saem da coleta — e param
  // de receber snapshot diário de likes/comentários (aconteceu em 02/07/2026).
  const windowStart = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return latest < windowStart ? latest : windowStart;
}

function renderInput(account: Record<string, any>, since: string) {
  const maxPosts = Math.max(1, Math.min(1000, Number(Deno.env.get('APIFY_LINKEDIN_MAX_POSTS') || 500)));
  const template = Deno.env.get('APIFY_LINKEDIN_INPUT_JSON')
    || `{"authorUrls":["{{accountUrl}}"],"maxPosts":${maxPosts},"postedLimitDate":"{{since}}","sortBy":"date","profileScraperMode":"short","scrapeReactions":false,"scrapeComments":false}`;
  return parseApifyInput(
    template
      .replaceAll('{{since}}', since)
      .replaceAll('{{handle}}', String(account.handle || ''))
      .replaceAll('{{externalId}}', String(account.external_id || '')),
    account.account_url,
  );
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let runId: string | null = null;
  try {
    requireCollectorSecret(request);
    const token = Deno.env.get('APIFY_TOKEN');
    const actorId = Deno.env.get('APIFY_LINKEDIN_ACTOR_ID') || 'harvestapi/linkedin-post-search';
    if (!token || !actorId) throw new Error('APIFY_TOKEN e APIFY_LINKEDIN_ACTOR_ID são obrigatórios');
    const client = adminClient();
    const deadlineAt = collectorDeadline();
    runId = await startRun(client, 'apify_linkedin');
    const { data: accounts, error: accountsError } = await client.from('content_accounts').select('*').eq('platform', 'linkedin').eq('status', 'active');
    if (accountsError) throw accountsError;

    const metricDate = new Date().toISOString().slice(0, 10);
    let accountsProcessed = 0;
    let itemsProcessed = 0;
    let itemErrors = 0;
    const errors: Array<{ account: string; error: string }> = [];

    for (const account of accounts || []) {
      if (remainingMs(deadlineAt) < 45000) {
        errors.push({ account: account.owner_name, error: 'Conta adiada: orçamento de tempo do coletor esgotado' });
        continue;
      }
      try {
        const since = await latestLinkedInSince(client, account.id);
        const input = renderInput(account, since);
        const items = await runActor(actorId, token, input, deadlineAt);
        // Per-item isolation: one malformed item (bad date, constraint/unique collision)
        // must not abort the whole account's remaining posts. Failures are counted so the
        // run summary reflects dropped items instead of silently losing them.
        for (const item of Array.isArray(items) ? items : []) {
          try {
            const normalized = normalizeApifyPost(item, metricDate);
            // Omit classification_status so a daily re-collection does not reset an
            // already-classified/manual post back to 'pending' (default applies on insert).
            const { classification_status: _clsStatus, ...postFields } = normalized.post;
            const { data: savedPost, error: postError } = await client.from('content_posts')
              .upsert({ ...postFields, account_id: account.id }, { onConflict: 'external_post_id' }).select('id').single();
            if (postError) throw postError;
            const { error: metricError } = await client.from('content_post_daily_metrics')
              .upsert({ ...normalized.metric, post_id: savedPost.id }, { onConflict: 'post_id,metric_date,source' });
            if (metricError) throw metricError;
            itemsProcessed += 1;
          } catch (itemError) {
            itemErrors += 1;
            console.error(`Erro ao salvar post do LinkedIn (${account.owner_name}):`, errorMessage(itemError));
          }
        }

        await client.from('content_accounts').update({ last_collected_at: new Date().toISOString(), last_error: null }).eq('id', account.id);
        accountsProcessed += 1;
      } catch (error) {
        const message = errorMessage(error);
        errors.push({ account: account.owner_name, error: message });
        await client.from('content_accounts').update({ last_error: message }).eq('id', account.id);
      }
    }

    // Seguidores: um único run em LOTE com os perfis de todas as contas.
    // NB: o actor da harvestapi limita contas free da Apify a 10 runs no total
    // ("Free users are limited to 10 runs") — bloqueou a coleta em 03/07/2026.
    // O da apimaestro é pay-per-result (US$5/1k perfis), sem limite de runs.
    try {
      const profileActorId = Deno.env.get('APIFY_LINKEDIN_PROFILE_ACTOR_ID') || 'apimaestro/linkedin-profile-batch-scraper-no-cookies-required';
      const usernames = (accounts || []).map((account) => String(account.handle || '').trim()).filter(Boolean);
      if (usernames.length && remainingMs(deadlineAt) >= 45000) {
        const profiles = await runActor(profileActorId, token, { usernames, includeEmail: false }, deadlineAt);
        for (const profile of Array.isArray(profiles) ? profiles : []) {
          const info = profile?.basic_info || profile;
          const identifier = String(info?.public_identifier || '').toLowerCase();
          const account = (accounts || []).find((candidate) => String(candidate.handle || '').toLowerCase() === identifier);
          const followers = Number(info?.follower_count ?? info?.followerCount ?? 0);
          if (!account || !(followers > 0)) {
            console.error('Perfil do LinkedIn sem conta correspondente ou sem follower_count:', JSON.stringify(info)?.slice(0, 200));
            continue;
          }
          const connections = info?.connection_count != null ? String(info.connection_count) : null;
          const { error: growthError } = await client.from('account_daily_metrics').upsert({
            account_id: account.id,
            metric_date: metricDate,
            followers,
            connections,
            source: 'apify_linkedin_profile',
            raw: { basic_info: info },
          }, { onConflict: 'account_id,metric_date,source' });
          if (growthError) console.error('Erro ao salvar seguidores do LinkedIn:', growthError.message);
        }
      } else if (usernames.length) {
        errors.push({ account: 'seguidores', error: 'Coleta de seguidores adiada: orçamento de tempo esgotado' });
      }
    } catch (profileError: any) {
      errors.push({ account: 'seguidores', error: `Falha na coleta de seguidores: ${errorMessage(profileError)}` });
    }

    const status = (errors.length || itemErrors) ? (accountsProcessed ? 'partial' : 'failed') : 'success';
    const errorSummary = [errors.length ? `${errors.length} conta(s) falharam` : null, itemErrors ? `${itemErrors} item(ns) descartado(s)` : null].filter(Boolean).join('; ') || null;
    await finishRun(client, runId, { status, accounts_processed: accountsProcessed, items_processed: itemsProcessed, error_message: errorSummary, raw: { errors, itemErrors } });
    return json({ success: status !== 'failed', runId, status, accountsProcessed, itemsProcessed, itemErrors, errors });
  } catch (error) {
    const message = errorMessage(error);
    if (runId) await finishRun(adminClient(), runId, { status: 'failed', error_message: message });
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
