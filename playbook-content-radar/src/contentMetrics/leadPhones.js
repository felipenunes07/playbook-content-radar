// Regras de apresentação do telefone vindo da Base Tally, num único lugar.
//
// A regra absoluta — só MATCHED expõe telefone — já é garantida no matcher e por um
// CHECK no banco. Aqui ela é garantida uma terceira vez, na fronteira da UI: mesmo se
// uma linha chegasse errada da API, `phoneToShow` devolve string vazia fora de
// MATCHED. Nenhum componente lê `phone_e164` direto; todos passam por aqui.

export const PHONE_STATUSES = {
  MATCHED: { label: 'Telefone encontrado', short: 'Encontrado', tone: 'ok' },
  MATCHED_NO_PHONE: { label: 'Aguardando telefone', short: 'Aguardando', tone: 'wait' },
  REVIEW: { label: 'Revisar match', short: 'Revisar', tone: 'review' },
  NOT_FOUND: { label: 'Não encontrado no Tally', short: 'Não encontrado', tone: 'none' },
  NOT_PROCESSED: { label: 'Ainda não processado', short: 'Não processado', tone: 'none' },
};

export const PHONE_FILTERS = [
  { id: 'todos', label: 'Todos', status: null },
  { id: 'matched', label: 'Telefone encontrado', status: 'MATCHED' },
  { id: 'aguardando', label: 'Aguardando telefone', status: 'MATCHED_NO_PHONE' },
  { id: 'revisar', label: 'Revisar', status: 'REVIEW' },
  { id: 'nao_encontrado', label: 'Não encontrado', status: 'NOT_FOUND' },
];

export function phoneStatusOf(row) {
  const status = String(row?.match_status || 'NOT_PROCESSED');
  return PHONE_STATUSES[status] ? status : 'NOT_PROCESSED';
}

export function phoneStatusMeta(row) {
  return PHONE_STATUSES[phoneStatusOf(row)];
}

/** A ÚNICA porta pela qual um telefone chega na interface ou no export. Fora de
 *  MATCHED devolve '' — REVIEW e MATCHED_NO_PHONE nunca vazam número. */
export function phoneToShow(row) {
  if (phoneStatusOf(row) !== 'MATCHED') return '';
  return String(row?.phone_e164 || '');
}

/** +5511999998888 -> +55 11 99999-8888. Números fora do padrão BR saem como estão. */
export function formatPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const middle = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
    return `+55 ${ddd} ${middle}-${end}`;
  }
  return raw;
}

export function phoneDisplay(row) {
  return formatPhone(phoneToShow(row));
}

export function indexPhonesByLead(rows = []) {
  const index = new Map();
  for (const row of rows) {
    if (row?.lead_id) index.set(row.lead_id, row);
  }
  return index;
}

export function matchesPhoneFilter(row, filterId) {
  const filter = PHONE_FILTERS.find((item) => item.id === filterId);
  if (!filter || !filter.status) return true;
  return phoneStatusOf(row) === filter.status;
}

export function countByPhoneFilter(rows = []) {
  const counts = Object.fromEntries(PHONE_FILTERS.map((filter) => [filter.id, 0]));
  for (const row of rows) {
    counts.todos += 1;
    const status = phoneStatusOf(row);
    const filter = PHONE_FILTERS.find((item) => item.status === status);
    if (filter) counts[filter.id] += 1;
  }
  return counts;
}

/** Candidatos do REVIEW para a fila, já sem telefone: a UI não recebe o número
 *  enquanto a decisão não foi tomada, nem para exibir "escondido". */
export function reviewCandidates(row) {
  const candidates = Array.isArray(row?.candidates) ? row.candidates : [];
  const rejected = new Set(Array.isArray(row?.rejected_submission_ids) ? row.rejected_submission_ids : []);
  return candidates
    .filter((candidate) => !rejected.has(candidate?.submissionId))
    .map((candidate) => ({
      submissionId: candidate?.submissionId || '',
      fullName: candidate?.fullName || '',
      email: candidate?.email || '',
      formName: candidate?.formName || '',
      submittedAt: candidate?.submittedAt || null,
      evidence: Array.isArray(candidate?.evidence) ? candidate.evidence : [],
      // Só se HÁ telefone, nunca qual é. É o que o revisor precisa saber para decidir
      // se vale confirmar, sem o número aparecer antes da decisão.
      hasPhone: Boolean(candidate?.phoneE164),
    }));
}

const EVIDENCE_LABELS = {
  form_do_post: 'preencheu o formulário do post em que comentou',
  dominio_empresa: 'domínio do e-mail corporativo casa com a empresa do lead',
  apos_comentario: 'submission posterior ao comentário',
};

export function evidenceLabel(evidence) {
  return EVIDENCE_LABELS[evidence] || evidence;
}

const METHOD_REASONS = {
  nome_exato_generico: 'Nome bate por completo, mas tem só 2 palavras — nomes assim colidem com frequência.',
  nome_exato_ambiguo: 'Mais de uma pessoa no Tally tem exatamente este nome.',
  nome_exato_multiplos_candidatos: 'Nome exato, porém há mais de um candidato possível.',
  nome_parcial: 'Só o primeiro e o último nome coincidem — há nome do meio de diferença.',
  nome_parcial_ambiguo: 'Coincidência parcial de nome e mais de um candidato.',
};

export function reviewReason(row) {
  return METHOD_REASONS[row?.match_method] || 'Confiança insuficiente para vincular automaticamente.';
}
