import { describe, expect, it } from 'vitest';
import { createTallyApi, type FetchLike } from './tallyApi.ts';
import { ingestTallyForms, matchQualifiedLeads, upsertSubmissions } from './tallySync.ts';
import { submissionsFromApi } from './tallySource.ts';

// ---------------------------------------------------------------- API falsa
function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async (url) => {
    const path = url.replace('https://api.tally.so', '');
    calls.push(path);
    const key = Object.keys(routes).find((route) => path.startsWith(route));
    if (!key) return { ok: false, status: 404, json: async () => ({}), text: async () => 'sem rota' };
    return { ok: true, status: 200, json: async () => routes[key], text: async () => '' };
  };
}

const QUESTIONS = [
  { id: 'q1', type: 'INPUT_TEXT', label: 'Nome' },
  { id: 'q2', type: 'INPUT_PHONE_NUMBER', label: 'Telefone' },
  { id: 'q3', type: 'INPUT_TEXT', label: 'Sobrenome' },
  { id: 'q4', type: 'INPUT_EMAIL', label: 'E-mail' },
];

const submission = (id: string, nome: string, sobrenome: string, email: string, telefone = '') => ({
  id, isCompleted: true, submittedAt: '2026-08-14T13:22:05.000Z',
  responses: [
    { questionId: 'q1', answer: nome }, { questionId: 'q3', answer: sobrenome },
    { questionId: 'q4', answer: email }, ...(telefone ? [{ questionId: 'q2', answer: telefone }] : []),
  ],
});

// ---------------------------------------------------------------- Supabase falso
// Só o suficiente para o que o tallySync usa: select/eq/in/range, upsert onConflict.
function fakeClient(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = { tally_submissions: [], leads: [], lead_comments: [], post_lead_magnets: [], lead_phone_matches: [], ...seed };
  const upserts: Record<string, number> = {};

  function from(table: string) {
    tables[table] ||= [];
    const filters: Array<(row: any) => boolean> = [];
    let range: [number, number] | null = null;

    const builder: any = {
      select() { return builder; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      limit() { return builder; },
      range(from_: number, to: number) { range = [from_, to]; return builder; },
      upsert(rows: any[], options: { onConflict: string }) {
        upserts[table] = (upserts[table] || 0) + rows.length;
        const key = options.onConflict;
        for (const row of rows) {
          const index = tables[table].findIndex((existing) => existing[key] === row[key]);
          if (index === -1) tables[table].push({ ...row });
          else tables[table][index] = { ...tables[table][index], ...row };
        }
        return Promise.resolve({ error: null });
      },
      then(resolve: (value: any) => unknown) {
        let rows = tables[table].filter((row) => filters.every((test) => test(row)));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };
    return builder;
  }
  return { from, tables, upserts };
}

// ---------------------------------------------------------------- testes
describe('tallyApi', () => {
  it('pagina até hasMore virar false', async () => {
    const calls: string[] = [];
    let page = 0;
    const doFetch: FetchLike = async (url) => {
      calls.push(url);
      page++;
      return {
        ok: true, status: 200, text: async () => '',
        json: async () => ({ page, hasMore: page < 3, questions: QUESTIONS, submissions: [submission(`s${page}`, 'Ana', 'Jardim', 'a@b.com')] }),
      };
    };
    const api = createTallyApi({ token: 't', fetchImpl: doFetch, sleep: async () => {} });
    const result = await api.fetchFormSubmissions('F1');
    expect(result.submissions).toHaveLength(3);
    expect(calls).toHaveLength(3);
  });

  it('aceita a resposta embrulhada em data (formato do wrapper MCP)', async () => {
    const doFetch = fakeFetch({ '/forms/F1/submissions': { data: { hasMore: false, questions: QUESTIONS, submissions: [submission('s1', 'Ana', 'Jardim', 'a@b.com')] } } });
    const api = createTallyApi({ token: 't', fetchImpl: doFetch, sleep: async () => {} });
    const result = await api.fetchFormSubmissions('F1');
    expect(result.submissions).toHaveLength(1);
    expect(result.questions).toHaveLength(4);
  });

  it('avisa explicitamente no 429 da API', async () => {
    const doFetch: FetchLike = async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => '' });
    const api = createTallyApi({ token: 't', fetchImpl: doFetch, sleep: async () => {} });
    await expect(api.fetchFormSubmissions('F1')).rejects.toThrow(/429/);
  });

  it('exige token', () => {
    expect(() => createTallyApi({ token: '' })).toThrow(/Token/);
  });

  // A API real de /forms devolve a lista em `items`; o wrapper MCP chama de `forms`.
  // Codificar só contra o wrapper fez a primeira execução em produção ler 0
  // formulários com status 200 — silencioso. Os dois formatos ficam cobertos.
  it('lê a lista de formulários tanto em items (API real) quanto em forms (wrapper)', async () => {
    const comItems = createTallyApi({
      token: 't', sleep: async () => {},
      fetchImpl: fakeFetch({ '/forms?': { hasMore: false, items: [{ id: 'F1', name: 'Real', numberOfSubmissions: 3 }] } }),
    });
    expect(await comItems.listForms()).toEqual([{ id: 'F1', name: 'Real', numberOfSubmissions: 3 }]);

    const comForms = createTallyApi({
      token: 't', sleep: async () => {},
      fetchImpl: fakeFetch({ '/forms?': { hasMore: false, forms: [{ id: 'F2', name: 'Wrapper', numberOfSubmissions: 1 }] } }),
    });
    expect(await comForms.listForms()).toEqual([{ id: 'F2', name: 'Wrapper', numberOfSubmissions: 1 }]);
  });

  it('lê submissions em submissions (API real) e em items', async () => {
    const real = createTallyApi({
      token: 't', sleep: async () => {},
      fetchImpl: fakeFetch({ '/forms/F1/submissions': { hasMore: false, questions: QUESTIONS, submissions: [submission('s1', 'Ana', 'Jardim', 'a@b.com')] } }),
    });
    expect((await real.fetchFormSubmissions('F1')).submissions).toHaveLength(1);

    const comItems = createTallyApi({
      token: 't', sleep: async () => {},
      fetchImpl: fakeFetch({ '/forms/F1/submissions': { hasMore: false, questions: QUESTIONS, items: [submission('s2', 'Bruno', 'Torres', 'b@b.com')] } }),
    });
    expect((await comItems.fetchFormSubmissions('F1')).submissions).toHaveLength(1);
  });
});

