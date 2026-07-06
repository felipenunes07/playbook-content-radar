import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { COMMERCIAL_INTENTS, errorMessage, FUNNEL_STAGES, PILLARS, THEMES, validateClassification } from '../_shared/content.ts';
import { adminClient, corsHeaders, finishRun, json, requireCollectorSecret, startRun } from '../_shared/server.ts';
import { llmHeaders, requireClassificationProviders, withLlmFallback } from '../_shared/llm.ts';

function parseModelJson(response: Record<string, any>) {
  if (response.theme) return response;
  const content = response.choices?.[0]?.message?.content || response.output_text;
  if (!content) throw new Error('Modelo não retornou conteúdo');
  return JSON.parse(String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

async function classify(content: string, author: string, format: string) {
  const providers = requireClassificationProviders();
  const prompt = `Classifique este conteúdo da Playbook Lab. Retorne somente JSON válido com theme, content_pillar, cta_keyword, funnel_stage e commercial_intent.\n\nValores permitidos:\ntheme: ${THEMES.join(', ')}\ncontent_pillar: ${PILLARS.join(', ')}\nfunnel_stage: ${FUNNEL_STAGES.join(', ')}\ncommercial_intent: ${COMMERCIAL_INTENTS.join(', ')}\n\nAutor: ${author}\nFormato: ${format}\nConteúdo:\n${content.slice(0, 12000)}`;
  return withLlmFallback(providers, async (provider) => {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: llmHeaders(provider),
      body: JSON.stringify({ model: provider.model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `Classification API ${response.status}`);
    return validateClassification(parseModelJson(body));
  }, (provider, error) => console.warn(`Classificação: provedor ${provider.label} falhou (${errorMessage(error)}), tentando próximo.`));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let runId: string | null = null;
  try {
    requireCollectorSecret(request);
    const client = adminClient();
    runId = await startRun(client, 'classification');
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(100, Number(body.limit || 25)));
    const { data: posts, error: postsError } = await client.from('content_posts').select('id,content,author_name,format').eq('classification_status', 'pending').limit(limit);
    if (postsError) throw postsError;
    const remaining = Math.max(0, limit - (posts?.length || 0));
    const { data: videos, error: videosError } = remaining
      ? await client.from('youtube_videos').select('id,title,description').eq('classification_status', 'pending').limit(remaining)
      : { data: [], error: null };
    if (videosError) throw videosError;

    let processed = 0;
    const errors: Array<{ type: string; id: string; error: string }> = [];
    for (const post of posts || []) {
      try {
        await client.from('content_posts').update({ classification_status: 'processing' }).eq('id', post.id);
        const result = await classify(post.content, post.author_name || '', post.format || 'unknown');
        const { error } = await client.from('content_posts').update(result).eq('id', post.id);
        if (error) throw error;
        processed += 1;
      } catch (error) {
        const message = errorMessage(error);
        errors.push({ type: 'post', id: post.id, error: message });
        await client.from('content_posts').update({ classification_status: 'error', classification_error: message }).eq('id', post.id);
      }
    }
    for (const video of videos || []) {
      try {
        await client.from('youtube_videos').update({ classification_status: 'processing' }).eq('id', video.id);
        const result = await classify(`${video.title}\n\n${video.description}`, '', 'video');
        const { cta_keyword: _cta, funnel_stage: _funnel, commercial_intent: _intent, ...videoResult } = result;
        const { error } = await client.from('youtube_videos').update(videoResult).eq('id', video.id);
        if (error) throw error;
        processed += 1;
      } catch (error) {
        const message = errorMessage(error);
        errors.push({ type: 'video', id: video.id, error: message });
        await client.from('youtube_videos').update({ classification_status: 'error', classification_error: message }).eq('id', video.id);
      }
    }

    const status = errors.length ? (processed ? 'partial' : 'failed') : 'success';
    await finishRun(client, runId, { status, items_processed: processed, error_message: errors.length ? `${errors.length} classificação(ões) falharam` : null, raw: { errors } });
    return json({ success: status !== 'failed', runId, status, processed, errors });
  } catch (error) {
    const message = errorMessage(error);
    if (runId) await finishRun(adminClient(), runId, { status: 'failed', error_message: message });
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
