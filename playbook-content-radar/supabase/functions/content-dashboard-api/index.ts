import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { apiRoute, contentQuery } from '../_shared/api.ts';
import { errorMessage, normalizeApifyPost } from '../_shared/content.ts';
import { adminClient, corsHeaders, json, requireCollectorSecret } from '../_shared/server.ts';

function applyFilters(query: any, url: URL) {
  const filters = contentQuery(url);
  if (filters.owner) query = query.eq('owner_name', filters.owner);
  if (filters.from) query = query.gte('published_at', `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte('published_at', `${filters.to}T23:59:59Z`);
  if (filters.theme) query = query.eq('theme', filters.theme);
  if (filters.format) query = query.eq('format', filters.format);
  if (filters.cta) query = filters.cta === 'Sem CTA' ? query.is('cta_keyword', null) : query.eq('cta_keyword', filters.cta);
  return query.order(filters.sort, { ascending: false });
}

async function proxyCollector(name: string, body: unknown) {
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('COLLECTOR_SHARED_SECRET');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!projectUrl || !secret) throw new Error('Configuração interna de coleta ausente');
  const response = await fetch(`${projectUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-collector-secret': secret, ...(apiKey ? { apikey: apiKey } : {}) },
    body: JSON.stringify(body || {}),
  });
  return { status: response.status, body: await response.json() };
}

