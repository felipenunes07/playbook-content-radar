import { describe, expect, it } from 'vitest';
import { pathToMetricsSection, sectionToMetricsPath } from './routes.js';

describe('metrics routes', () => {
  it.each([
    ['/content-dashboard', 'overview'],
    ['/content-dashboard/linkedin', 'linkedin'],
    ['/content-dashboard/youtube', 'youtube'],
    ['/content-dashboard/instagram', 'instagram'],
    ['/content-dashboard/posts', 'posts'],
    ['/content-dashboard/videos', 'videos'],
    ['/content-dashboard/accounts', 'accounts'],
    ['/content-dashboard/imports', 'imports'],
    ['/content-dashboard/settings', 'settings'],
  ])('maps %s to %s', (path, section) => {
    expect(pathToMetricsSection(path)).toBe(section);
    expect(sectionToMetricsPath(section)).toBe(path);
  });

  it('falls back to overview for unknown metrics paths', () => {
    expect(pathToMetricsSection('/content-dashboard/unknown')).toBe('overview');
  });
});
