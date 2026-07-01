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

function detectFormat(post: Record<string, unknown>) {
  if (post.repostId) return 'repost';
  if (post.postVideo) return 'video';
  const images = Array.isArray(post.postImages) ? post.postImages : [];
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
  if (format === 'video') return { media_type: 'video', media_url: typeof post.postVideo === 'string' ? post.postVideo : post.postVideo?.url || post.postVideo?.videoUrl || null };
  const first = Array.isArray(post.postImages) ? post.postImages[0] : null;
  if (first) return { media_type: format === 'carousel' ? 'carousel' : 'image', media_url: typeof first === 'string' ? first : first.url || null };
  return { media_type: format === 'repost' ? 'repost' : 'text', media_url: null };
}

export function normalizeApifyPost(item: Record<string, any>, metricDate = new Date().toISOString().slice(0, 10)) {
  const externalId = String(item.id || item.entityId || '').trim() || String(item.linkedinUrl || '').match(/activity-(\d{8,})/)?.[1];
  if (!externalId) throw new Error('Item do Apify sem identidade');
  const format = detectFormat(item);
  const likes = integer(item.engagement?.likes);
  const comments = integer(item.engagement?.comments);
  const shares = integer(item.engagement?.shares);
  const reactions = Array.isArray(item.engagement?.reactions)
    ? item.engagement.reactions.reduce((sum: number, reaction: any) => sum + integer(reaction?.count), 0)
    : likes;
  return {
    post: {
      platform: 'linkedin', external_post_id: externalId, entity_id: String(item.entityId || externalId), share_urn: item.shareUrn || null,
      post_url: item.linkedinUrl || item.shareLinkedinUrl || null, author_name: item.author?.name || null,
      author_identifier: item.author?.publicIdentifier || null, published_at: item.postedAt?.date || null,
      content: item.content || '', hook: hook(item.content), format, cta_keyword: cta(item.content),
      is_repost: Boolean(item.repostId), repost_id: item.repostId ? String(item.repostId) : null,
      ...media(item, format), classification_status: 'pending', raw: item,
    },
    metric: {
      metric_date: metricDate, likes, comments, shares, reactions_total: reactions,
      views: item.views == null ? null : integer(item.views), source: 'apify_daily', metric_type: 'daily_collect', raw: item.engagement || {},
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

export function parseApifyInput(template: string | undefined, accountUrl: string) {
  const source = template || '{"profileUrls":["{{accountUrl}}"],"maxPosts":200}';
  try {
    return JSON.parse(source.replaceAll('{{accountUrl}}', accountUrl));
  } catch {
    throw new Error('APIFY_LINKEDIN_INPUT_JSON não contém JSON válido');
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
