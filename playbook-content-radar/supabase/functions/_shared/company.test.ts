import { describe, expect, it } from 'vitest';
import {
  buildCompanyActorInput,
  buildCompanyIndex,
  companyEmployeeCount,
  findCompany,
  linkedinCompanyId,
  normalizeCompanyUrl,
} from '../enrich-leads/company.ts';

describe('company enrichment helpers', () => {
  it('separates LinkedIn URLs from company-name searches', () => {
    expect(buildCompanyActorInput([
      { name: 'Tech Rocket', url: 'https://www.linkedin.com/company/102210740/' },
      { name: 'Empresa sem URL', url: null },
      { name: 'Empresa com URL de busca', url: 'https://www.linkedin.com/search/results/all/?keywords=Empresa' },
    ])).toEqual({
      companies: ['https://www.linkedin.com/company/102210740/'],
      searches: ['Empresa sem URL', 'Empresa com URL de busca'],
    });
  });

  it('matches a numeric profile URL to a canonical actor result by company id', () => {
    const index = buildCompanyIndex([{
      id: '102210740',
      universalName: 'tech-rocket-ai',
      linkedinUrl: 'https://www.linkedin.com/company/tech-rocket-ai',
      name: 'Tech Rocket | Revenue AI',
      employeeCount: 37,
    }]);
    expect(findCompany(index, {
      name: 'Tech Rocket',
      url: 'https://www.linkedin.com/company/102210740/',
    })?.employeeCount).toBe(37);
  });

  it('unwraps nested actor results and falls back to a headcount range', () => {
    const index = buildCompanyIndex([{ data: { name: 'Humand', employeeCountRange: { start: 201 } } }]);
    expect(companyEmployeeCount(findCompany(index, { name: 'Humand', url: null }))).toBe(201);
  });

  it('normalizes LinkedIn URLs and extracts numeric ids', () => {
    expect(normalizeCompanyUrl('https://www.linkedin.com/company/64738331/')).toBe('linkedin.com/company/64738331');
    expect(linkedinCompanyId('https://www.linkedin.com/company/64738331/')).toBe('64738331');
  });
});
