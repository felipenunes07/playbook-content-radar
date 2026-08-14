// Cliente da API do Tally. https://api.tally.so, Bearer token, 100 req/min.
//
// fetch é injetado para o teste rodar sem rede. A resposta é lida de forma
// defensiva: a API devolve as chaves no topo (page/hasMore/questions/submissions),
// mas o wrapper MCP devolve tudo dentro de `data` — aceitamos as duas formas para
// não quebrar se a origem mudar, no mesmo espírito do cal-bookings.
//
// Nota medida: o endpoint de submissions NÃO expõe respondent_id (o export CSV expõe).
// Não é problema: respondent_id não serve como chave de pessoa — no export real um
// mesmo respondent trouxe "joao marcos" e "q q". A chave de pessoa é o e-mail.

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type TallyForm = {
  id: string;
  name: string;
  status?: string;
  numberOfSubmissions?: number;
};

export type TallyApiQuestion = { id: string; type: string; label: string };
export type TallyApiSubmission = {
  id: string;
  formId?: string;
  isCompleted?: boolean;
  submittedAt?: string;
  respondentId?: string | null;
  responses?: Array<{ questionId: string; answer?: unknown }>;
};

const MAX_LIMIT = 500;          // teto da API
const MAX_PAGES = 200;          // trava de segurança: 200 * 500 = 100k submissions

function unwrap(payload: unknown): Record<string, any> {
  const body = (payload ?? {}) as Record<string, any>;
  return body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : body;
}

// A lista vem em chaves diferentes dependendo da origem: a API real de /forms usa
// `items`, a de submissions usa `submissions`, e o wrapper MCP renomeia para `forms`.
// Custou uma execução em produção descobrir — daí ler as três, em ordem.
function listOf(body: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(body[key])) return body[key];
  }
  return Array.isArray(body) ? body : [];
}

export function createTallyApi(options: {
  token: string;
  fetchImpl?: FetchLike;
  baseUrl?: string;
  /** pausa entre páginas, para não estourar os 100 req/min da API */
  pauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const token = options.token;
  if (!token) throw new Error('Token da API do Tally ausente');
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const baseUrl = (options.baseUrl ?? 'https://api.tally.so').replace(/\/+$/, '');
  const pauseMs = options.pauseMs ?? 250;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function get(path: string) {
    const response = await doFetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (response.status === 429) throw new Error('Tally respondeu 429 (limite de 100 req/min) — reduza o ritmo');
    if (!response.ok) throw new Error(`Tally ${path} respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return unwrap(await response.json());
  }

  async function listForms(): Promise<TallyForm[]> {
    const forms: TallyForm[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await get(`/forms?page=${page}&limit=${MAX_LIMIT}`);
      const batch = listOf(body, 'items', 'forms') as TallyForm[];
      forms.push(...batch);
      if (!body.hasMore || !batch.length) break;
      await sleep(pauseMs);
    }
    return forms;
  }

  // Traz todas as páginas de um formulário. `since` usa o startDate da própria API,
  // então a sincronização incremental não baixa o histórico inteiro toda vez.
  async function fetchFormSubmissions(formId: string, params: { since?: string | null } = {}) {
    let questions: TallyApiQuestion[] = [];
    const submissions: TallyApiSubmission[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({ page: String(page), limit: String(MAX_LIMIT), filter: 'completed' });
      if (params.since) query.set('startDate', params.since);
      const body = await get(`/forms/${encodeURIComponent(formId)}/submissions?${query.toString()}`);
      if (Array.isArray(body.questions) && body.questions.length) questions = body.questions;
      const batch = listOf(body, 'submissions', 'items') as TallyApiSubmission[];
      submissions.push(...batch);
      if (!body.hasMore || !batch.length) break;
      await sleep(pauseMs);
    }
    return { questions, submissions };
  }

  return { listForms, fetchFormSubmissions };
}

export type TallyApi = ReturnType<typeof createTallyApi>;
