const number = (value) => {
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const isoDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};

const first = (item, keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => acc?.[part], item);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
};

const hook = (content) => String(content || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 240) || '';

const detectCta = (content) => {
  const text = String(content || '');
  const quoted = text.match(/\bcoment(?:a|e)\s+["'“‘]\s*([\p{L}\p{N}_-]+)\s*["'”’]/iu)?.[1];
  const unquoted = text.match(/\bcoment(?:a|e)\s+([\p{L}\p{N}_-]+)/iu)?.[1];
  const raw = quoted || (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9_-]{0,29}$/u.test(unquoted || '') ? unquoted : null);
  if (!raw) return null;
  const keyword = raw.replace(/["'“”‘’.,!?;:]+$/g, '').toUpperCase();
  return ['AQUI', 'ABAIXO', 'AGORA', 'ISSO'].includes(keyword) ? null : keyword;
};

const linkedinId = (item) => {
  const direct = first(item, ['id', 'postId', 'activityId', 'urn']);
  const fromDirect = String(direct || '').match(/(\d{8,})/)?.[1];
  const fromUrl = String(first(item, ['url', 'postUrl', 'linkedinUrl']) || '').match(/activity[-:](\d{8,})/)?.[1];
  return fromDirect || fromUrl || String(first(item, ['url', 'postUrl', 'linkedinUrl']) || '').trim() || null;
};

const youtubeId = (item) => {
  const direct = first(item, ['id', 'videoId', 'video_id']);
  if (direct) return String(direct);
  const url = String(first(item, ['url', 'videoUrl', 'link']) || '');
  return url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?&/]+)/)?.[1] || url.match(/youtube\.com\/shorts\/([^?&/]+)/)?.[1] || null;
};

export const defaultAccounts = {
  linkedin: [
    { ownerName: 'Fernando Tedesco', accountUrl: 'https://www.linkedin.com/in/fernando-tedesco/' },
    { ownerName: 'Victor Baggio', accountUrl: 'https://www.linkedin.com/in/victorzbaggio/' },
  ],
  youtube: [
    { ownerName: 'Fernando Tedesco', accountUrl: 'https://www.youtube.com/@fernando_tedesco' },
    { ownerName: 'Victor Baggio', accountUrl: 'https://www.youtube.com/@VictorBaggio-AI' },
  ],
};

export function latestDateByOwner(records = []) {
  const result = {};
  for (const row of records) {
    const owner = row.owner_name || row.ownerName;
    const date = isoDate(row.published_at || row.publishedAt || row.date);
    if (!owner || !date) continue;
    if (!result[owner] || date > result[owner]) result[owner] = date;
  }
  return result;
}

export function buildLinkedInActorInput(account, options = {}) {
  return {
    authorUrls: [account.accountUrl],
    maxPosts: Number(options.maxPosts || 500),
    postedLimitDate: options.since || undefined,
    sortBy: 'date',
    profileScraperMode: 'short',
    scrapeReactions: false,
    scrapeComments: false,
  };
}

export function buildYoutubeActorInput(account, options = {}) {
  const maxVideos = Number(options.maxVideos || 200);
  return {
    startUrls: [{ url: account.accountUrl }],
    maxResults: maxVideos,
    maxResultsShorts: Number(options.maxShorts ?? maxVideos),
    maxResultStreams: 0,
    oldestPostDate: options.since || undefined,
    sortVideosBy: 'NEWEST',
    downloadSubtitles: false,
  };
}

export function normalizeHarvestLinkedInPost(item, account, metricDate = new Date().toISOString().slice(0, 10)) {
  const id = linkedinId(item);
  if (!id) throw new Error('LinkedIn post sem id');
  const content = String(first(item, ['text', 'content', 'commentary', 'postText']) || '');
  const likes = number(first(item, ['engagement.likes', 'stats.likeCount', 'likeCount', 'likes', 'numLikes', 'reactionCount']));
  const comments = number(first(item, ['engagement.comments', 'stats.commentCount', 'commentCount', 'comments', 'numComments']));
  const shares = number(first(item, ['engagement.shares', 'stats.repostCount', 'stats.shareCount', 'repostCount', 'shareCount', 'shares', 'numShares']));
  const published = first(item, ['postedAt.date', 'postedAt.timestamp', 'postedAt', 'posted_at', 'date', 'publishedAt', 'createdAt']);
  const format = first(item, ['contentType', 'type']) || (first(item, ['video', 'videoUrl']) ? 'video' : first(item, ['images', 'imageUrl']) ? 'image' : 'text');
  return {
    platform: 'linkedin',
    external_post_id: id,
    entity_id: id,
    share_urn: String(first(item, ['urn']) || '').startsWith('urn:') ? first(item, ['urn']) : null,
    post_url: first(item, ['url', 'postUrl', 'linkedinUrl']) || null,
    author_name: first(item, ['author.name', 'authorName']) || account.ownerName,
    author_identifier: first(item, ['author.publicIdentifier', 'author.username']) || null,
    published_at: published ? new Date(published).toISOString() : null,
    content,
    hook: hook(content),
    format: String(format || 'text').toLowerCase(),
    theme: null,
    content_pillar: null,
    cta_keyword: detectCta(content),
    funnel_stage: null,
    commercial_intent: null,
    is_repost: Boolean(first(item, ['isRepost', 'repost'])),
    repost_id: first(item, ['repostId']) || null,
    media_type: String(format || 'text').toLowerCase(),
    media_url: first(item, ['imageUrl', 'videoUrl', 'thumbnailUrl']) || null,
    classification_status: 'pending',
    metric_date: metricDate,
    likes,
    comments,
    shares,
    reactions_total: likes,
    views: number(first(item, ['views', 'viewCount'])) || null,
    engagement_total: likes + comments + shares,
    engagement_score: likes + comments * 3 + shares * 4,
    source: 'apify_linkedin',
    metric_type: 'daily_collect',
    owner_name: account.ownerName,
    account_url: account.accountUrl,
    raw: item,
  };
}

