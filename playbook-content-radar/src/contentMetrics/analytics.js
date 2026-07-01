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

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
    const key = item[field] || (field === 'cta_keyword' ? 'Sem CTA' : 'NÃ£o classificado');
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
function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isoWeekKey(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function shortCreatorName(ownerName) {
  const text = String(ownerName || 'Sem autor');
  if (/victor/i.test(text)) return 'Victor';
  if (/fernando/i.test(text)) return 'Fernando';
  return text.split(' ')[0] || 'Sem autor';
}

function weekLabel(weekKey) {
  const parts = weekKey.split('-W');
  if (parts.length !== 2) return weekKey;
  const year = parseInt(parts[0], 10);
  const week = parseInt(parts[1], 10);
  const simple = new Date(Date.UTC(year, 0, 4));
  const day = simple.getUTCDay();
  const dayNumber = day === 0 ? 7 : day;
  const monday = new Date(simple.getTime());
  monday.setUTCDate(simple.getUTCDate() - dayNumber + 1 + (week - 1) * 7);
  const dayStr = String(monday.getUTCDate()).padStart(2, '0');
  const monthStr = String(monday.getUTCMonth() + 1).padStart(2, '0');
  return `${dayStr}/${monthStr}`;
}

export function buildWeeklyCadence(items) {
  const groups = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    const date = validDate(item.published_at);
    if (!date) continue;
    const week = isoWeekKey(date);
    const current = groups.get(week) || { week, label: weekLabel(week), Victor: 0, Fernando: 0, Total: 0, engagement: 0, comments: 0, averageEngagement: 0 };
    const creator = shortCreatorName(item.owner_name);
    if (creator === 'Victor' || creator === 'Fernando') current[creator] += 1;
    current.Total += 1;
    current.engagement += number(item.engagement_total);
    current.comments += number(item.comments);
    current.averageEngagement = round(current.engagement / current.Total);
    groups.set(week, current);
  }
  return [...groups.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export function buildMovingAverageTrend(items, windowSize = 4) {
  const weeks = buildWeeklyCadence(items);
  return weeks.map((week, index) => {
    const window = weeks.slice(Math.max(0, index - windowSize + 1), index + 1);
    const divisor = window.length || 1;
    return {
      ...week,
      Victor: round(window.reduce((sum, row) => sum + row.Victor, 0) / divisor),
      Fernando: round(window.reduce((sum, row) => sum + row.Fernando, 0) / divisor),
      Total: round(window.reduce((sum, row) => sum + row.Total, 0) / divisor),
    };
  });
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatHeatmapDate(date, count) {
  const label = count === 1 ? 'conteúdo' : 'conteúdos';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} · ${count} ${label}`;
}

export function buildCalendarHeatmap(items) {
  const counts = new Map();
  const dates = [];

  for (const item of (Array.isArray(items) ? items : [])) {
    const published = validDate(item.published_at);
    if (!published) continue;
    const date = startOfUtcDay(published);
    const key = dateKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
    dates.push(date);
  }

  if (!dates.length) return { days: [], weeks: [], months: [], maxCount: 0, totalPosts: 0, activeDays: 0 };

  dates.sort((a, b) => a - b);
  const start = addUtcDays(dates[0], -dates[0].getUTCDay());
  const lastDate = dates[dates.length - 1];
  const end = addUtcDays(lastDate, 6 - lastDate.getUTCDay());
  const maxCount = Math.max(...counts.values());
  const days = [];

  for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
    const key = dateKey(cursor);
    const count = counts.get(key) || 0;
    days.push({
      date: key,
      day: cursor.getUTCDay(),
      weekIndex: Math.floor(days.length / 7),
      count,
      level: count ? Math.max(1, Math.ceil((count / maxCount) * 4)) : 0,
      label: formatHeatmapDate(cursor, count),
      month: cursor.getUTCMonth(),
    });
  }

  const weeks = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

  const months = [];
  for (const week of weeks) {
    const firstContentDay = week.find((day) => day.count > 0) || week[0];
    const month = firstContentDay.month;
    const previous = months[months.length - 1];
    if (!previous || previous.month !== month) months.push({ month, label: MONTHS[month], weekIndex: firstContentDay.weekIndex });
  }

  return {
    days,
    weeks,
    months,
    maxCount,
    totalPosts: [...counts.values()].reduce((sum, count) => sum + count, 0),
    activeDays: [...counts.values()].filter(Boolean).length,
  };
}

export function buildExecutiveSummary(items, options = {}) {
  const rows = Array.isArray(items) ? items : [];
  const now = validDate(options.now) || new Date();
  const last30Start = now.getTime() - 30 * 86400000;
  const last30Rows = rows.filter((row) => {
    const date = validDate(row.published_at);
    return date && date.getTime() >= last30Start && date.getTime() <= now.getTime();
  });
  const metrics = aggregateContentMetrics(rows);
  const bestPost = rankContent(rows, 'engagement_score', 1)[0] || null;
  const ctaRows = groupPerformance(rows, 'cta_keyword').filter((row) => row.key !== 'Sem CTA');
  const bestCta = ctaRows.sort((a, b) => b.comments - a.comments || b.score - a.score)[0]?.key || 'Sem CTA';
  const dates = rows.map((row) => validDate(row.published_at)).filter(Boolean).sort((a, b) => a - b);
  const daysSinceLastPost = dates[dates.length - 1] ? Math.max(0, Math.floor((now.getTime() - dates[dates.length - 1].getTime()) / 86400000)) : null;
  const previous30Start = last30Start - 30 * 86400000;
  const previous30Rows = rows.filter((row) => {
    const date = validDate(row.published_at);
    return date && date.getTime() >= previous30Start && date.getTime() < last30Start;
  });
  const last = last30Rows.length;
  const previous = previous30Rows.length;

  let weeks = 6.4285714286;
  const fromDate = validDate(options.from);
  const toDate = validDate(options.to) || (options.now ? validDate(options.now) : null);
  if (fromDate && toDate) {
    const diffDays = (toDate.getTime() - fromDate.getTime()) / 86400000;
    weeks = Math.max(1, diffDays) / 7;
  } else if (dates.length >= 2) {
    const diffDays = (dates[dates.length - 1].getTime() - dates[0].getTime()) / 86400000;
    weeks = Math.max(1, diffDays) / 7;
  }

  return {
    postsLast30Days: last30Rows.length,
    averagePostsPerWeek: round(rows.length / weeks),
    totalEngagement: metrics.engagementTotal,
    totalComments: metrics.comments,
    bestPost,
    bestCta,
    daysSinceLastPost,
    cadenceTrend: last > previous ? 'up' : last < previous ? 'down' : 'stable',
  };
}