describe('upsertSubmissions: nunca duplica', () => {
  it('conta novas e atualizadas separando pelo que já existia', async () => {
    const client = fakeClient();
    const primeira = submissionsFromApi({ formId: 'F1', formName: 'Form 1', questions: QUESTIONS, submissions: [
      submission('s1', 'Ana', 'Jardim', 'ana@b.com'),
      submission('s2', 'Bruno', 'Torres', 'bruno@b.com'),
    ] });
    const um = await upsertSubmissions(client as any, primeira);
    expect(um).toEqual({ inserted: 2, updated: 0 });
    expect(client.tables.tally_submissions).toHaveLength(2);

    // Reimportação do mesmo período, com telefone novo em s1 e uma submission nova.
    const segunda = submissionsFromApi({ formId: 'F1', formName: 'Form 1', questions: QUESTIONS, submissions: [
      submission('s1', 'Ana', 'Jardim', 'ana@b.com', '+5511992946933'),
      submission('s3', 'Carla', 'Dias', 'carla@b.com'),
    ] });
    const dois = await upsertSubmissions(client as any, segunda);
    expect(dois).toEqual({ inserted: 1, updated: 1 });
    // 3 linhas no total: s1 não duplicou, e ganhou o telefone.
    expect(client.tables.tally_submissions).toHaveLength(3);
    expect(client.tables.tally_submissions.find((row) => row.submission_id === 's1').phone_e164).toBe('+5511992946933');
  });
});

