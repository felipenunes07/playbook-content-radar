// Regras de apresentação do telefone vindo da Base Tally, num único lugar.
//
// A regra absoluta — só MATCHED expõe telefone — já é garantida no matcher e por um
// CHECK no banco. Aqui ela é garantida uma terceira vez, na fronteira da UI: mesmo se
// uma linha chegasse errada da API, `phoneToShow` devolve string vazia fora de
// MATCHED. Nenhum componente lê `phone_e164` direto; todos passam por aqui.

export const PHONE_STATUSES = {
  MATCHED: { label: 'Telefone encontrado', short: 'Encontrado', tone: 'ok' },
  // NÃO é fila de espera: ninguém está processando nada e nenhum telefone está a
     // caminho. É "achamos a pessoa nas nossas submissions do Tally, mas o formulário
     // que ela preencheu não tinha campo de telefone (ou ela deixou em branco)".
     // O rótulo antigo era "Aguardando telefone", que prometia uma chegada que não
     // vem — e escondia o que isso realmente diz: essa pessoa comentou no post E já
     // baixou um material seu. Isso é temperatura de lead, não pendência.
  MATCHED_NO_PHONE: { label: 'Baixou material, sem telefone', short: 'Baixou material', tone: 'wait' },
  // Herança: o matcher não produz mais REVIEW (o caso difuso se resolve sozinho desde
  // 27/08/2026), mas linhas antigas carregam o status até o próximo sync reprocessá-las.
  REVIEW: { label: 'Revisar match', short: 'Revisar', tone: 'review' },
  NOT_FOUND: { label: 'Não encontrado no Tally', short: 'Não encontrado', tone: 'none' },
  NOT_PROCESSED: { label: 'Ainda não processado', short: 'Não processado', tone: 'none' },
};

/** Match que o robô decidiu sozinho, sem passar por humano. Serve para a tela marcar
 *  o número como "confira antes de mandar" e para o filtro de auditoria — sem isso o
 *  fim da fila de revisão viraria uma caixa-preta. */
export function isAutoMatch(row) {
  return String(row?.match_method || '').startsWith('auto:');
}

/** Só os automáticos que realmente entregaram telefone. É a lista curta que vale a
 *  pena conferir de vez em quando: o resto dos automáticos não anexou número nenhum,
 *  então não tem como estar "errado" de um jeito que custe alguma coisa. */
export function isAutoMatchToAudit(row) {
  return isAutoMatch(row) && phoneStatusOf(row) === 'MATCHED';
}

export const PHONE_FILTERS = [
  { id: 'todos', label: 'Todos', status: null },
  { id: 'matched', label: 'Telefone encontrado', status: 'MATCHED' },
  { id: 'aguardando', label: 'Já baixou material', status: 'MATCHED_NO_PHONE' },
  { id: 'nao_encontrado', label: 'Não encontrado', status: 'NOT_FOUND' },
  // Auditoria opcional, não fila: nada trava esperando decisão aqui.
  { id: 'auto', label: 'Decidido automático', status: null, predicate: isAutoMatchToAudit },
  // Só aparece enquanto sobrar linha antiga em REVIEW.
  { id: 'revisar', label: 'Revisar (antigos)', status: 'REVIEW', legacy: true },
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

/** Link do WhatsApp para o número do lead. Passa pelo mesmo phoneToShow: fora de
 *  MATCHED devolve '' e não há link nenhum para clicar — a regra de não vazar
 *  número vale igual para o href, que também carrega o telefone. */
export function whatsappLink(row) {
  const digits = phoneToShow(row).replace(/\D/g, '');
  // wa.me exige DDI + DDD + número, só dígitos. Menos que isso é número quebrado:
  // melhor não oferecer o link do que abrir uma conversa com o contato errado.
  if (digits.length < 12 || digits.length > 15) return '';
  return `https://wa.me/${digits}`;
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
  if (!filter) return true;
  // Filtro por predicado (o de auditoria dos automáticos) atravessa status: um match
  // decidido sozinho é MATCHED, então não dá para separá-lo só pelo status.
  if (filter.predicate) return filter.predicate(row);
  if (!filter.status) return true;
  return phoneStatusOf(row) === filter.status;
}

export function countByPhoneFilter(rows = []) {
  const counts = Object.fromEntries(PHONE_FILTERS.map((filter) => [filter.id, 0]));
  for (const row of rows) {
    counts.todos += 1;
    const status = phoneStatusOf(row);
    for (const filter of PHONE_FILTERS) {
      if (filter.id === 'todos') continue;
      if (filter.predicate) { if (filter.predicate(row)) counts[filter.id] += 1; continue; }
      if (filter.status === status) counts[filter.id] += 1;
    }
  }
  return counts;
}

/** Qual material a pessoa baixou. Serve para o caso MATCHED_NO_PHONE: sem telefone,
 *  o que sobra de útil é saber por qual isca ela entrou — dá para citar na abordagem
 *  pelo LinkedIn, que é o canal que resta. */
export function downloadedMagnet(row) {
  if (row?.phone_form_name) return String(row.phone_form_name);
  const candidatos = Array.isArray(row?.candidates) ? row.candidates : [];
  const comNome = candidatos.find((candidate) => candidate?.formName);
  return comNome ? String(comNome.formName) : '';
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
  // Legado: métodos que existiam quando o caso difuso virava fila humana.
  nome_exato_generico: 'Nome bate por completo, mas tem só 2 palavras — nomes assim colidem com frequência.',
  nome_exato_ambiguo: 'Mais de uma pessoa no Tally tem exatamente este nome.',
  nome_exato_multiplos_candidatos: 'Nome exato, porém há mais de um candidato possível.',
  nome_parcial: 'Só o primeiro e o último nome coincidem — há nome do meio de diferença.',
  nome_parcial_ambiguo: 'Coincidência parcial de nome e mais de um candidato.',
  // Decididos sem humano desde 27/08/2026.
  'auto:unico_com_telefone': 'Nome bate por completo e só uma pessoa com este nome deixou telefone — vinculado automaticamente.',
  'auto:sem_telefone_na_base': 'A pessoa aparece nas nossas submissions, mas nenhuma delas tem telefone. Não havia o que decidir.',
  'auto:nome_curto_demais': 'O nome do lead tem uma palavra útil só — não dá para identificar ninguém com segurança.',
  'auto:descartado_empate': 'Dois candidatos empatados em evidência, com telefones diferentes. Descartado para não mandar mensagem para a pessoa errada.',
  'auto:descartado_homonimos': 'Vários homônimos no Tally e nenhuma evidência independente para escolher entre eles.',
  'auto:descartado_nome_parcial': 'Só o primeiro e o último nome coincidem, sem nenhuma evidência independente.',
};

export function reviewReason(row) {
  const method = String(row?.match_method || '');
  if (METHOD_REASONS[method]) return METHOD_REASONS[method];
  // As variantes de evidência forte carregam qual evidência decidiu no próprio nome
  // (auto:evidencia_forte:form_do_post+dominio_empresa).
  if (method.startsWith('auto:evidencia_forte:')) {
    const evidencias = method.slice('auto:evidencia_forte:'.length).split('+').map(evidenceLabel);
    return `Vinculado automaticamente: ${evidencias.join(' e ')}.`;
  }
  return 'Confiança insuficiente para vincular automaticamente.';
}
