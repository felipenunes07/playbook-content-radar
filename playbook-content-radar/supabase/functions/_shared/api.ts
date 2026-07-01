const SORT_FIELDS = new Set(['engagement_score', 'engagement_total', 'comments', 'likes', 'shares', 'views', 'published_at']);

export function apiRoute(input: string) {
  const pathname = new URL(input).pathname.replace(/\/$/, '');
  const edgeMarker = '/content-dashboard-api';
  const apiMarker = '/api/content-dashboard';
  const marker = pathname.includes(edgeMarker) ? edgeMarker : apiMarker;
  const suffix = pathname.split(marker)[1] || '';
  return suffix || '/overview';
}

export function contentQuery(url: URL) {
  const value = (name: string) => url.searchParams.get(name) || undefined;
  const requestedSort = value('sort');
  return {
    owner: value('owner'),
    from: value('from'),
    to: value('to'),
    theme: value('theme'),
    format: value('format'),
    cta: value('cta'),
    sort: requestedSort && SORT_FIELDS.has(requestedSort) ? requestedSort : 'engagement_score',
  };
}
