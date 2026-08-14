// Fontes da Base Tally. CSV e API produzem EXATAMENTE o mesmo TallySubmission, que é
// o único formato que o matcher conhece. Trocar/adicionar fonte não toca o matcher.
//
// Diferença real entre as duas (medida nos dados):
// - API: tipo do campo é explícito (INPUT_PHONE_NUMBER), form_id e nome vêm de graça
// - CSV: só rótulo de coluna, e o form só sai do nome do arquivo
// Por isso o mapeamento de colunas do CSV é heurística + override manual.

import {
  emailDomain, firstLastKey, fullNameKey, isCorporateEmail, isJunkName, phoneE164,
} from './person.ts';

export type TallySubmission = {
  submissionId: string;
  respondentId: string | null;
  formId: string;
  formName: string;
  submittedAt: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  normalizedName: string;
  firstLastName: string;
  email: string;
  emailDomain: string;
  isCorporateEmail: boolean;
  phoneRaw: string;
  phoneE164: string;
  isJunk: boolean;
  source: 'csv' | 'api';
  sourceFile: string | null;
  raw: Record<string, unknown>;
};

export type ColumnMap = {
  submissionId?: string;
  respondentId?: string;
  submittedAt?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

// Detecta as colunas por rótulo. Não confia em ordem: no CSV real do "36 Skills de
// SDR" a ordem é Nome, Telefone, Sobrenome, E-mail — telefone no meio dos nomes.
export function detectColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  const find = (test: RegExp) => header.find((column) => test.test(column.trim()));
  map.submissionId = find(/^submission\s*id$/i);
  map.respondentId = find(/^respondent\s*id$/i);
  map.submittedAt = find(/^submitted\s*at$|^data|^date/i);
  map.email = find(/^e-?mail$|e-?mail/i);
  map.phone = find(/^telefone$|telefone|whatsapp|celular|^phone$|phone\s*number/i);
  map.lastName = find(/^sobrenome$|sobrenome|^last\s*name$|surname/i);
  // "Nome" tem que ser procurado por último e não pode capturar "Sobrenome".
  map.firstName = header.find((column) => /^(nome|primeiro\s*nome|first\s*name|nome\s*completo)$/i.test(column.trim()))
    || header.find((column) => /nome/i.test(column) && column !== map.lastName);
  return map;
}

// Nome do formulário a partir do arquivo exportado pelo Tally, que segue
// "<Nome do formulário>_Submissions_<data>.csv".
export function formNameFromFileName(fileName: string) {
  const base = String(fileName || '').replace(/\\/g, '/').split('/').pop() || '';
  const withoutExt = base.replace(/\.csv$/i, '');
  const match = withoutExt.match(/^(.*?)_Submissions?(?:_\d{4}-\d{2}-\d{2})?$/i);
  return (match ? match[1] : withoutExt).trim();
}

function buildSubmission(input: {
  submissionId: string;
  respondentId?: string | null;
  formId: string;
  formName: string;
  submittedAt?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source: 'csv' | 'api';
  sourceFile?: string | null;
  raw: Record<string, unknown>;
}): TallySubmission {
  const firstName = String(input.firstName ?? '').trim();
  const lastName = String(input.lastName ?? '').trim();
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const phoneRaw = String(input.phone ?? '').trim();
  return {
    submissionId: input.submissionId,
    respondentId: input.respondentId ?? null,
    formId: input.formId,
    formName: input.formName,
    submittedAt: input.submittedAt ?? null,
    firstName,
    lastName,
    fullName,
    normalizedName: fullNameKey(fullName),
    firstLastName: firstLastKey(fullName),
    email,
    emailDomain: emailDomain(email),
    isCorporateEmail: isCorporateEmail(email),
    phoneRaw,
    phoneE164: phoneE164(phoneRaw),
    isJunk: isJunkName(firstName, lastName),
    source: input.source,
    sourceFile: input.sourceFile ?? null,
    raw: input.raw,
  };
}

export function submissionsFromCsv(text: string, context: {
  formId: string;
  formName?: string;
  sourceFile?: string;
  columns?: ColumnMap;
}): { submissions: TallySubmission[]; columns: ColumnMap; skipped: number } {
  const rows = parseCsv(text);
  if (!rows.length) return { submissions: [], columns: {}, skipped: 0 };
  const header = rows[0];
  const columns = { ...detectColumns(header), ...(context.columns || {}) };
  const formName = context.formName || formNameFromFileName(context.sourceFile || '');
  const submissions: TallySubmission[] = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const raw = Object.fromEntries(header.map((column, index) => [column, row[index] ?? '']));
    const submissionId = String(columns.submissionId ? raw[columns.submissionId] : '').trim();
    // Sem submission_id não há chave de dedupe — a linha é inútil e não entra.
    if (!submissionId) { skipped++; continue; }
    submissions.push(buildSubmission({
      submissionId,
      respondentId: columns.respondentId ? String(raw[columns.respondentId]).trim() : null,
      formId: context.formId,
      formName,
      submittedAt: columns.submittedAt ? String(raw[columns.submittedAt]).trim() || null : null,
      firstName: columns.firstName ? String(raw[columns.firstName]) : '',
      lastName: columns.lastName ? String(raw[columns.lastName]) : '',
      email: columns.email ? String(raw[columns.email]) : '',
      phone: columns.phone ? String(raw[columns.phone]) : '',
      source: 'csv',
      sourceFile: context.sourceFile ?? null,
      raw,
    }));
  }
  return { submissions, columns, skipped };
}

