import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { collectorDeadline, remainingMs, runActor } from '../_shared/apify.ts';
import { buildYouTubeCollectorInput, errorMessage, normalizeApifyYouTubeVideo, parsePublicYouTubeChannelStats, youtubeRefreshSince } from '../_shared/content.ts';
import { adminClient, corsHeaders, finishRun, json, requireCollectorSecret, startRun } from '../_shared/server.ts';

function renderInput(account: Record<string, any>) {
  const maxVideos = Math.max(1, Math.min(1000, Number(Deno.env.get('APIFY_YOUTUBE_MAX_VIDEOS') || 200)));
  const refreshDays = Math.trunc(Number(Deno.env.get('APIFY_YOUTUBE_REFRESH_DAYS') || 365));
  return buildYouTubeCollectorInput(account, {
    since: youtubeRefreshSince(new Date(), refreshDays),
    maxVideos,
    template: Deno.env.get('APIFY_YOUTUBE_INPUT_JSON'),
  });
}

function accountStats(items: Record<string, any>[]) {
  const number = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  };
  // O actor devolve itens heterogêneos (vídeos, shorts, canal) e nem todo item traz os
  // dados do canal — varre todos até achar em vez de confiar só no primeiro.
  let subscribers: number | null = null;
  let channelViews: number | null = null;
  for (const item of items) {
    subscribers ??= number(item.channelSubscriberCount ?? item.subscriberCount ?? item.subscribers ?? item.numberOfSubscribers);
    channelViews ??= number(item.channelViewCount ?? item.channelViews ?? item.totalViews);
    if (subscribers != null && channelViews != null) break;
  }
  const totalViews = channelViews ?? items.reduce((sum, item) => sum + (number(item.viewCount ?? item.views) || 0), 0);
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
    const deadlineAt = collectorDeadline();
    runId = await startRun(client, source);
    const { data: accounts, error: accountsError } = await client.from('content_accounts').select('*').eq('platform', 'youtube').eq('status', 'active');
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
          const input = renderInput(account);
          // source === 'apify_youtube' garante token presente (ver derivação de `source`).
          const rawItems = await runActor(actorId, token!, input, deadlineAt);
          const items = Array.isArray(rawItems) ? rawItems : [];
          const stats = accountStats(items);

          // Se nenhum item do actor trouxe o total de inscritos, cai no HTML público do
          // canal — é justamente o número que o dashboard de crescimento acompanha.
          if (stats.subscribers == null) {
            try {
              const publicStats = await fetchPublicChannelStats(account);
              stats.subscribers = publicStats.subscribers;
            } catch (publicError: any) {
              console.error(`Inscritos indisponíveis para ${account.owner_name}:`, publicError?.message || publicError);
            }
          }

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
              const message = errorMessage(itemError);
              // O actor mistura no dataset itens que não são vídeos (cards de canal,
              // playlists) e que não têm id — ignorar sem contar como erro, senão
              // todo run vira "partial" à toa.
              if (/sem id/i.test(message)) continue;
              itemErrors += 1;
              console.error(`Erro ao salvar vídeo do YouTube (${account.owner_name}):`, message);
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