describe('ingestTallyForms', () => {
  it('sincroniza só os formulários pedidos e resume por formulário', async () => {
    const doFetch = fakeFetch({
      '/forms?': { hasMore: false, forms: [
        { id: 'F1', name: 'Com telefone', numberOfSubmissions: 2 },
        { id: 'F2', name: 'Sem submissão', numberOfSubmissions: 0 },
      ] },
      '/forms/F1/submissions': { hasMore: false, questions: QUESTIONS, submissions: [
        submission('s1', 'Ana', 'Jardim', 'ana@b.com', '+5511992946933'),
        submission('s2', 'X', 'X', 'x@b.com', '+5511111111111'),
      ] },
    });
    const api = createTallyApi({ token: 't', fetchImpl: doFetch, sleep: async () => {} });
    const client = fakeClient();
    const stats = await ingestTallyForms({ api, client: client as any, formIds: ['F1'] });
    expect(stats).toMatchObject({ formsRead: 1, received: 2, inserted: 2, updated: 0, withPhone: 1, junk: 1 });
    expect(stats.perForm[0]).toMatchObject({ formId: 'F1', formName: 'Com telefone' });
  });

  it('pula formulário sem submissão quando nenhum formId é pedido', async () => {
    const doFetch = fakeFetch({
      '/forms?': { hasMore: false, forms: [{ id: 'F2', name: 'Vazio', numberOfSubmissions: 0 }] },
    });
    const api = createTallyApi({ token: 't', fetchImpl: doFetch, sleep: async () => {} });
    const stats = await ingestTallyForms({ api, client: fakeClient() as any });
    expect(stats.formsRead).toBe(0);
    expect(stats.received).toBe(0);
  });

  it('isola erro de um formulário sem derrubar os outros', async () => {
    const doFetch = fakeFetch({
      '/forms?': { hasMore: false, forms: [
        { id: 'BOM', name: 'Bom', numberOfSubmissions: 1 },
        { id: 'RUIM', name: 'Ruim', numberOfSubmissions: 1 },
      ] },
      '/forms/BOM/submissions': { hasMore: false, questions: QUESTIONS, submissions: [submission('s1', 'Ana', 'Jardim', 'a@b.com')] },
    });
    const api = createTallyApi({ token: 't', fetchImpl: doFetch, sleep: async () => {} });
    const stats = await ingestTallyForms({ api, client: fakeClient() as any });
    expect(stats.formsRead).toBe(1);
    expect(stats.perForm.find((stat) => stat.formId === 'RUIM')?.error).toMatch(/404/);
  });
});