// A API real chama o texto da pergunta de `title` e marca perguntas removidas com
// `isDeleted`; o wrapper MCP entrega o mesmo campo como `label`. Aceitamos os dois —
// custou uma execução em produção descobrir a diferença.
type ApiQuestion = { id: string; type: string; title?: string; label?: string; isDeleted?: boolean };
type ApiSubmission = {
  id: string;
  respondentId?: string | null;
  submittedAt?: string;
  // O respondentId vem em cada resposta na API real (e não no topo da submission).
  responses?: Array<{ questionId: string; answer?: unknown; respondentId?: string | null }>;
};

function questionText(question: ApiQuestion) {
  return String(question.title ?? question.label ?? '').trim();
}

// A doc da API diz que `answer` varia por tipo de pergunta: string, número, boolean,
// array ou objeto. Para nome/telefone/e-mail esperamos string, mas um objeto cru
// viraria "[object Object]" e entraria no banco como se fosse o nome da pessoa.
function answerToString(answer: unknown): string {
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'string') return answer.trim();
  if (typeof answer === 'number' || typeof answer === 'boolean') return String(answer);
  if (Array.isArray(answer)) return answer.map(answerToString).filter(Boolean).join(' ').trim();
  if (typeof answer === 'object') {
    const record = answer as Record<string, unknown>;
    // Formatos que o Tally usa em campos compostos (telefone, endereço, upload).
    for (const key of ['value', 'text', 'label', 'name', 'number', 'phone', 'email', 'url']) {
      if (typeof record[key] === 'string' && record[key]) return String(record[key]).trim();
    }
    return '';
  }
  return '';
}

// Adaptador da API. Usa o TIPO do campo (INPUT_PHONE_NUMBER/INPUT_EMAIL) em vez de
// adivinhar pelo rótulo — é a vantagem concreta da API sobre o CSV.
export function submissionsFromApi(payload: {
  formId: string;
  formName: string;
  questions: ApiQuestion[];
  submissions: ApiSubmission[];
}): TallySubmission[] {
  const live = payload.questions.filter((question) => !question.isDeleted);
  const byType = (type: string) => live.find((question) => question.type === type)?.id;
  const byLabel = (test: RegExp, exclude?: string) => live
    .find((question) => test.test(questionText(question)) && question.id !== exclude)?.id;

  const phoneId = byType('INPUT_PHONE_NUMBER') || byLabel(/telefone|whatsapp|celular|phone/i);
  const emailId = byType('INPUT_EMAIL') || byLabel(/e-?mail/i);
  const lastNameId = byLabel(/^sobrenome$|sobrenome|^last\s*name$|surname/i);
  const firstNameId = byLabel(/^(nome|primeiro\s*nome|first\s*name)$/i, lastNameId)
    || byLabel(/nome/i, lastNameId);

  return payload.submissions.map((submission) => {
    const answers = new Map((submission.responses || []).map((response) => [response.questionId, response.answer]));
    const answer = (id?: string) => (id && answers.has(id) ? answerToString(answers.get(id)) : '');
    return buildSubmission({
      submissionId: submission.id,
      // Na API real o respondentId está em cada resposta, não no topo.
      respondentId: submission.respondentId
        ?? (submission.responses || []).find((response) => response.respondentId)?.respondentId
        ?? null,
      formId: payload.formId,
      formName: payload.formName,
      submittedAt: submission.submittedAt ?? null,
      firstName: answer(firstNameId),
      lastName: answer(lastNameId),
      email: answer(emailId),
      phone: answer(phoneId),
      source: 'api',
      raw: submission as unknown as Record<string, unknown>,
    });
  });
}

// Dedupe por submission_id, mantendo a versão mais recente (a última importação
// ganha). Resolve o "subo o CSV de novo semana que vem sem duplicar".
export function dedupeSubmissions(submissions: TallySubmission[]) {
  const byId = new Map<string, TallySubmission>();
  for (const submission of submissions) byId.set(submission.submissionId, submission);
  return [...byId.values()];
}
