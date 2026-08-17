import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { apify, collectorDeadline, remainingMs } from '../_shared/apify.ts';
import { chunk, errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';

// Fase 1 da prospecção: raspa os comentários de UM post, deduplica os comentaristas
// contra o banco de leads e grava o rastro (lead_comments) + as contagens do job.
// NÃO enriquece nem qualifica ainda (isso é a Fase 2, enrich-leads). Disparado pelo
// botão "Prospectar" da tabela de posts (modo manual) ou pelo cron/botão geral
// futuro (com x-collector-secret), igual ao collect-instagram.
// Ver docs/superpowers/plans/2026-07-04-warm-prospecting-from-commenters.md
//
// PAGINADO desde 17/08/2026: um post viral não cabe numa invocação. O post das 36
// Skills tem 4.373 comentários e a versão anterior tentava raspar tudo esperando o
// actor terminar — no plano free o worker morre em ~150s (medido: 151.400ms, HTTP
// 546 WORKER_RESOURCE_LIMIT) e o job ficava preso em "running" pra sempre, sem nem
// rodar o catch. Agora a run da Apify é iniciada SEM espera e cada invocação ingere
// mais uma fatia do dataset, gravando o offset em prospecting_jobs.ingested_count.
// A tela chama a function em loop até `done: true`, igual já faz com o enrich-leads.
const WORKER_WALL_CLOCK_BUDGET_MS = 115000;
// Folga reservada para fechar o job com status honesto depois da última página.
const INGEST_RESERVE_MS = 30000;
const INGEST_PAGE_SIZE = 200;
// Teto na própria Apify pra uma run nunca ficar pendurada cobrando à toa.
const ACTOR_TIMEOUT_SECS = 900;
// Um job que para de carimbar last_progress_at foi abandonado (aba fechada, worker
// morto). Um job paginando há 20min carimba a cada invocação e não é varrido.
const STALE_JOB_MS = 10 * 60000;
const TERMINAL_RUN_STATUS = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'];

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Extrai o slug do /in/<slug> de uma URL de perfil. É a chave de deduplicação de
// leads: dois formatos de URL do mesmo perfil colapsam no mesmo identificador.
function extractPublicIdentifier(url: string): string | null {
  if (!url) return null;
  const match = String(url).match(/\/in\/([^/?#]+)/i);
  if (!match) return null;
  return decodeURIComponent(match[1]).toLowerCase().replace(/\/$/, '') || null;
}

// O output do actor não tem schema publicado, então lemos defensivamente vários
// nomes de campo possíveis (padrão harvestapi aninha o autor). O item cru vai pra
// coluna raw pra podermos ajustar depois da primeira run real.
function pick(obj: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    const value = key.split('.').reduce((acc: any, part) => (acc == null ? acc : acc[part]), obj);
    if (value != null && value !== '') return value;
  }
  return null;
}

function normalizeComment(item: Record<string, any>) {
  const author = item.author || item.commenter || item.actor || item.profile || item;
  const profileUrl = pick(author, ['linkedinUrl', 'profileUrl', 'url', 'publicUrl'])
    || pick(item, ['authorLinkedinUrl', 'commenterUrl']);
  const publicIdentifier = pick(author, ['publicIdentifier', 'public_identifier', 'username'])
    || extractPublicIdentifier(String(profileUrl || ''));
  return {
    publicIdentifier: publicIdentifier ? String(publicIdentifier).toLowerCase() : null,
    profileUrl: profileUrl ? String(profileUrl) : null,
    fullName: pick(author, ['name', 'fullName', 'displayName']),
    headline: pick(author, ['position', 'headline', 'occupation', 'subtitle']),
    // harvestapi usa "commentary" (payload real conferido em 05/07); os demais são
    // fallbacks pra troca futura de actor.
    commentText: pick(item, ['commentary', 'commentText', 'text', 'comment', 'body']),
    commentUrn: pick(item, ['commentUrn', 'urn', 'id', 'commentId']),
    commentedAt: pick(item, ['createdAt', 'commentedAt', 'postedAt', 'date', 'time']),
  };
}

function toTimestamp(value: any): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Monta a URL pública do post pro actor de comentários. Nem todo post do banco tem
// post_url (imports históricos antigos não guardaram), mas quase todos têm o id da
// activity em external_post_id/entity_id/share_urn — o que basta pra reconstruir a
// URL /feed/update/urn:li:activity:<id> que o actor aceita. Assim TODO post vira
// prospectável, não só os que já tinham post_url.
function buildScrapeUrl(post: Record<string, any>): string | null {
  if (post.post_url && String(post.post_url).includes('linkedin.com')) return String(post.post_url);
  for (const candidate of [post.external_post_id, post.entity_id, post.share_urn]) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    if (/^\d{8,}$/.test(value)) return `https://www.linkedin.com/feed/update/urn:li:activity:${value}`;
    const urnMatch = value.match(/urn:li:(?:activity|ugcPost|share):\d+/i);
    if (urnMatch) return `https://www.linkedin.com/feed/update/${urnMatch[0]}`;
    const idMatch = value.match(/(?:activity|ugcPost|share)[-:](\d{8,})/i);
    if (idMatch) return `https://www.linkedin.com/feed/update/urn:li:activity:${idMatch[1]}`;
  }
  return null;
}

// Persiste UMA página do dataset. Não há estado entre páginas: a deduplicação
// global sai de graça das constraints (leads.public_identifier único,
// lead_comments (post_id, lead_id) único), então reprocessar uma página é
// inofensivo — o que importa pra retomada é o offset, não a memória.
async function persistPage(
  client: ReturnType<typeof adminClient>,
  postId: string,
  items: Record<string, any>[],
  ownHandles: Set<string>,
) {
  const byIdentifier = new Map<string, ReturnType<typeof normalizeComment> & { raw?: Record<string, unknown> }>();
  let skipped = 0;
  for (const item of items) {
    const c = normalizeComment(item);
    const key = c.publicIdentifier || c.profileUrl;
    if (!key) { skipped += 1; continue; }
    const identifier = c.publicIdentifier || extractPublicIdentifier(String(c.profileUrl));
    // Donos das contas monitoradas não são leads (Victor/Fernando respondem os
    // próprios posts — apareceriam em toda extração).
    if (identifier && ownHandles.has(identifier)) continue;
    byIdentifier.set(key, { ...c, publicIdentifier: identifier, raw: item });
  }

  const commenters = [...byIdentifier.values()];
  const identifiers = commenters.map((c) => c.publicIdentifier).filter(Boolean) as string[];

  // Quem já está no banco = já prospectamos/vimos antes. Os novos = oportunidades.
  // Em lotes: um `.in()` com centenas de identificadores vira uma URL de dezenas de
  // milhares de caracteres e o HTTP/2 do PostgREST derruba a conexão com
  // "unspecific protocol error" (foi o primeiro erro do post das 36 Skills).
  const existingIdMap = new Map<string, string>();
  for (const batch of chunk(identifiers, 100)) {
    const { data: existing, error: existingError } = await client
      .from('leads').select('id, public_identifier').in('public_identifier', batch);
    if (existingError) throw existingError;
    for (const row of existing || []) existingIdMap.set(row.public_identifier, row.id);
  }

  const newCommenters = commenters.filter((c) => !(c.publicIdentifier && existingIdMap.has(c.publicIdentifier)));
  if (newCommenters.length) {
    const rows = newCommenters.map((c) => ({
      public_identifier: c.publicIdentifier,
      profile_url: c.profileUrl,
      full_name: c.fullName,
      headline: c.headline,
      first_seen_post_id: postId,
      enrichment_status: 'pending',
      profile_raw: { comment_scrape: { headline: c.headline, name: c.fullName } },
    }));
    // upsert (não insert) para tolerar corrida com outro job que insira a mesma
    // pessoa; onConflict devolve a linha existente sem estourar.
    for (const batch of chunk(rows, 250)) {
      const { data: inserted, error: insertError } = await client
        .from('leads').upsert(batch, { onConflict: 'public_identifier', ignoreDuplicates: false })
        .select('id, public_identifier');
      if (insertError) throw insertError;
      for (const row of inserted || []) if (row.public_identifier) existingIdMap.set(row.public_identifier, row.id);
    }
  }

  // Grava o rastro de comentários (uma linha por post+lead).
  const commentRows = commenters
    .map((c) => {
      const leadId = c.publicIdentifier ? existingIdMap.get(c.publicIdentifier) : null;
      if (!leadId) return null;
      return {
        post_id: postId,
        lead_id: leadId,
        comment_text: c.commentText,
        comment_urn: c.commentUrn ? String(c.commentUrn) : null,
        commented_at: toTimestamp(c.commentedAt),
        raw: (c as any).raw || {},
      };
    })
    .filter(Boolean);
  // Lote menor: cada linha carrega o item cru da Apify em `raw`.
  for (const batch of chunk(commentRows as any[], 150)) {
    const { error: commentError } = await client
      .from('lead_comments').upsert(batch, { onConflict: 'post_id,lead_id' });
    if (commentError) throw commentError;
  }

  return skipped;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let jobId: string | null = null;
  let client: ReturnType<typeof adminClient> | null = null;
  try {
    // Dual-mode: botão do dashboard manda { manual: true } (protegido pelo verify_jwt
    // que exige a anon key); cron/geral futuro manda o x-collector-secret.
    const body = await request.json().catch(() => ({}));
    const expectedSecret = Deno.env.get('COLLECTOR_SHARED_SECRET');
    const hasSecret = Boolean(expectedSecret) && request.headers.get('x-collector-secret') === expectedSecret;
    if (!hasSecret && body?.manual !== true) throw new Error('Execução não autorizada');

    const postId = body?.postId;
    if (!postId) throw new Error('postId é obrigatório');

    const token = Deno.env.get('APIFY_TOKEN');
    const actorId = Deno.env.get('APIFY_LINKEDIN_COMMENTS_ACTOR_ID') || 'harvestapi/linkedin-post-comments';
    if (!token) throw new Error('APIFY_TOKEN é obrigatório');

    client = adminClient();
    const { data: post, error: postError } = await client
      .from('content_posts').select('id, post_url, external_post_id, entity_id, share_urn').eq('id', postId).single();
    if (postError) throw postError;
    const scrapeUrl = buildScrapeUrl(post || {});
    if (!scrapeUrl) throw new Error('Não foi possível determinar a URL do post para raspar comentários');

    const deadlineAt = Math.min(collectorDeadline(), Date.now() + WORKER_WALL_CLOCK_BUDGET_MS);

    // Mesmo auto-conserto do startRun: quando o runtime mata o worker não existe
    // catch, então o job ficava "running" pra sempre e a tela mostrava "em andamento"
    // num job morto. Só entra quem parou de carimbar o heartbeat.
    const staleCutoff = new Date(Date.now() - STALE_JOB_MS).toISOString();
    const staleUpdate = {
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: 'Job não finalizou (worker morto pelo limite de tempo ou execução abandonada) — encerrado ao iniciar a execução seguinte',
    };
    // Duas passadas em vez de um `or` com timestamp interpolado: o filtro `or` do
    // PostgREST é montado por string e um ISO 8601 lá dentro é pedido pra quebrar.
    for (const applyCutoff of [
      (query: any) => query.lt('last_progress_at', staleCutoff),
      // Jobs anteriores à migração da paginação não têm heartbeat.
      (query: any) => query.is('last_progress_at', null).lt('started_at', staleCutoff),
    ]) {
      const { error: staleError } = await applyCutoff(
        client.from('prospecting_jobs').update(staleUpdate).eq('post_id', post.id).eq('status', 'running'),
      );
      if (staleError) console.error('Não foi possível limpar jobs órfãos:', errorMessage(staleError));
    }

    // Retoma o job aberto deste post em vez de abrir outro: reaproveitar a run da
    // Apify é o que evita pagar duas vezes pela mesma raspagem.
    const { data: openJob, error: openError } = await client.from('prospecting_jobs')
      .select('id, apify_run_id, apify_dataset_id, ingested_count, dataset_total, raw')
      .eq('post_id', post.id).eq('status', 'running')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (openError) throw openError;

    let job = openJob;
    if (!job) {
      // maxItems alto de propósito: o custo da Apify é por comentário existente, não
      // pelo teto, e sem teto folgado um post viral seria truncado.
      const maxItems = Math.max(1, Math.min(10000, Number(body?.maxItems || Deno.env.get('APIFY_COMMENTS_MAX_ITEMS') || 5000)));
      // Dispara a run e NÃO espera: quem espera o actor terminar morre na parede.
      const run = await apify(`acts/${encodeURIComponent(actorId)}/runs?timeout=${ACTOR_TIMEOUT_SECS}`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: [scrapeUrl], maxItems, scrapeReplies: false, profileScraperMode: 'short' }),
        timeoutMs: 30000,
      });
      if (!run?.id || !run?.defaultDatasetId) throw new Error('Apify não devolveu id da run/dataset');

      const { data: created, error: jobError } = await client
        .from('prospecting_jobs').insert({
          post_id: post.id,
          status: 'running',
          apify_run_id: String(run.id),
          apify_dataset_id: String(run.defaultDatasetId),
          last_progress_at: new Date().toISOString(),
          raw: { actorId, maxItems, skipped: 0 },
        }).select('id, apify_run_id, apify_dataset_id, ingested_count, dataset_total, raw').single();
      if (jobError) throw jobError;
      job = created;
    }
    jobId = job.id;

    const { data: ownAccounts } = await client.from('content_accounts').select('handle').eq('platform', 'linkedin');
    const ownHandles = new Set((ownAccounts || []).map((a) => String(a.handle || '').toLowerCase()).filter(Boolean));

    let ingested = Number(job.ingested_count || 0);
    let datasetTotal = job.dataset_total == null ? null : Number(job.dataset_total);
    let skipped = Number((job.raw as any)?.skipped || 0);
    let runStatus = 'RUNNING';

    // Ingere o quanto couber no orçamento. O dataset da Apify é append-only, então
    // dá pra consumir o que já saiu enquanto o actor ainda raspa o resto.
    while (remainingMs(deadlineAt) > INGEST_RESERVE_MS) {
      const run = await apify(`actor-runs/${job.apify_run_id}`, token, { timeoutMs: 15000 });
      runStatus = String(run?.status || 'RUNNING');
      const dataset = await apify(`datasets/${job.apify_dataset_id}`, token, { timeoutMs: 15000 });
      datasetTotal = Number(dataset?.itemCount ?? datasetTotal ?? 0);

      if (ingested >= datasetTotal) {
        if (TERMINAL_RUN_STATUS.includes(runStatus)) break;
        await wait(5000);
        continue;
      }

      const page = await apify(
        `datasets/${job.apify_dataset_id}/items?clean=true&offset=${ingested}&limit=${INGEST_PAGE_SIZE}`,
        token,
        { timeoutMs: 60000 },
      );
      const items = Array.isArray(page) ? page : [];
      if (!items.length) {
        if (TERMINAL_RUN_STATUS.includes(runStatus)) break;
        await wait(5000);
        continue;
      }

      skipped += await persistPage(client, post.id, items, ownHandles);
      ingested += items.length;

      const { error: progressError } = await client.from('prospecting_jobs').update({
        ingested_count: ingested,
        dataset_total: datasetTotal,
        total_comments: ingested,
        last_progress_at: new Date().toISOString(),
        raw: { ...(job.raw as any || {}), actorId, skipped, runStatus },
      }).eq('id', jobId);
      if (progressError) throw progressError;
    }

    // Contagens saem do banco, não de memória: com ingestão em fatias é a única
    // fonte que continua correta depois de uma retomada.
    const { count: totalLeads } = await client.from('lead_comments')
      .select('lead_id', { count: 'exact', head: true }).eq('post_id', post.id);
    const { count: opportunities } = await client.from('leads')
      .select('id', { count: 'exact', head: true }).eq('first_seen_post_id', post.id);
    const { count: pendingCount } = await client.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('first_seen_post_id', post.id).eq('enrichment_status', 'pending');
    const { count: qualifiedCount } = await client.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('first_seen_post_id', post.id).in('qualification_status', ['qualified', 'review']);

    const done = TERMINAL_RUN_STATUS.includes(runStatus) && ingested >= (datasetTotal ?? 0);
    const remaining = Math.max(0, (datasetTotal ?? ingested) - ingested);

    if (!done) {
      // Job segue aberto: a tela chama de novo e a próxima invocação continua do
      // offset gravado. Nada de status final aqui — ele ainda não é conhecido.
      await client.from('prospecting_jobs').update({
        ingested_count: ingested,
        dataset_total: datasetTotal,
        total_comments: ingested,
        total_leads: totalLeads ?? 0,
        opportunities: opportunities ?? 0,
        last_progress_at: new Date().toISOString(),
        raw: { ...(job.raw as any || {}), actorId, skipped, runStatus },
      }).eq('id', jobId);

      return json({
        success: true, done: false, jobId, status: 'running', runStatus,
        totalComments: ingested, datasetTotal, remaining,
        totalLeads: totalLeads ?? 0, opportunities: opportunities ?? 0, skipped,
      });
    }

    const failedRun = runStatus !== 'SUCCEEDED';
    const status = (failedRun || skipped) ? 'partial' : 'success';
    const notes = [
      failedRun ? `Run da Apify terminou como ${runStatus}` : '',
      skipped ? `${skipped} comentário(s) sem identificador de perfil descartado(s)` : '',
    ].filter(Boolean).join('; ');

    await client.from('prospecting_jobs').update({
      status,
      total_comments: ingested,
      total_leads: totalLeads ?? 0,
      opportunities: opportunities ?? 0,
      ingested_count: ingested,
      dataset_total: datasetTotal,
      new_qualified: (pendingCount ?? 0) > 0 ? null : (qualifiedCount ?? 0),
      finished_at: new Date().toISOString(),
      last_progress_at: new Date().toISOString(),
      error_message: notes || null,
      raw: { ...(job.raw as any || {}), actorId, skipped, runStatus },
    }).eq('id', jobId);

    return json({
      success: true, done: true, jobId, status, runStatus,
      totalComments: ingested, datasetTotal, remaining: 0,
      totalLeads: totalLeads ?? 0, opportunities: opportunities ?? 0, skipped,
    });
  } catch (error) {
    const message = errorMessage(error);
    if (jobId && client) {
      await client.from('prospecting_jobs').update({
        status: 'failed', finished_at: new Date().toISOString(), error_message: message,
      }).eq('id', jobId);
    }
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
