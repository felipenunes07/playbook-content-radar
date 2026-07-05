import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';

// Backfill de miniaturas: posts importados do histórico não guardaram media_url
// (raw veio vazio). Aqui buscamos o HTML público do post e extraímos o og:image —
// mesma técnica do scrape-linkedin do fluxo "Nova ideia", que já funciona.
// Re-invocável em lotes; quem falhar (authwall/sem og:image) é marcado no raw pra
// não ser tentado de novo em loop infinito.

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildPostUrl(post: Record<string, any>): string | null {
  if (post.post_url && String(post.post_url).includes('linkedin.com')) return String(post.post_url);
  for (const candidate of [post.external_post_id, post.entity_id, post.share_urn]) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    if (/^\d{8,}$/.test(value)) return `https://www.linkedin.com/feed/update/urn:li:activity:${value}`;
    const idMatch = value.match(/(?:activity|ugcPost|share)[-:](\d{8,})/i);
    if (idMatch) return `https://www.linkedin.com/feed/update/urn:li:activity:${idMatch[1]}`;
  }
  return null;
}

async function fetchOgImage(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();
  const match = html.match(/property="og:image"\s+content="([^"]+)"/i)
    || html.match(/content="([^"]+)"\s+property="og:image"/i);
  const image = match ? match[1].replace(/&amp;/g, '&') : null;
  // og:image genérico do LinkedIn (logo/placeholder da plataforma) não ajuda.
  if (!image || /static\.licdn\.com|linkedin\.com\/sc\/h\//i.test(image)) return null;
  return image;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await request.json().catch(() => ({}));
    const expectedSecret = Deno.env.get('COLLECTOR_SHARED_SECRET');
    const hasSecret = Boolean(expectedSecret) && request.headers.get('x-collector-secret') === expectedSecret;
    if (!hasSecret && body?.manual !== true) throw new Error('Execução não autorizada');

    const client = adminClient();
    const limit = Math.max(1, Math.min(25, Number(body.limit || 15)));
    const { data: posts, error: postsError } = await client.from('content_posts')
      .select('id, post_url, external_post_id, entity_id, share_urn, raw')
      .is('media_url', null)
      .eq('platform', 'linkedin')
      .order('published_at', { ascending: false })
      .limit(200);
    if (postsError) throw postsError;

    const candidates = (posts || [])
      .filter((post) => !(post.raw && (post.raw as Record<string, unknown>).media_backfill_failed))
      .slice(0, limit);

    let updated = 0;
    let failed = 0;
    for (const post of candidates) {
      try {
        const url = buildPostUrl(post);
        const image = url ? await fetchOgImage(url) : null;
        if (image) {
          await client.from('content_posts').update({ media_url: image, media_type: 'image' }).eq('id', post.id);
          updated += 1;
        } else {
          failed += 1;
          await client.from('content_posts').update({ raw: { ...(post.raw || {}), media_backfill_failed: true } }).eq('id', post.id);
        }
      } catch (postError) {
        failed += 1;
        console.error('Backfill de mídia falhou:', errorMessage(postError));
        await client.from('content_posts').update({ raw: { ...(post.raw || {}), media_backfill_failed: true } }).eq('id', post.id);
      }
      await wait(700);
    }

    const remaining = (posts || []).filter((post) => !(post.raw && (post.raw as Record<string, unknown>).media_backfill_failed)).length - candidates.length;
    return json({ success: true, updated, failed, remaining: Math.max(0, remaining) });
  } catch (error) {
    const message = errorMessage(error);
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
