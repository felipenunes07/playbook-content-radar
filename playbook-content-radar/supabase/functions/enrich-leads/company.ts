type CompanyRef = { name: string | null; url: string | null };

function clean(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeCompanyName(value: unknown) {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeCompanyUrl(value: unknown) {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

export function linkedinCompanyId(value: unknown) {
  const match = clean(value).match(/linkedin\.com\/company\/(\d+)(?:\/|$)/i);
  return match?.[1] || '';
}

function isLinkedinCompanyUrl(value: unknown) {
  return /(?:^|\.)linkedin\.com\/company\/[^/?#]+/i.test(normalizeCompanyUrl(value));
}

function companyRecord(item: Record<string, any>) {
  const nested = item?.company || item?.data || item?.result;
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : item;
}

export function companyLookupKeys(item: Record<string, any>) {
  const company = companyRecord(item);
  const keys = new Set<string>();
  for (const id of [company?.id, company?.companyId, company?.company_id, linkedinCompanyId(company?.linkedinUrl), linkedinCompanyId(company?.url)]) {
    if (clean(id)) keys.add(`id:${clean(id)}`);
  }
  for (const url of [company?.linkedinUrl, company?.linkedin_url, company?.companyUrl, company?.url]) {
    const normalized = normalizeCompanyUrl(url);
    if (normalized) keys.add(`url:${normalized}`);
  }
  for (const name of [company?.name, company?.companyName, company?.company_name, company?.universalName]) {
    const normalized = normalizeCompanyName(name);
    if (normalized) keys.add(`name:${normalized}`);
  }
  return [...keys];
}

export function companyRefLookupKeys(company: CompanyRef) {
  const keys: string[] = [];
  const id = linkedinCompanyId(company.url);
  const url = normalizeCompanyUrl(company.url);
  const name = normalizeCompanyName(company.name);
  if (id) keys.push(`id:${id}`);
  if (url) keys.push(`url:${url}`);
  if (name) keys.push(`name:${name}`);
  return keys;
}

export function buildCompanyIndex(items: Record<string, any>[]) {
  const index = new Map<string, Record<string, any>>();
  for (const item of items) {
    const company = companyRecord(item);
    for (const key of companyLookupKeys(company)) index.set(key, company);
  }
  return index;
}

export function findCompany(index: Map<string, Record<string, any>>, company: CompanyRef) {
  for (const key of companyRefLookupKeys(company)) {
    const match = index.get(key);
    if (match) return match;
  }
  return null;
}

export function companyEmployeeCount(company: Record<string, any> | null) {
  if (!company) return null;
  const candidates = [
    company.employeeCount,
    company.employee_count,
    company.staffCount,
    company.staff_count,
    company.employeesAmountInLinkedin,
    company.employeeCountRange?.start,
    company.employee_count_range?.start,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return Math.round(value);
  }
  return null;
}

export function buildCompanyActorInput(companies: CompanyRef[]) {
  const urls = [...new Set(companies.filter((company) => isLinkedinCompanyUrl(company.url)).map((company) => clean(company.url)))];
  const searches = [...new Set(companies.filter((company) => !isLinkedinCompanyUrl(company.url)).map((company) => clean(company.name)).filter(Boolean))];
  return {
    ...(urls.length ? { companies: urls } : {}),
    ...(searches.length ? { searches } : {}),
  };
}
