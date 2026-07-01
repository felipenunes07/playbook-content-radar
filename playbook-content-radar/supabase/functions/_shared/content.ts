export const THEMES = ['IA', 'Automação', 'CRM', 'Prospecção', 'Vendas', 'Conteúdo', 'Bastidor', 'Comunidade', 'Produto', 'Contratação', 'Opinativo', 'Pessoal'];
export const PILLARS = ['IA & LLMs', 'Vendas & SDR/BDR', 'Automação', 'Marca pessoal', 'Produto/Oferta', 'Comunidade'];
export const FUNNEL_STAGES = ['awareness', 'lead_magnet', 'conversion', 'community', 'hiring', 'authority', 'personal'];
export const COMMERCIAL_INTENTS = ['none', 'low', 'medium', 'high'];

const integer = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

export function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Chunk size inválido');
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function firstValue(item: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function detectFormat(post: Record<string, unknown>) {
  if (post.repostId) return 'repost';
  if (post.postVideo || post.video || post.videoUrl) return 'video';
  const images = Array.isArray(post.postImages) ? post.postImages : (Array.isArray(post.images) ? post.images : []);
  if (images.length > 1) return 'carousel';
  if (images.length === 1) return 'image';
  return 'text';
}

function hook(content: unknown) {
  return String(content || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 240) || '';
}

function cta(content: unknown) {
  const text = String(content || '');
  const quoted = text.match(/\bcoment(?:a|e)\s+["'“‘]\s*([\p{L}\p{N}_-]+)\s*["'”’]/iu);
  const unquoted = text.match(/\bcoment(?:a|e)\s+([\p{L}\p{N}_-]+)/iu)?.[1];
  const uppercase = unquoted && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9_-]{0,29}$/u.test(unquoted) ? unquoted : null;
  const rawKeyword = quoted?.[1] || uppercase;
  if (!rawKeyword) return null;
  const keyword = rawKeyword.replace(/["'“”‘’.,!?;:]+$/g, '').toUpperCase();
  return ['AQUI', 'ABAIXO', 'AGORA', 'ISSO'].includes(keyword) ? null : keyword;
}

function media(post: Record<string, any>, format: string) {
  if (format === 'video') {
    const video = post.postVideo || post.video || post.videoUrl;
    return { media_type: 'video', media_url: typeof video === 'string' ? video : video?.url || video?.videoUrl || null };
  }
  const images = Array.isArray(post.postImages) ? post.postImages : (Array.isArray(post.images) ? post.images : []);
  const first = images[0];
  if (first) return { media_type: format === 'carousel' ? 'carousel' : 'image', media_url: typeof first === 'string' ? first : first.url || null };
  return { media_type: format === 'repost' ? 'repost' : 'text', media_url: null };
}

export function normalizeApifyPost(item: Record<string, any>, metricDate = new Date().toISOString().slice(0, 10)) {
  const postUrl = firstValue(item, ['linkedinUrl', 'shareLinkedinUrl', 'url', 'postUrl', 'link']);
  const externalId = String(firstValue(item, ['id', 'entityId', 'postId', 'urn', 'activityUrn']) || '').trim()
    || String(postUrl || '').match(/activity[-:](\d{8,})/)?.[1]
    || String(postUrl || '').trim();
  if (!externalId) throw new Error('Item do Apify sem identidade');

  const format = detectFormat(item);
  const content = String(firstValue(item, ['content', 'text', 'postText', 'commentary', 'body']) || '');
  const likes = integer(firstValue(item, ['likeCount', 'likes', 'likesCount']) ?? item.engagement?.likes ?? item.stats?.likes);
  const comments = integer(firstValue(item, ['commentCount', 'comments', 'commentsCount']) ?? item.engagement?.comments ?? item.stats?.comments);
  const shares = integer(firstValue(item, ['shareCount', 'repostCount', 'shares', 'reposts']) ?? item.engagement?.shares ?? item.stats?.shares);
  const reactions = Array.isArray(item.engagement?.reactions)
    ? item.engagement.reactions.reduce((sum: number, reaction: any) => sum + integer(reaction?.count), 0)
    : integer(firstValue(item, ['reactionCount', 'reactionsCount', 'reactions']) ?? likes);
  const published = item.postedAt?.date || firstValue(item, ['postedDate', 'publishedAt', 'date', 'createdAt', 'timestamp']);

  return {
    post: {
      platform: 'linkedin',
      external_post_id: externalId,
      entity_id: String(item.entityId || externalId),
      share_urn: item.shareUrn || null,
      post_url: postUrl ? String(postUrl) : null,
      author_name: item.author?.name || firstValue(item, ['authorName', 'actorName']) as string | null,
      author_identifier: item.author?.publicIdentifier || firstValue(item, ['authorPublicIdentifier', 'authorUrl', 'actorUrl']) as string | null,
      published_at: published ? String(published) : null,
      content,
      hook: hook(content),
      format,
      cta_keyword: cta(content),
      is_repost: Boolean(item.repostId),
      repost_id: item.repostId ? String(item.repostId) : null,
      ...media(item, format),
      classification_status: 'pending',
      raw: item,
    },
    metric: {
      metric_date: metricDate,
      likes,
      comments,
      shares,
      reactions_total: reactions,
      views: firstValue(item, ['views', 'viewCount']) == null ? null : integer(firstValue(item, ['views', 'viewCount'])),
      source: 'apify_daily',
      metric_type: 'daily_collect',
      raw: item.engagement || item.stats || item,
    },
  };
}

export function normalizeYouTubeVideo(item: Record<string, any>, metricDate = new Date().toISOString().slice(0, 10)) {
  if (!item.id) throw new Error('Vídeo do YouTube sem id');
  return {
    video: {
      video_id: item.id,
      video_url: `https://www.youtube.com/watch?v=${item.id}`,
      title: item.snippet?.title || '',
      description: item.snippet?.description || '',
      published_at: item.snippet?.publishedAt || null,
      thumbnail_url: item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || null,
      duration: item.contentDetails?.duration || null,
      classification_status: 'pending',
      raw: item,
    },
    metric: {
      metric_date: metricDate,
      views: integer(item.statistics?.viewCount),
      likes: integer(item.statistics?.likeCount),
      comments: integer(item.statistics?.commentCount),
      source: 'youtube_data_api',
      raw: item.statistics || {},
    },
  };
}

function youtubeVideoId(item: Record<string, any>) {
  const direct = firstValue(item, ['id', 'videoId', 'video_id', 'ytId']);
  if (direct) return String(direct).trim();
  const url = String(firstValue(item, ['url', 'videoUrl', 'link']) || '');
  const watch = url.match(/[?&]v=([^&]+)/)?.[1];
  const short = url.match(/youtu\.be\/([^?&/]+)/)?.[1];
  const shorts = url.match(/youtube\.com\/shorts\/([^?&/]+)/)?.[1];
  return String(watch || short || shorts || '').trim();
}

export function normalizeApifyYouTubeVideo(item: Record<string, any>, metricDate = new Date().toISOString().slice(0, 10)) {
  const id = youtubeVideoId(item);
  if (!id) throw new Error('Vídeo do YouTube sem id');
  const url = String(firstValue(item, ['url', 'videoUrl', 'link']) || `https://www.youtube.com/watch?v=${id}`);
  const published = firstValue(item, ['date', 'publishedAt', 'published_at', 'uploadDate', 'publishedTime']);
  return {
    video: {
      video_id: id,
      video_url: url,
      title: String(firstValue(item, ['title', 'name']) || ''),
      description: String(firstValue(item, ['description', 'text', 'about']) || ''),
      published_at: published ? String(published) : null,
      thumbnail_url: firstValue(item, ['thumbnailUrl', 'thumbnail', 'thumbnail_url']) as string | null,
      duration: firstValue(item, ['duration', 'lengthText']) as string | null,
      classification_status: 'pending',
      raw: item,
    },
    metric: {
      metric_date: metricDate,
      views: integer(firstValue(item, ['viewCount', 'views', 'view_count'])),
      likes: integer(firstValue(item, ['likes', 'likeCount', 'like_count'])),
      comments: integer(firstValue(item, ['commentsCount', 'commentCount', 'comments', 'comment_count'])),
      source: 'apify_youtube',
      raw: item,
    },
  };
}

export function parseApifyInput(template: string | undefined, accountUrl: string) {
  const source = template || '{"profileUrls":["{{accountUrl}}"],"maxPosts":200}';
  try {
    return JSON.parse(source.replaceAll('{{accountUrl}}', accountUrl));
  } catch {
    throw new Error('APIFY input JSON não contém JSON válido');
  }
}

export function validateClassification(value: Record<string, unknown>) {
  const valid = THEMES.includes(String(value.theme))
    && PILLARS.includes(String(value.content_pillar))
    && FUNNEL_STAGES.includes(String(value.funnel_stage))
    && COMMERCIAL_INTENTS.includes(String(value.commercial_intent));
  if (!valid) throw new Error('Classificação retornou valores fora dos enums permitidos');
  return {
    theme: String(value.theme),
    content_pillar: String(value.content_pillar),
    cta_keyword: value.cta_keyword ? String(value.cta_keyword).toUpperCase() : null,
    funnel_stage: String(value.funnel_stage),
    commercial_intent: String(value.commercial_intent),
    classification_status: 'classified',
    classification_error: null,
  };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
