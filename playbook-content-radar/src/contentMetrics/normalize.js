const MAX_HOOK_LENGTH = 240;

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

export function detectFormat(post = {}) {
  if (post.repostId) return 'repost';
  if (post.postVideo) return 'video';
  const images = Array.isArray(post.postImages) ? post.postImages : [];
  if (images.length > 1) return 'carousel';
  if (images.length === 1) return 'image';
  return 'text';
}

export function extractHook(content = '') {
  const firstLine = String(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine || '').slice(0, MAX_HOOK_LENGTH);
}

export function extractCtaKeyword(content = '') {
  const text = String(content);
  const quoted = text.match(/\bcoment(?:a|e)\s+["'“‘]\s*([\p{L}\p{N}_-]+)\s*["'”’]/iu);
  const unquoted = text.match(/\bcoment(?:a|e)\s+([\p{L}\p{N}_-]+)/iu)?.[1];
  const uppercase = unquoted && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9_-]{0,29}$/u.test(unquoted) ? unquoted : null;
  const rawKeyword = quoted?.[1] || uppercase;
  if (!rawKeyword) return null;
  const keyword = rawKeyword.replace(/^["'“”‘’]+|["'“”‘’.,!?;:]+$/g, '').toUpperCase();
  if (['AQUI', 'ABAIXO', 'AGORA', 'ISSO', 'SUA', 'SEU', 'O', 'A'].includes(keyword)) return null;
  return keyword || null;
}

export function reactionTotal(engagement = {}) {
  const reactions = Array.isArray(engagement.reactions) ? engagement.reactions : [];
  if (reactions.length) {
    return reactions.reduce((sum, reaction) => sum + safeNumber(reaction?.count), 0);
  }
  return safeNumber(engagement.likes);
}

function firstMedia(post, format) {
  if (format === 'video') {
    const video = post.postVideo;
    return {
      media_type: 'video',
      media_url: typeof video === 'string' ? video : video?.url || video?.videoUrl || null,
    };
  }
  const image = Array.isArray(post.postImages) ? post.postImages[0] : null;
  if (image) {
    return {
      media_type: format === 'carousel' ? 'carousel' : 'image',
      media_url: typeof image === 'string' ? image : image.url || null,
    };
  }
  return { media_type: format === 'repost' ? 'repost' : 'text', media_url: null };
}

function stableExternalId(post) {
  if (post.id != null && String(post.id).trim()) return String(post.id);
  if (post.entityId != null && String(post.entityId).trim()) return String(post.entityId);
  const urlMatch = String(post.linkedinUrl || '').match(/(?:activity-|urn:li:(?:activity|share):)(\d{8,})/i);
  return urlMatch?.[1] || null;
}

export function normalizeLinkedInPost(post, context) {
  const ownerName = context?.ownerName?.trim();
  const accountUrl = context?.accountUrl?.trim();
  const collectedAt = context?.collectedAt;
  const externalId = stableExternalId(post || {});
  const postUrl = post?.linkedinUrl || post?.shareLinkedinUrl || null;
  if (!externalId && !postUrl) throw new Error('Post sem identidade estável');
  if (!ownerName || !accountUrl) throw new Error('Contexto de conta incompleto');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(collectedAt || ''))) {
    throw new Error('Data de coleta inválida; use YYYY-MM-DD');
  }

  const format = detectFormat(post);
  const engagement = post.engagement || {};
  const likes = safeNumber(engagement.likes);
  const comments = safeNumber(engagement.comments);
  const shares = safeNumber(engagement.shares);
  const author = post.author || {};
  const media = firstMedia(post, format);

  return {
    account: {
      platform: 'linkedin',
      owner_name: ownerName,
      account_name: `${ownerName} LinkedIn`,
      account_url: accountUrl,
      handle: author.publicIdentifier || accountUrl.split('/').filter(Boolean).pop() || null,
      external_id: author.id || null,
      status: 'active',
    },
    post: {
      platform: 'linkedin',
      external_post_id: externalId,
      entity_id: post.entityId ? String(post.entityId) : externalId,
      share_urn: post.shareUrn || null,
      post_url: postUrl,
      author_name: author.name || ownerName,
      author_identifier: author.publicIdentifier || null,
      published_at: post.postedAt?.date || null,
      content: post.content || '',
      hook: extractHook(post.content),
      format,
      theme: null,
      content_pillar: null,
      cta_keyword: extractCtaKeyword(post.content),
      funnel_stage: null,
      commercial_intent: null,
      is_repost: Boolean(post.repostId),
      repost_id: post.repostId ? String(post.repostId) : null,
      ...media,
      classification_status: 'pending',
      raw: post,
    },
    metric: {
      metric_date: collectedAt,
      likes,
      comments,
      shares,
      reactions_total: reactionTotal(engagement),
      views: post.views == null ? null : safeNumber(post.views),
      engagement_total: likes + comments + shares,
      engagement_score: likes + comments * 3 + shares * 4,
      source: 'historical_json',
      metric_type: 'snapshot',
      raw: engagement,
    },
  };
}

export function normalizeLinkedInBatch(posts, context) {
  const normalized = [];
  const skipped = [];
  const seen = new Set();

  for (const [index, post] of (Array.isArray(posts) ? posts : []).entries()) {
    try {
      const item = normalizeLinkedInPost(post, context);
      const identity = item.post.external_post_id || item.post.post_url;
      if (seen.has(identity)) {
        skipped.push({ index, reason: 'duplicate', identity });
        continue;
      }
      seen.add(identity);
      normalized.push(item);
    } catch (error) {
      skipped.push({ index, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { normalized, skipped };
}
