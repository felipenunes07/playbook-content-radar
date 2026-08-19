// Cliente Bright Data (Dataset API v3) como provedor alternativo de enriquecimento.
//
// Motivo (17/08/2026): a conta Apify trial de $5 não roda scraper de PERFIL (nem
// apimaestro nem harvestapi devolvem dado — actors gated por aluguel). O Bright Data
// tem tier grátis (5k/mês) e conta funded, então raspa perfil E empresa de verdade.
//
// A API é totalmente diferente da Apify: Bearer token, endpoint /scrape (síncrono,
// até ~20 URLs por chamada), saída em array JSON ou NDJSON. Nomes de campo do
// LinkedIn variam, então os mapeadores leem defensivamente vários candidatos e
// guardam o cru em _bd pra auditar.

const BD_API = 'https://api.brightdata.com/datasets/v3';
export const BD_PROFILE_DATASET = 'gd_l1viktl72bvl7bjuj0';
export const BD_COMPANY_DATASET = 'gd_l1vikfnt1wgvvqz95w';

const clampMs = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pickBd(obj: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    const value = key.split('.').reduce((acc: any, part) => (acc == null ? acc : acc[part]), obj);
    if (value != null && value !== '') return value;
  }
  return null;
}

function publicIdentifierFromUrl(url: unknown): string | null {
  const match = String(url || '').match(/\/(?:in|pub)\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase().replace(/\/$/, '') || null : null;
}

// A resposta pode vir como array JSON, objeto único, ou NDJSON (uma linha por registro).
function parseBody(text: string): any[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { /* provavelmente NDJSON */ }
  const rows: any[] = [];
  for (const line of trimmed.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    try { rows.push(JSON.parse(l)); } catch { /* ignora linha inválida */ }
  }
  return rows;
}

async function bdFetch(path: string, apiKey: string, init: RequestInit & { timeoutMs?: number }): Promise<any[]> {
  const { timeoutMs, ...rest } = init;
  const response = await fetch(`${BD_API}/${path}`, {
    ...rest,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(rest.headers || {}) },
    signal: AbortSignal.timeout(clampMs(timeoutMs ?? 60000, 5000, 110000)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Bright Data ${response.status}: ${text.slice(0, 300)}`);
  return parseBody(text);
}

// Raspa uma lista de URLs num dataset. Tenta o /scrape síncrono; se a resposta vier
// como { snapshot_id } (modo assíncrono), faz o poll do snapshot até ficar pronto.
export async function bdScrape(datasetId: string, urls: string[], apiKey: string, deadlineAt: number): Promise<any[]> {
  const clean = [...new Set(urls.filter(Boolean))];
  if (!clean.length) return [];
  // Formato idêntico ao curl que o painel do Bright Data gera: corpo embrulhado em
  // { input: [...], limit_per_input: null } e endpoint com notify=false&include_errors.
  const body = JSON.stringify({ input: clean.map((url) => ({ url })), limit_per_input: null });
  const first = await bdFetch(`scrape?dataset_id=${encodeURIComponent(datasetId)}&notify=false&include_errors=true`, apiKey, {
    method: 'POST', body, timeoutMs: 105000,
  });

  // Detecta resposta assíncrona: um único objeto com snapshot_id e sem dado de perfil.
  const snapshotId = first.length === 1
    ? pickBd(first[0] || {}, ['snapshot_id', 'snapshotId'])
    : null;
  const looksLikeData = first.some((row) => pickBd(row || {}, ['name', 'current_company', 'company_size', 'position', 'url']));
  if (snapshotId && !looksLikeData) return bdPoll(String(snapshotId), apiKey, deadlineAt);

  return first;
}

async function bdPoll(snapshotId: string, apiKey: string, deadlineAt: number): Promise<any[]> {
  while (Date.now() < deadlineAt - 20000) {
    const progress = await bdFetch(`progress/${snapshotId}`, apiKey, { method: 'GET', timeoutMs: 20000 });
    const status = String(pickBd(progress[0] || {}, ['status']) || '').toLowerCase();
    if (status === 'ready' || status === 'done' || status === 'completed') break;
    if (status === 'failed' || status === 'error') throw new Error(`Bright Data snapshot ${snapshotId} falhou`);
    await wait(5000);
  }
  return bdFetch(`snapshot/${snapshotId}?format=json`, apiKey, { method: 'GET', timeoutMs: 60000 });
}

// Bright Data devolve o porte como faixa ("201-500 employees", "10,001+ employees")
// ou às vezes número. O filtro de ICP usa >= 200 num inteiro, então pega-se o limite
// INFERIOR da faixa (conservador: "51-200" -> 51 reprova; "201-500" -> 201 aprova).
export function parseSizeRange(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const normalized = String(value).replace(/[.,](?=\d{3}\b)/g, '');
  const match = normalized.match(/\d+/);
  return match ? Number(match[0]) : null;
}

// Normaliza um registro de PERFIL do Bright Data para a forma canônica que o
// enrich-leads já entende (publicIdentifier + currentPosition[]).
export function bdProfileToCanonical(row: Record<string, any>) {
  const url = pickBd(row, ['url', 'input_url', 'profile_url', 'input.url', 'linkedin_url']);
  const company = row.current_company || row.currentCompany || {};
  const companyName = pickBd(company, ['name', 'company_name']) || pickBd(row, ['company', 'company_name']);
  const companyId = pickBd(company, ['company_id', 'companyId', 'id']);
  const companyLink = pickBd(company, ['link', 'url', 'linkedin_url'])
    || (companyId ? `https://www.linkedin.com/company/${companyId}` : null);
  const position = pickBd(row, ['position', 'profile_info.position']) || pickBd(company, ['title']);
  return {
    publicIdentifier: publicIdentifierFromUrl(url) || (row.linkedin_id ? String(row.linkedin_id).toLowerCase() : null),
    headline: pickBd(row, ['position', 'headline']),
    about: pickBd(row, ['about', 'summary']),
    location: pickBd(row, ['city', 'location']),
    name: pickBd(row, ['name']) || [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
    currentPosition: companyName ? [{ position, companyName, companyLinkedinUrl: companyLink }] : [],
    experience: Array.isArray(row.experience) ? row.experience : [],
    _bd: row,
  };
}

// Normaliza um registro de EMPRESA para a forma que company.ts (buildCompanyIndex /
// companyEmployeeCount) já casa: name/url/id + employeeCount inteiro.
export function bdCompanyToCanonical(row: Record<string, any>) {
  return {
    name: pickBd(row, ['name', 'company_name']),
    companyName: pickBd(row, ['name', 'company_name']),
    linkedinUrl: pickBd(row, ['url', 'input_url', 'link', 'linkedin_url']),
    id: pickBd(row, ['company_id', 'companyId', 'id']),
    employeeCount: parseSizeRange(pickBd(row, ['company_size', 'employees', 'employees_in_linkedin', 'company_size_on_linkedin', 'employee_count'])),
    industry: pickBd(row, ['industries', 'industry']),
    description: pickBd(row, ['about', 'description']),
    _bd: row,
  };
}
