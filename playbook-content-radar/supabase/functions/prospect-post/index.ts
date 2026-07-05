import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { collectorDeadline, runActor } from '../_shared/apify.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';

// Fase 1 da prospecção: raspa os comentários de UM post, deduplica os comentaristas
// contra o banco de leads e grava o rastro (lead_comments) + as contagens do job.
// NÃO enriquece nem qualifica ainda (isso é a Fase 2, enrich-leads). Disparado pelo
// botão "Prospectar" da tabela de posts (modo manual) ou pelo cron/botão geral
// futuro (com x-collector-secret), igual ao collect-instagram.
// Ver docs/superpowers/plans/2026-07-04-warm-prospecting-from-commenters.md

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

    const { data: job, error: jobError } = await client
      .from('prospecting_jobs').insert({ post_id: post.id, status: 'running' }).select('id').single();
    if (jobError) throw jobError;
    jobId = job.id;

    const maxItems = Math.max(1, Math.min(2000, Number(Deno.env.get('APIFY_COMMENTS_MAX_ITEMS') || 1000)));
    const deadlineAt = collectorDeadline();
    const items = await runActor(actorId, token, {
      posts: [scrapeUrl],
      maxItems,
      scrapeReplies: false,
      profileScraperMode: 'short',
    }, deadlineAt);

    const rawItems = Array.isArray(items) ? items : [];

    // Donos das contas monitoradas não são leads (Victor/Fernando respondem os
    // próprios posts — apareceriam em toda extração).
    const { data: ownAccounts } = await client.from('content_accounts').select('handle').eq('platform', 'linkedin');
    const ownHandles = new Set((ownAccounts || []).map((a) => String(a.handle || '').toLowerCase()).filter(Boolean));

    // Deduplica os comentaristas do próprio post pela public_identifier (uma pessoa
    // pode comentar mais de uma vez). Guardamos o comentário mais recente por pessoa.
    const byIdentifier = new Map<string, ReturnType<typeof normalizeComment> & { raw?: Record<string, unknown> }>();
    let skipped = 0;
    for (const item of rawItems) {
      const c = normalizeComment(item);
      const key = c.publicIdentifier || c.profileUrl;
      if (!key) { skipped += 1; continue; }
      const identifier = c.publicIdentifier || extractPublicIdentifier(String(c.profileUrl));
      if (identifier && ownHandles.has(identifier)) continue;
      byIdentifier.set(key, { ...c, publicIdentifier: identifier, raw: item });
    }

    const commenters = [...byIdentifier.entries()].map(([key, c]) => ({ key, ...c }));
    const identifiers = commenters.map((c) => c.publicIdentifier).filter(Boolean) as string[];

    // Quem já está no banco = já prospectamos/vimos antes. Os novos = oportunidades.
    const existingIdMap = new Map<string, string>();
    if (identifiers.length) {
      const { data: existing, error: existingError } = await client
        .from('leads').select('id, public_identifier').in('public_identifier', identifiers);
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
        first_seen_post_id: post.id,
        enrichment_status: 'pending',
        profile_raw: { comment_scrape: { headline: c.headline, name: c.fullName } },
      }));
      // upsert (não insert) para tolerar corrida com outro job que insira a mesma
      // pessoa; onConflict devolve a linha existente sem estourar.
      const { data: inserted, error: insertError } = await client
        .from('leads').upsert(rows, { onConflict: 'public_identifier', ignoreDuplicates: false })
        .select('id, public_identifier');
      if (insertError) throw insertError;
      for (const row of inserted || []) if (row.public_identifier) existingIdMap.set(row.public_identifier, row.id);
    }

    // Grava o rastro de comentários (uma linha por post+lead).
    const commentRows = commenters
      .map((c) => {
        const leadId = c.publicIdentifier ? existingIdMap.get(c.publicIdentifier) : null;
        if (!leadId) return null;
        return {
          post_id: post.id,
          lead_id: leadId,
          comment_text: c.commentText,
          comment_urn: c.commentUrn ? String(c.commentUrn) : null,
          commented_at: toTimestamp(c.commentedAt),
          raw: (c as any).raw || {},
        };
      })
      .filter(Boolean);
    if (commentRows.length) {
      const { error: commentError } = await client
        .from('lead_comments').upsert(commentRows as any[], { onConflict: 'post_id,lead_id' });
      if (commentError) throw commentError;
    }

    // new_qualified: num re-run o job novo não pode "apagar" o contador — recalcula
    // dos leads já qualificados deste post; fica null enquanto houver análise pendente
    // (o enrich-leads atualiza depois).
    const { count: pendingCount } = await client.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('first_seen_post_id', post.id).eq('enrichment_status', 'pending');
    const { count: qualifiedCount } = await client.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('first_seen_post_id', post.id).eq('qualification_status', 'qualified');

    const status = skipped ? 'partial' : 'success';
    await client.from('prospecting_jobs').update({
      status,
      total_comments: rawItems.length,
      total_leads: commenters.length,
      opportunities: newCommenters.length,
      new_qualified: (pendingCount ?? 0) > 0 ? null : (qualifiedCount ?? 0),
      finished_at: new Date().toISOString(),
      error_message: skipped ? `${skipped} comentário(s) sem identificador de perfil descartado(s)` : null,
      raw: { skipped, actorId },
    }).eq('id', jobId);

    return json({
      success: true,
      jobId,
      status,
      totalComments: rawItems.length,
      totalLeads: commenters.length,
      opportunities: newCommenters.length,
      skipped,
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
