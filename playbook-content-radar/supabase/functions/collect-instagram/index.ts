import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage, parseApifyInput } from '../_shared/content.ts';
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

function detectInstagramFormat(item: Record<string, any>): string {
  const type = String(item.type || item.productType || item.mediaType || '').toLowerCase();
  if (type.includes('reel') || type === 'clips' || type === 'reels') return 'reel';
  if (type.includes('video') || type === 'igtv') return 'video';
  if (type.includes('carousel') || type === 'carousel_album' || type === 'sidecar') return 'carousel';
  if (type.includes('story')) return 'story';
  // Check media children for carousel detection
  const children = item.childPosts || item.sidecarMedias || item.carouselMedias;
  if (Array.isArray(children) && children.length > 1) return 'carousel';
  // Check for video indicators
  if (item.videoUrl || item.isVideo || item.videoDuration) return 'reel';
  return 'image';
}

function hook(content: unknown) {
  return String(content || '').split(/\r?\n/).map((line: string) => line.trim()).find(Boolean)?.slice(0, 240) || '';
}

function cta(content: unknown) {
  const text = String(content || '');
  const quoted = text.match(/\bcoment(?:a|e)\s+["'"']\s*([\p{L}\p{N}_-]+)\s*["'"']/iu);
  const unquoted = text.match(/\bcoment(?:a|e)\s+([\p{L}\p{N}_-]+)/iu)?.[1];
  const uppercase = unquoted && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9_-]{0,29}$/u.test(unquoted) ? unquoted : null;
  const rawKeyword = quoted?.[1] || uppercase;
  if (!rawKeyword) return null;
  const keyword = rawKeyword.replace(/["'""''.,!?;:]+$/g, '').toUpperCase();
  return ['AQUI', 'ABAIXO', 'AGORA', 'ISSO'].includes(keyword) ? null : keyword;
}

function normalizeInstagramPost(item: Record<string, any>, metricDate: string) {
  const caption = String(firstValue(item, ['caption', 'text', 'description']) || '');
  const externalId = String(firstValue(item, ['id', 'pk', 'postId', 'inputUrl']) || item.shortCode || '').trim();
  if (!externalId) throw new Error('Post do Instagram sem id');

  const shortcode = String(firstValue(item, ['shortCode', 'shortcode', 'code']) || '');
  const postUrl = firstValue(item, ['url', 'postUrl', 'webLink'])
    || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : null);
  const format = detectInstagramFormat(item);
  const published = firstValue(item, ['timestamp', 'date', 'takenAt', 'postedAt', 'publishedAt']);

  return {
    post: {
      external_post_id: externalId,
      post_url: postUrl ? String(postUrl) : null,
      shortcode: shortcode || null,
      published_at: published ? new Date(typeof published === 'number' ? published * 1000 : published).toISOString() : null,
      caption,
      hook: hook(caption),
      format,
      cta_keyword: cta(caption),
      is_repost: false,
      media_url: firstValue(item, ['displayUrl', 'imageUrl', 'thumbnailUrl', 'videoUrl']) as string | null,
      media_type: format === 'reel' || format === 'video' ? 'video' : format,
      classification_status: 'pending',
      raw: item,
    },
    metric: {
      metric_date: metricDate,
      likes: integer(firstValue(item, ['likesCount', 'likes', 'likeCount'])),
      comments: integer(firstValue(item, ['commentsCount', 'comments', 'commentCount'])),
      shares: integer(firstValue(item, ['sharesCount', 'shares', 'shareCount'])),
      saves: integer(firstValue(item, ['savesCount', 'saves', 'saveCount'])),
      views: firstValue(item, ['videoViewCount', 'views', 'viewCount', 'videoPlayCount']) == null
        ? null
        : integer(firstValue(item, ['videoViewCount', 'views', 'viewCount', 'videoPlayCount'])),
      plays: firstValue(item, ['videoPlayCount', 'plays', 'playCount']) == null
        ? null
        : integer(firstValue(item, ['videoPlayCount', 'plays', 'playCount'])),
      source: 'apify_instagram',
      raw: item,
    },
  };
}

function renderInput(account: Record<string, any>) {
  const maxPosts = Math.max(1, Math.min(1000, Number(Deno.env.get('APIFY_INSTAGRAM_MAX_POSTS') || 200)));
  const template = Deno.env.get('APIFY_INSTAGRAM_INPUT_JSON')
    || `{"directUrls":["{{accountUrl}}"],"resultsLimit":${maxPosts},"resultsType":"posts","searchLimit":1}`;
  return parseApifyInput(
    template.replaceAll('{{handle}}', String(account.handle || '')),
    account.account_url,
  );
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let runId: string | null = null;
  try {
    requireCollectorSecret(request);
    const token = Deno.env.get('APIFY_TOKEN');
    const actorId = Deno.env.get('APIFY_INSTAGRAM_ACTOR_ID') || 'apify/instagram-scraper';
    if (!token || !actorId) throw new Error('APIFY_TOKEN e APIFY_INSTAGRAM_ACTOR_ID são obrigatórios');
    const client = adminClient();
    runId = await startRun(client, 'apify_instagram');
    const { data: accounts, error: accountsError } = await client.from('content_accounts').select('*').eq('platform', 'instagram').eq('status', 'active');
    if (accountsError) throw accountsError;

    const metricDate = new Date().toISOString().slice(0, 10);
    let accountsProcessed = 0;
    let itemsProcessed = 0;
    const errors: Array<{ account: string; error: string }> = [];

    for (const account of accounts || []) {
      try {
        const input = renderInput(account);
        const items = await runActor(actorId, token, input);
        for (const item of Array.isArray(items) ? items : []) {
          try {
            const normalized = normalizeInstagramPost(item, metricDate);
            const { data: savedPost, error: postError } = await client.from('instagram_posts')
              .upsert({ ...normalized.post, account_id: account.id }, { onConflict: 'external_post_id' }).select('id').single();
            if (postError) throw postError;
            const { error: metricError } = await client.from('instagram_post_daily_metrics')
              .upsert({ ...normalized.metric, post_id: savedPost.id }, { onConflict: 'post_id,metric_date,source' });
            if (metricError) throw metricError;
            itemsProcessed += 1;
          } catch (itemError) {
            console.error(`Erro ao normalizar post do Instagram:`, errorMessage(itemError));
          }
        }

        // Track followers count
        try {
          const profileInput = { directUrls: [account.account_url], resultsType: 'details', resultsLimit: 1 };
          const profileResults = await runActor(actorId, token, profileInput);
          const profileData = Array.isArray(profileResults) ? profileResults[0] : null;
          const followers = profileData ? integer(firstValue(profileData, ['followersCount', 'followers', 'followerCount'])) : 0;
          if (followers > 0) {
            const { error: growthError } = await client.from('account_daily_metrics').upsert({
              account_id: account.id,
              metric_date: metricDate,
              followers,
              source: 'apify_instagram_profile',
              raw: { firstItem: profileData },
            }, { onConflict: 'account_id,metric_date,source' });
            if (growthError) console.error('Erro ao salvar seguidores Instagram:', growthError.message);
          }
        } catch (e: any) {
          console.error(`Erro ao coletar seguidores do Instagram para ${account.owner_name}:`, e.message);
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
