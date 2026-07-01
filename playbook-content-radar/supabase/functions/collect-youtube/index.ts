import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { chunk, errorMessage, normalizeYouTubeVideo } from '../_shared/content.ts';
import { adminClient, corsHeaders, finishRun, json, requireCollectorSecret, startRun } from '../_shared/server.ts';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

async function youtube(path: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `YouTube API ${response.status}`);
  return body;
}

async function resolveChannel(account: Record<string, any>, apiKey: string) {
  const params: Record<string, string> = { part: 'id,snippet,statistics,contentDetails' };
  if (account.external_id) params.id = account.external_id;
  else if (account.handle) params.forHandle = String(account.handle).replace(/^@/, '');
  else throw new Error(`Conta ${account.owner_name} sem external_id ou handle`);
  const result = await youtube('channels', params, apiKey);
  if (!result.items?.[0]) throw new Error(`Canal não encontrado para ${account.owner_name}`);
  return result.items[0];
}

async function listUploadIds(playlistId: string, apiKey: string, limit: number) {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const result = await youtube('playlistItems', {
      part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}),
    }, apiKey);
    ids.push(...(result.items || []).map((item: any) => item.contentDetails?.videoId).filter(Boolean));
    pageToken = result.nextPageToken || '';
  } while (pageToken && ids.length < limit);
  return ids.slice(0, limit);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let runId: string | null = null;
  try {
    requireCollectorSecret(request);
    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) throw new Error('YOUTUBE_API_KEY não configurado');
    const client = adminClient();
    runId = await startRun(client, 'youtube_data_api');
    const { data: accounts, error: accountsError } = await client.from('content_accounts').select('*').eq('platform', 'youtube').eq('status', 'active');
    if (accountsError) throw accountsError;

    const metricDate = new Date().toISOString().slice(0, 10);
    const maxVideos = Math.max(1, Math.min(500, Number(Deno.env.get('YOUTUBE_MAX_VIDEOS') || 200)));
    let accountsProcessed = 0;
    let itemsProcessed = 0;
    const errors: Array<{ account: string; error: string }> = [];

    for (const account of accounts || []) {
      try {
        const channel = await resolveChannel(account, apiKey);
        const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) throw new Error('Playlist de uploads não disponível');
        const videoIds = await listUploadIds(uploads, apiKey, maxVideos);
        const videos: Record<string, any>[] = [];
        for (const batch of chunk(videoIds, 50)) {
          if (!batch.length) continue;
          const result = await youtube('videos', { part: 'snippet,statistics,contentDetails', id: batch.join(',') }, apiKey);
          videos.push(...(result.items || []));
        }

        const stats = channel.statistics || {};
        const { error: accountMetricError } = await client.from('account_daily_metrics').upsert({
          account_id: account.id,
          metric_date: metricDate,
          subscribers: stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount || 0),
          total_views: Number(stats.viewCount || 0),
          total_videos: Number(stats.videoCount || videos.length),
          source: 'youtube_data_api',
          raw: channel,
        }, { onConflict: 'account_id,metric_date,source' });
        if (accountMetricError) throw accountMetricError;

        for (const item of videos) {
          const normalized = normalizeYouTubeVideo(item, metricDate);
          const { data: savedVideo, error: videoError } = await client.from('youtube_videos')
            .upsert({ ...normalized.video, account_id: account.id }, { onConflict: 'video_id' }).select('id').single();
          if (videoError) throw videoError;
          const { error: metricError } = await client.from('youtube_video_daily_metrics')
            .upsert({ ...normalized.metric, video_id: savedVideo.id }, { onConflict: 'video_id,metric_date,source' });
          if (metricError) throw metricError;
          itemsProcessed += 1;
        }

        await client.from('content_accounts').update({ external_id: channel.id, last_collected_at: new Date().toISOString(), last_error: null }).eq('id', account.id);
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