export function normalizeApifyYoutubeItem(item, account, metricDate = new Date().toISOString().slice(0, 10)) {
  const id = youtubeId(item);
  if (!id) return null;
  const views = number(first(item, ['viewCount', 'views', 'view_count']));
  const likes = number(first(item, ['likes', 'likeCount', 'like_count']));
  const comments = number(first(item, ['commentsCount', 'commentCount', 'comments', 'comment_count']));
  const published = first(item, ['date', 'publishedAt', 'published_at', 'uploadDate', 'publishedTime']);
  return {
    platform: 'youtube',
    video_id: id,
    video_url: first(item, ['url', 'videoUrl', 'link']) || `https://www.youtube.com/watch?v=${id}`,
    title: String(first(item, ['title', 'name']) || ''),
    description: String(first(item, ['description', 'text', 'about']) || ''),
    published_at: published ? new Date(published).toISOString() : null,
    thumbnail_url: first(item, ['thumbnailUrl', 'thumbnail', 'thumbnail_url']) || null,
    duration: first(item, ['duration', 'lengthText']) || null,
    theme: null,
    content_pillar: null,
    classification_status: 'pending',
    metric_date: metricDate,
    views,
    likes,
    comments,
    engagement_total: likes + comments,
    engagement_rate: views ? Number((((likes + comments) / views) * 100).toFixed(2)) : 0,
    source: 'apify_youtube',
    owner_name: account.ownerName,
    account_url: account.accountUrl,
    channel_name: first(item, ['channelName', 'channelTitle']) || account.ownerName,
    subscribers: number(first(item, ['numberOfSubscribers', 'subscriberCount', 'subscribers'])) || null,
    raw: item,
  };
}

const mergeRow = (oldRow = {}, newRow = {}) => {
  const cleanNew = Object.fromEntries(Object.entries(newRow).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return { ...oldRow, ...cleanNew };
};

const newestFirst = (rows) => [...rows].sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));

export function mergeLinkedInSnapshot(existing = {}, incoming = [], accounts = defaultAccounts.linkedin, collectedAt = new Date().toISOString().slice(0, 10)) {
  const byId = new Map();
  for (const row of existing.records || []) byId.set(row.external_post_id, row);
  for (const row of incoming) if (row.external_post_id) byId.set(row.external_post_id, mergeRow(byId.get(row.external_post_id), row));
  const records = newestFirst([...byId.values()]);
  const summary = {};
  for (const account of accounts) {
    const count = records.filter((row) => row.owner_name === account.ownerName).length;
    summary[account.ownerName] = { sourceCount: count, normalizedCount: count, skippedCount: 0 };
  }
  return {
    generated_at: new Date().toISOString(),
    collected_at: collectedAt,
    source: 'historical_json+apify',
    summary,
    duplicate_count: (existing.records || []).length + incoming.length - records.length,
    records,
  };
}

export function mergeYoutubeSnapshot(existing = {}, incoming = [], collectedAt = new Date().toISOString().slice(0, 10)) {
  const byId = new Map();
  for (const row of existing.records || []) byId.set(row.video_id, row);
  for (const row of incoming) if (row.video_id) byId.set(row.video_id, mergeRow(byId.get(row.video_id), row));
  const records = newestFirst([...byId.values()]);
  return {
    generated_at: new Date().toISOString(),
    collected_at: collectedAt,
    source: 'apify_youtube',
    summary: records.reduce((acc, row) => {
      acc[row.owner_name] = (acc[row.owner_name] || 0) + 1;
      return acc;
    }, {}),
    duplicate_count: (existing.records || []).length + incoming.length - records.length,
    records,
  };
}