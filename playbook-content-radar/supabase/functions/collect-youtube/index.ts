import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage, normalizeApifyYouTubeVideo, parseApifyInput, parsePublicYouTubeChannelStats } from '../_shared/content.ts';
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
  for (let attempt = 0; attempt < 10 && !['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status); attempt += 1) {
    await wait(5000);
    run = await apify(`actor-runs/${run.id}`, token);
  }
  if (run.status !== 'SUCCEEDED') throw new Error(`Actor terminou com status ${run.status || 'desconhecido'}`);
  return apify(`datasets/${run.defaultDatasetId}/items?clean=true&limit=1000`, token);
}

async function latestYouTubeSince(client: ReturnType<typeof adminClient>, accountId: string) {
  const { data, error } = await client
    .from('youtube_videos')
    .select('published_at')
    .eq('account_id', accountId)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.published_at ? String(data.published_at).slice(0, 10) : '2020-01-01';
}

function renderInput(account: Record<string, any>, since: string) {
  const maxVideos = Math.max(1, Math.min(1000, Number(Deno.env.get('APIFY_YOUTUBE_MAX_VIDEOS') || 200)));
  const template = Deno.env.get('APIFY_YOUTUBE_INPUT_JSON')
    || `{"startUrls":[{"url":"{{accountUrl}}"}],"maxResults":${maxVideos},"maxResultsShorts":${maxVideos},"maxResultStreams":0,"oldestPostDate":"{{since}}","sortVideosBy":"NEWEST","downloadSubtitles":false}`;
  return parseApifyInput(
    template
      .replaceAll('{{since}}', since)
      .replaceAll('{{handle}}', String(account.handle || ''))
      .replaceAll('{{externalId}}', String(account.external_id || '')),
    account.account_url,
  );
}

function accountStats(items: Record<string, any>[]) {
  const first = items[0] || {};
  const number = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  };
  const subscribers = number(first.channelSubscriberCount ?? first.subscriberCount ?? first.subscribers ?? first.numberOfSubscribers);
  const totalViews = number(first.channelViewCount ?? first.channelViews ?? first.totalViews) ?? items.reduce((sum, item) => sum + (number(item.viewCount ?? item.views) || 0), 0);
  return { subscribers, totalViews, totalVideos: items.length };
}

function publicChannelUrl(accountUrl: string) {
  try {
    const url = new URL(accountUrl);
    url.searchParams.set('hl', 'pt-BR');
    url.searchParams.set('gl', 'BR');
    return url.toString();
  } catch {
    const separator = accountUrl.includes('?') ? '&' : '?';
    return `${accountUrl}${separator}hl=pt-BR&gl=BR`;
  }
}

async function fetchPublicChannelStats(account: Record<string, any>) {
  const url = publicChannelUrl(String(account.account_url || ''));
  const response = await fetch(url, {
    headers: {
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`YouTube publico retornou HTTP ${response.status}`);
  const html = await response.text();
  return {
    ...parsePublicYouTubeChannelStats(html),
    sourceUrl: url,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let runId: string | null = null;
  try {
    requireCollectorSecret(request);
    const token = Deno.env.get('APIFY_TOKEN');
    const actorId = Deno.env.get('APIFY_YOUTUBE_ACTOR_ID') || 'streamers/youtube-scraper';
    const client = adminClient();
    const source = token && actorId ? 'apify_youtube' : 'public_youtube';
    runId = await startRun(client, source);
    const { data: accounts, error: accountsError } = await client.from('content_accounts').select('*').eq('platform', 'youtube').eq('status', 'active');
    if (accountsError) throw accountsError;

    const metricDate = new Date().toISOString().slice(0, 10);
    let accountsProcessed = 0;
    let itemsProcessed = 0;
    let itemErrors = 0;
    const errors: Array<{ account: string; error: string }> = [];

    for (const account of accounts || []) {
      try {
        if (source === 'public_youtube') {
          const stats = await fetchPublicChannelStats(account);
          const { error: accountMetricError } = await client.from('account_daily_metrics').upsert({
            account_id: account.id,
            metric_date: metricDate,
            subscribers: stats.subscribers,
            total_views: null,
            total_videos: stats.totalVideos,
            source,
            raw: { accountUrl: account.account_url, sourceUrl: stats.sourceUrl, fetchedAt: new Date().toISOString(), parser: 'public_youtube_channel_page' },
          }, { onConflict: 'account_id,metric_date,source' });
          if (accountMetricError) throw accountMetricError;
        } else {
          const since = await latestYouTubeSince(client, account.id);
          const input = renderInput(account, since);
          const rawItems = await runActor(actorId, token, input);
          const items = Array.isArray(rawItems) ? rawItems : [];
          const stats = accountStats(items);

          const { error: accountMetricError } = await client.from('account_daily_metrics').upsert({
            account_id: account.id,
            metric_date: metricDate,
            subscribers: stats.subscribers,
            total_views: stats.totalViews,
            total_videos: stats.totalVideos,
            source,
            raw: { input, firstItem: items[0] || null },
          }, { onConflict: 'account_id,metric_date,source' });
          if (accountMetricError) throw accountMetricError;

          for (const item of items) {
            try {
              const normalized = normalizeApifyYouTubeVideo(item, metricDate);
              // Preserve classification on re-collection (default 'pending' applies on insert).
              const { classification_status: _clsStatus, ...videoFields } = normalized.video;
              const { data: savedVideo, error: videoError } = await client.from('youtube_videos')
                .upsert({ ...videoFields, account_id: account.id }, { onConflict: 'video_id' }).select('id').single();
              if (videoError) throw videoError;
              const { error: metricError } = await client.from('youtube_video_daily_metrics')
                .upsert({ ...normalized.metric, video_id: savedVideo.id }, { onConflict: 'video_id,metric_date,source' });
              if (metricError) throw metricError;
              itemsProcessed += 1;
            } catch (itemError) {
              itemErrors += 1;
              console.error(`Erro ao salvar vídeo do YouTube (${account.owner_name}):`, errorMessage(itemError));
            }
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