describe('matchQualifiedLeads: reprocessamento e persistência', () => {
  const submissionRow = (over: Record<string, unknown> = {}) => ({
    submission_id: 's1', respondent_id: null, form_id: '7RO9QA', form_name: 'Form OS',
    submitted_at: '2026-08-14T13:22:05.000Z', first_name: 'Ana', last_name: 'Jardim',
    full_name: 'Ana Jardim', normalized_name: 'ana jardim', first_last_name: 'ana jardim',
    email: 'ana@gmail.com', email_domain: 'gmail.com', is_corporate_email: false,
    phone_raw: '+5511992946933', phone_e164: '+5511992946933', is_junk: false,
    source: 'api', source_file: null, raw: {}, ...over,
  });

  it('pula quem já tem MATCHED com telefone e processa o resto', async () => {
    const client = fakeClient({
      leads: [
        { id: 'L1', full_name: 'Ana Jardim', company_name: null, company_url: null, qualification_status: 'qualified' },
        { id: 'L2', full_name: 'Bruno Torres', company_name: null, company_url: null, qualification_status: 'qualified' },
      ],
      lead_phone_matches: [{ lead_id: 'L1', match_status: 'MATCHED', phone_e164: '+5511000000000' }],
      lead_comments: [{ lead_id: 'L2', post_id: 'P1', commented_at: '2026-08-01T00:00:00Z' }],
      post_lead_magnets: [{ post_id: 'P1', tally_form_id: '7RO9QA' }],
      tally_submissions: [submissionRow({ submission_id: 's2', first_name: 'Bruno', last_name: 'Torres', full_name: 'Bruno Torres', normalized_name: 'bruno torres', first_last_name: 'bruno torres', email: 'bruno@gmail.com' })],
    });
    const { stats } = await matchQualifiedLeads({ client: client as any });
    expect(stats).toMatchObject({ qualified: 2, skippedAlreadyMatched: 1, reprocessed: 1, MATCHED: 1, telefones: 1 });
    // L1 não foi tocado; L2 ganhou linha nova.
    expect(client.tables.lead_phone_matches).toHaveLength(2);
    const l2 = client.tables.lead_phone_matches.find((row) => row.lead_id === 'L2');
    expect(l2).toMatchObject({ match_status: 'MATCHED', phone_e164: '+5511992946933', submission_id: 's2' });
  });

  it('caso ambíguo é resolvido sozinho e nunca grava telefone', async () => {
    // Dois homônimos com telefones DIFERENTES: não há como escolher, e escolher
    // errado manda WhatsApp para um estranho. Desde 27/08/2026 isso não vira mais
    // fila humana — é descartado na hora, sem número nenhum gravado.
    const client = fakeClient({
      leads: [{ id: 'L1', full_name: 'Joao Silva', company_name: null, company_url: null, qualification_status: 'qualified' }],
      tally_submissions: [
        submissionRow({
          submission_id: 's9', first_name: 'Joao', last_name: 'Silva', full_name: 'Joao Silva',
          normalized_name: 'joao silva', first_last_name: 'joao silva', email: 'joao@gmail.com',
          phone_e164: '+5511111111111',
        }),
        submissionRow({
          submission_id: 's10', first_name: 'Joao', last_name: 'Silva', full_name: 'Joao Silva',
          normalized_name: 'joao silva', first_last_name: 'joao silva', email: 'outro@gmail.com',
          phone_e164: '+5522222222222',
        }),
      ],
    });
    const { stats } = await matchQualifiedLeads({ client: client as any });
    expect(stats).toMatchObject({ REVIEW: 0, MATCHED: 0, NOT_FOUND: 1, telefones: 0 });
    const row = client.tables.lead_phone_matches[0];
    expect(row.match_status).toBe('NOT_FOUND');
    expect(row.match_method).toBe('auto:descartado_empate');
    expect(row.phone_e164).toBeNull();
    expect(row.phone_form_name).toBeNull();
    expect(row.submission_id).toBeNull();
  });

  it('candidato único com telefone é vinculado sem passar por humano', async () => {
    const client = fakeClient({
      leads: [{ id: 'L1', full_name: 'Joao Silva', company_name: null, company_url: null, qualification_status: 'qualified' }],
      tally_submissions: [submissionRow({
        submission_id: 's9', first_name: 'Joao', last_name: 'Silva', full_name: 'Joao Silva',
        normalized_name: 'joao silva', first_last_name: 'joao silva', email: 'joao@gmail.com',
        phone_e164: '+5511999999999',
      })],
    });
    const { stats } = await matchQualifiedLeads({ client: client as any });
    expect(stats).toMatchObject({ REVIEW: 0, MATCHED: 1, telefones: 1 });
    const row = client.tables.lead_phone_matches[0];
    expect(row.match_method).toBe('auto:unico_com_telefone');
    expect(row.phone_e164).toBe('+5511999999999');
  });

  it('dryRun não grava nada', async () => {
    const client = fakeClient({
      leads: [{ id: 'L1', full_name: 'Ana Jardim', company_name: null, company_url: null, qualification_status: 'qualified' }],
      lead_comments: [{ lead_id: 'L1', post_id: 'P1', commented_at: '2026-08-01T00:00:00Z' }],
      post_lead_magnets: [{ post_id: 'P1', tally_form_id: '7RO9QA' }],
      tally_submissions: [submissionRow()],
    });
    const { stats } = await matchQualifiedLeads({ client: client as any, dryRun: true });
    expect(stats.MATCHED).toBe(1);
    expect(client.tables.lead_phone_matches).toHaveLength(0);
  });

  it('não faz trabalho nenhum quando todos já têm telefone', async () => {
    const client = fakeClient({
      leads: [{ id: 'L1', full_name: 'Ana Jardim', qualification_status: 'qualified' }],
      lead_phone_matches: [{ lead_id: 'L1', match_status: 'MATCHED', phone_e164: '+5511992946933' }],
    });
    const { stats } = await matchQualifiedLeads({ client: client as any });
    expect(stats).toMatchObject({ reprocessed: 0, candidateSubmissions: 0, MATCHED: 0 });
  });
});
