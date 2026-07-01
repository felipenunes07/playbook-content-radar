const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round = (value, digits = 2) => Number(value.toFixed(digits));
const lower = (value) => String(value || '').toLocaleLowerCase('pt-BR');

export function filterContent(items, filters = {}) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`).getTime() : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`).getTime() : null;
  const search = lower(filters.search);

  return (Array.isArray(items) ? items : []).filter((item) => {
    const published = item.published_at ? new Date(item.published_at).getTime() : null;
    if (filters.owner && item.owner_name !== filters.owner) return false;
    if (filters.format && item.format !== filters.format) return false;
    if (filters.theme && item.theme !== filters.theme) return false;
    if (filters.cta && (item.cta_keyword || 'Sem CTA') !== filters.cta) return false;
    if (filters.funnelStage && item.funnel_stage !== filters.funnelStage) return false;
    if (filters.commercialIntent && item.commercial_intent !== filters.commercialIntent) return false;
    if (from != null && (published == null || published < from)) return false;
    if (to != null && (published == null || published > to)) return false;
    if (search) {
      const haystack = lower([item.owner_name, item.hook, item.content, item.theme, item.format, item.cta_keyword].join(' '));
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function filterYoutube(items, filters = {}) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`).getTime() : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`).getTime() : null;
  const search = lower(filters.search);
  return (Array.isArray(items) ? items : []).filter((item) => {
    const published = item.published_at ? new Date(item.published_at).getTime() : null;
    if (filters.owner && item.owner_name !== filters.owner) return false;
    if (filters.theme && item.theme !== filters.theme) return false;
    if (from != null && (published == null || published < from)) return false;
    if (to != null && (published == null || published > to)) return false;
    if (search && !lower([item.title, item.description, item.owner_name, item.theme].join(' ')).includes(search)) return false;
    return true;
  });
}

export function aggregateYoutubeMetrics(items) {
  const rows = Array.isArray(items) ? items : [];
  const totals = rows.reduce((acc, row) => ({
    views: acc.views + number(row.views),
    likes: acc.likes + number(row.likes),
    comments: acc.comments + number(row.comments),
    engagement: acc.engagement + number(row.engagement_total),
  }), { views: 0, likes: 0, comments: 0, engagement: 0 });
  return {
    videos: rows.length,
    ...totals,
    engagementRate: totals.views ? round((totals.engagement / totals.views) * 100) : 0,
  };
}

export function aggregateContentMetrics(items) {
  const rows = Array.isArray(items) ? items : [];
  const totals = rows.reduce((acc, row) => ({
    likes: acc.likes + number(row.likes),
    comments: acc.comments + number(row.comments),
    shares: acc.shares + number(row.shares),
    engagementTotal: acc.engagementTotal + number(row.engagement_total),
    engagementScore: acc.engagementScore + number(row.engagement_score),
    withCta: acc.withCta + (row.cta_keyword ? 1 : 0),
  }), { likes: 0, comments: 0, shares: 0, engagementTotal: 0, engagementScore: 0, withCta: 0 });
  const count = rows.length;
  return {
    contentCount: count,
    ...totals,
    averageLikes: count ? round(totals.likes / count) : 0,
    averageComments: count ? round(totals.comments / count) : 0,
    averageShares: count ? round(totals.shares / count) : 0,
    withoutCta: count - totals.withCta,
  };
}

const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export function buildMonthlyTrend(items) {
  const groups = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    if (!item.published_at) continue;
    const date = new Date(item.published_at);
    if (Number.isNaN(date.getTime())) continue;
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const current = groups.get(period) || {
      period,
      label: `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`,
      posts: 0, likes: 0, comments: 0, shares: 0, engagement: 0, score: 0,
    };
    current.posts += 1;
    current.likes += number(item.likes);
    current.comments += number(item.comments);
    current.shares += number(item.shares);
    current.engagement += number(item.engagement_total);
    current.score += number(item.engagement_score);
    groups.set(period, current);
  }
  return [...groups.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export function buildCreatorComparison(items) {
  const groups = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    const owner = item.owner_name || 'Sem autor';
    const current = groups.get(owner) || { owner, posts: 0, likes: 0, comments: 0, shares: 0, engagement: 0, score: 0 };
    current.posts += 1;
    current.likes += number(item.likes);
    current.comments += number(item.comments);
    current.shares += number(item.shares);
    current.engagement += number(item.engagement_total);
    current.score += number(item.engagement_score);
    groups.set(owner, current);
  }
  return [...groups.values()].sort((a, b) => b.engagement - a.engagement || a.owner.localeCompare(b.owner));
}

export function rankContent(items, metric = 'engagement_score', limit = 10) {
  return [...(Array.isArray(items) ? items : [])]
    .sort((a, b) => number(b[metric]) - number(a[metric]) || String(b.published_at || '').localeCompare(String(a.published_at || '')))
    .slice(0, limit);
}

export function groupPerformance(items, field) {
  const groups = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    const key = item[field] || (field === 'cta_keyword' ? 'Sem CTA' : 'Não classificado');
    const current = groups.get(key) || { key, posts: 0, engagement: 0, comments: 0, score: 0, averageScore: 0 };
    current.posts += 1;
    current.engagement += number(item.engagement_total);
    current.comments += number(item.comments);
    current.score += number(item.engagement_score);
    current.averageScore = round(current.score / current.posts);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.engagement - a.engagement || b.comments - a.comments || a.key.localeCompare(b.key));
}