async function importHistory(client: any, payload: Record<string, any>) {
  const { owner, accountUrl, collectedAt, items, fileName = 'uploaded.json' } = payload;
  if (!owner || !accountUrl || !/^\d{4}-\d{2}-\d{2}$/.test(collectedAt || '') || !Array.isArray(items)) {
    throw new Error('owner, accountUrl, collectedAt (YYYY-MM-DD) e items[] são obrigatórios');
  }
  const { data: account, error: accountError } = await client.from('content_accounts').upsert({
    platform: 'linkedin', owner_name: owner, account_name: `${owner} LinkedIn`, account_url: accountUrl, status: 'active',
  }, { onConflict: 'platform,account_url' }).select('id').single();
  if (accountError) throw accountError;
  const { data: batch, error: batchError } = await client.from('import_batches').insert({
    source: 'historical_json', platform: 'linkedin', owner_name: owner, file_name: fileName,
    collected_at: `${collectedAt}T12:00:00Z`, total_items: items.length, status: 'running',
  }).select('id').single();
  if (batchError) throw batchError;
  let imported = 0;
  const skipped: Array<{ index: number; error: string }> = [];
  for (const [index, item] of items.entries()) {
    try {
      const normalized = normalizeApifyPost(item, collectedAt);
      // Omit classification_status on upsert: on INSERT the column default ('pending')
      // applies; on CONFLICT the existing classified/manual value is preserved instead
      // of being reset to 'pending' by every re-import.
      const { classification_status: _clsStatus, ...postFields } = normalized.post;
      const { data: post, error: postError } = await client.from('content_posts').upsert({ ...postFields, account_id: account.id }, { onConflict: 'external_post_id' }).select('id').single();
      if (postError) throw postError;
      const { error: metricError } = await client.from('content_post_daily_metrics').upsert({
        ...normalized.metric, post_id: post.id, source: 'historical_json', metric_type: 'snapshot', import_batch_id: batch.id,
      }, { onConflict: 'post_id,metric_date,source', ignoreDuplicates: true });
      if (metricError) throw metricError;
      imported += 1;
    } catch (error) {
      skipped.push({ index, error: errorMessage(error) });
    }
  }
  await client.from('import_batches').update({
    imported_items: imported, skipped_items: skipped.length,
    status: skipped.length ? (imported ? 'partial' : 'failed') : 'success', raw_metadata: { skipped },
  }).eq('id', batch.id);
  return { batchId: batch.id, imported, skipped };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const client = adminClient();
    const url = new URL(request.url);
    const route = apiRoute(request.url);

    if (request.method === 'GET' && route === '/overview') {
      const { data: linkedin, error: linkedInError } = await applyFilters(client.from('v_latest_linkedin_post_metrics').select('*'), url);
      if (linkedInError) throw linkedInError;
      const { data: youtube, error: youtubeError } = await client.from('v_latest_youtube_video_metrics').select('*');
      if (youtubeError) throw youtubeError;
      const linkedInRows: Record<string, any>[] = linkedin || [];
      const youtubeRows: Record<string, any>[] = youtube || [];
      const totals = {
        linkedinPosts: linkedInRows.length,
        youtubeVideos: youtubeRows.length,
        engagementTotal: [...linkedInRows, ...youtubeRows].reduce((sum, row) => sum + Number(row.engagement_total || 0), 0),
        comments: [...linkedInRows, ...youtubeRows].reduce((sum, row) => sum + Number(row.comments || 0), 0),
        likes: [...linkedInRows, ...youtubeRows].reduce((sum, row) => sum + Number(row.likes || 0), 0),
        shares: linkedInRows.reduce((sum, row) => sum + Number(row.shares || 0), 0),
        youtubeViews: youtubeRows.reduce((sum, row) => sum + Number(row.views || 0), 0),
      };
      return json({ period: { from: url.searchParams.get('from'), to: url.searchParams.get('to') }, totals, topContent: linkedInRows.slice(0, 10) });
    }

    if (request.method === 'GET' && route === '/linkedin/posts') {
      const { data, error } = await applyFilters(client.from('v_latest_linkedin_post_metrics').select('*'), url);
      if (error) throw error;
      return json({ data: data || [] });
    }
    const postHistoryMatch = route.match(/^\/linkedin\/posts\/([0-9a-f-]+)\/history$/i);
    if (request.method === 'GET' && postHistoryMatch) {
      const { data, error } = await client.from('content_post_daily_metrics')
        .select('id, metric_date, metric_type, likes, comments, shares, reactions_total, views, engagement_total, engagement_score, source, created_at')
        .eq('post_id', postHistoryMatch[1])
        .order('metric_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return json({ data: data || [] });
    }
    if (request.method === 'GET' && route === '/youtube/videos') {
      const { data, error } = await applyFilters(client.from('v_latest_youtube_video_metrics').select('*'), url);
      if (error) throw error;
      return json({ data: data || [] });
    }
    if (request.method === 'GET' && route === '/accounts') {
      const { data, error } = await client.from('content_accounts').select('*').order('platform').order('owner_name');
      if (error) throw error;
      return json({ data: data || [] });
    }

    requireCollectorSecret(request);
    const payload = await request.json().catch(() => ({}));
    if (request.method === 'POST' && route === '/accounts') {
      const { data, error } = await client.from('content_accounts').insert(payload).select('*').single();
      if (error) throw error;
      return json({ data }, 201);
    }
    const accountMatch = route.match(/^\/accounts\/([0-9a-f-]+)$/i);
    if (request.method === 'PATCH' && accountMatch) {
      const { data, error } = await client.from('content_accounts').update(payload).eq('id', accountMatch[1]).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'Conta não encontrada', id: accountMatch[1] }, 404);
      return json({ data });
    }
    const postMatch = route.match(/^\/linkedin\/posts\/([0-9a-f-]+)$/i);
    if (request.method === 'PATCH' && postMatch) {
      const allowed = ['format', 'theme', 'cta_keyword', 'content_pillar', 'funnel_stage', 'commercial_intent'];
      const update = Object.fromEntries(allowed.filter((key) => Object.hasOwn(payload, key)).map((key) => [key, payload[key]]));
      if (!Object.keys(update).length) throw new Error('Nenhum campo editável foi informado');
      const { data, error } = await client.from('content_posts')
        .update({ ...update, classification_status: 'manual' })
        .eq('id', postMatch[1])
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'Post não encontrado', id: postMatch[1] }, 404);
      return json({ data });
    }
    if (request.method === 'POST' && route === '/imports/linkedin-history') return json(await importHistory(client, payload), 201);
    if (request.method === 'POST' && route === '/jobs/collect-youtube') { const result = await proxyCollector('collect-youtube', payload); return json(result.body, result.status); }
    if (request.method === 'POST' && route === '/jobs/collect-linkedin') { const result = await proxyCollector('collect-linkedin', payload); return json(result.body, result.status); }
    if (request.method === 'POST' && (route === '/classify/posts' || route === '/classify/videos')) { const result = await proxyCollector('classify-content', payload); return json(result.body, result.status); }
    return json({ error: 'Rota não encontrada', route }, 404);
  } catch (error) {
    const message = errorMessage(error);
    return json({ error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
