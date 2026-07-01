export const METRICS_SECTIONS = [
  { id: 'overview', label: 'Visão geral', path: '/content-dashboard' },
  { id: 'linkedin', label: 'LinkedIn', path: '/content-dashboard/linkedin' },
  { id: 'youtube', label: 'YouTube', path: '/content-dashboard/youtube' },
  { id: 'instagram', label: 'Instagram', path: '/content-dashboard/instagram' },
  { id: 'posts', label: 'Posts', path: '/content-dashboard/posts' },
  { id: 'videos', label: 'Vídeos', path: '/content-dashboard/videos' },
  { id: 'accounts', label: 'Contas', path: '/content-dashboard/accounts' },
  { id: 'imports', label: 'Importações', path: '/content-dashboard/imports' },
  { id: 'settings', label: 'Configurações', path: '/content-dashboard/settings' },
];

export function pathToMetricsSection(pathname = '') {
  return METRICS_SECTIONS.find((section) => section.path === pathname.replace(/\/$/, '') || section.path === pathname)?.id || 'overview';
}

export function sectionToMetricsPath(sectionId) {
  return METRICS_SECTIONS.find((section) => section.id === sectionId)?.path || '/content-dashboard';
}
