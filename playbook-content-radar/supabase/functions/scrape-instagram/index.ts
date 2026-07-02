import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Raspador de UM post do Instagram a partir da URL de compartilhamento, para o fluxo
// "Nova ideia" do Content Radar. Diferente da collect-instagram (que varre perfis
// inteiros no cron), aqui recebemos uma única URL e devolvemos os dados já no formato
// que o formulário do front espera — o mesmo shape do scrape-linkedin.
//
// Por que Apify e não fetch do HTML (como no LinkedIn): o Instagram joga qualquer
// requisição não autenticada num authwall, então o HTML público só traz og:image e
// uma legenda cortada, sem métricas. O actor do Apify resolve legenda completa,
// imagem, formato e likes/comentários de forma confiável.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const APIFY_API = 'https://api.apify.com/v2';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  return apify(`datasets/${run.defaultDatasetId}/items?clean=true&limit=1`, token);
}

const integer = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

function firstValue(item: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

const SHORTCODE = /instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;

// Resolve links de compartilhamento do Instagram para a URL canônica do post.
// Aceita /p/, /reel/, /tv/ e os novos /share/... (que redirecionam). Segue o redirect
// quando necessário e descarta query params de rastreio (?igsh=...).
async function resolveInstagramUrl(raw: string): Promise<string> {
  const trimmed = String(raw || '').trim();
  const direct = trimmed.match(SHORTCODE);
  if (direct) {
    const kind = /reel/i.test(direct[1]) ? 'reel' : direct[1].toLowerCase() === 'tv' ? 'tv' : 'p';
    return `https://www.instagram.com/${kind}/${direct[2]}/`;
  }
  // /share/... ou outro formato: segue o redirect para achar o shortcode.
  try {
    const response = await fetch(trimmed, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentRadar/1.0)' },
      redirect: 'follow',
    });
    const finalUrl = response.url || trimmed;
    const resolved = finalUrl.match(SHORTCODE);
    if (resolved) {
      const kind = /reel/i.test(resolved[1]) ? 'reel' : resolved[1].toLowerCase() === 'tv' ? 'tv' : 'p';
      return `https://www.instagram.com/${kind}/${resolved[2]}/`;
    }
  } catch { /* redirect falhou; devolve como veio para o Apify tentar */ }
  return trimmed.split('?')[0].split('#')[0];
}

function firstLine(caption: string) {
  return caption.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 80) || '';
}

// Normaliza o item do Apify para o mesmo shape que o front já consome (scrape-linkedin).
function normalize(item: Record<string, any>) {
  const caption = String(firstValue(item, ['caption', 'text', 'description']) || '');
  const username = String(firstValue(item, ['ownerUsername', 'username', 'ownerId']) || '');
  const fullName = String(firstValue(item, ['ownerFullName', 'fullName']) || '');
  const image = firstValue(item, ['displayUrl', 'imageUrl', 'thumbnailUrl', 'thumbnailSrc']) as string | null;
  const shortcode = String(firstValue(item, ['shortCode', 'shortcode', 'code']) || '');
  const permalink = firstValue(item, ['url', 'postUrl'])
    || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : null);

  const author = fullName || username || 'Perfil do Instagram';
  return {
    success: Boolean(caption || author || image),
    author,
    authorHeadline: username ? `@${username}` : 'Instagram',
    authorAvatar: firstValue(item, ['ownerProfilePicUrl', 'profilePicUrl']) as string | null || '',
    title: firstLine(caption),
    description: caption,
    image: image || '',
    mockLikes: integer(firstValue(item, ['likesCount', 'likes', 'likeCount'])),
    mockCommentsCount: integer(firstValue(item, ['commentsCount', 'comments', 'commentCount'])),
    mockRepostsCount: 0, // Instagram não tem repost; mantemos 0 para não exibir dado falso.
    permalink: permalink ? String(permalink) : null,
    platform: 'instagram',
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { url } = await request.json();
    if (!url || !String(url).toLowerCase().includes('instagram.com')) {
      return new Response(JSON.stringify({ success: false, error: 'URL inválida do Instagram.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = Deno.env.get('APIFY_TOKEN');
    const actorId = Deno.env.get('APIFY_INSTAGRAM_ACTOR_ID') || 'apify/instagram-scraper';
    if (!token) throw new Error('APIFY_TOKEN não configurado');

    const resolvedUrl = await resolveInstagramUrl(String(url));
    // O actor do Apify falha esporadicamente (rate limit do IG, página restrita) e devolve
    // dataset vazio ou um item de erro. Uma segunda tentativa resolve a maioria dos casos.
    let item: Record<string, any> | null = null;
    for (let attempt = 0; attempt < 2 && !item; attempt += 1) {
      if (attempt > 0) await wait(2000);
      const items = await runActor(actorId, token, {
        directUrls: [resolvedUrl],
        resultsType: 'posts',
        resultsLimit: 1,
        searchLimit: 1,
        addParentData: false,
      });
      item = Array.isArray(items)
        ? items.find((entry: any) => entry && !entry.error && (entry.caption || entry.likesCount != null || entry.shortCode)) || null
        : null;
    }
    if (!item) {
      return new Response(JSON.stringify({ success: false, error: 'Nenhum dado extraído do post do Instagram.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(normalize(item)), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
