// Cruzamento Lead ICP aprovado x Base Tally. Puro, sem I/O.
//
// Responde UMA pergunta: "essa pessoa que já foi aprovada tem telefone nas nossas
// submissions?". Não requalifica nada — o status de ICP entra como filtro de entrada
// e sai intocado.
//
// A regra que manda: falso positivo é muito pior que não achar. Nome sozinho só
// decide quando é específico o bastante E o candidato é único; nos outros casos
// exige uma segunda evidência independente.
//
// Evidências independentes do nome:
//   - form_do_post: a submission é do formulário mapeado para o post em que o lead
//     comentou. Medido: quem faz isso é quase certamente a mesma pessoa.
//   - dominio_empresa: e-mail corporativo cujo domínio casa com company_name/url.
// Sinal fraco (só desempata, nunca promove):
//   - apos_comentario: submission depois do comentário.
//
// SEM FILA DE REVISÃO desde 27/08/2026 (pedido do Felipe: "ninguém está revisando").
// Antes, todo caso difuso virava REVIEW e esperava decisão humana. Medido no banco em
// 27/08: 119 leads em REVIEW — e só 11 deles tinham candidato COM telefone. Ou seja,
// 108 das 119 revisões pendentes não podiam render telefone nenhum, decidisse o que
// decidisse. A fila era quase toda trabalho sem prêmio, e por isso ninguém mexia.
//
// O que destrava isso é notar onde mora o risco: o único estrago que um match errado
// faz é grudar o TELEFONE de outra pessoa no lead. Onde não há telefone em jogo, não
// há falso positivo possível — e não há por que perguntar a um humano. Então:
//
//   1. Nenhum candidato tem telefone  → resolve sozinho, sem telefone. Risco zero.
//   2. Tem telefone e um vencedor claro → resolve sozinho como MATCHED.
//   3. Tem telefone e está ambíguo de verdade → DESCARTA (NOT_FOUND, sem telefone),
//      em vez de virar fila. needsReprocessing() devolve esses leads ao matcher a
//      cada sync, então "descartado" não é definitivo: submission nova com evidência
//      melhor reabre o caso automaticamente.
//
// A regra de ouro anterior continua de pé: telefone só é anexado quando a decisão é
// MATCHED, e ambiguidade real nunca vira MATCHED. O que mudou é que o caso ambíguo
// morre em NOT_FOUND em vez de virar tarefa para alguém.

import { emailMatchesCompany, fullNameKey, firstLastKey, nameSpecificity } from './person.ts';
import type { TallySubmission } from './tallySource.ts';

export type LeadForMatch = {
  id: string;
  fullName: string;
  companyName?: string | null;
  companyUrl?: string | null;
  /** form_ids dos posts em que o lead comentou (via post_lead_magnets). */
  postFormIds?: string[];
  /** data do comentário mais antigo, para o sinal apos_comentario. */
  firstCommentedAt?: string | null;
  /** submission_id que um humano já rejeitou para este lead na fila de REVIEW.
   *  Excluídos dos candidatos: sem isto, a sincronização seguinte reencontraria o
   *  mesmo candidato e devolveria o lead para REVIEW para sempre. */
  rejectedSubmissionIds?: string[];
};

export type MatchStatus = 'MATCHED' | 'MATCHED_NO_PHONE' | 'REVIEW' | 'NOT_FOUND';

export type MatchCandidate = {
  submissionId: string;
  personKey: string;
  fullName: string;
  email: string;
  formId: string;
  formName: string;
  submittedAt: string | null;
  phoneE164: string;
  evidence: string[];
  score: number;
  nameKind: 'exato' | 'primeiro_ultimo';
};

export type MatchResult = {
  leadId: string;
  leadName: string;
  status: MatchStatus;
  method: string | null;
  confidence: number;
  submissionId: string | null;
  phoneE164: string | null;
  phoneFormId: string | null;
  phoneFormName: string | null;
  phoneSubmittedAt: string | null;
  evidence: string[];
  candidates: MatchCandidate[];
};

const CONFIDENCE = {
  nameAndPostForm: 0.96,
  nameAndCompany: 0.94,
  specificNameUnique: 0.85,
  // Decididos sozinhos com telefone em jogo. Confiança menor de propósito: o número
  // é usável, mas a tela marca como "match automático" e deixa corrigir.
  autoStrongEvidence: 0.8,
  autoUniquePhone: 0.65,
  // Resolvidos sem telefone: identidade provável, nada a perder se estiver errada.
  autoNoPhoneAvailable: 0.5,
  // Descartes. Não são "não existe" — são "não dá para afirmar sem risco".
  autoDiscardedAmbiguous: 0.2,
};

/** Nome com menos de 2 tokens úteis não identifica ninguém: "Rafael F." vira só
 *  ["rafael"] e casa com meia dúzia de Rafaéis diferentes. Caso real medido em 27/08:
 *  um lead assim tinha 6 candidatos ("RAFAEL JUNIOR", "Rafael Filho", "rafael s"…),
 *  um deles com telefone. Aceitar seria mandar WhatsApp para um estranho. */
const MIN_TOKENS_PARA_DECIDIR = 2;

/** Acima disso, nome exato repetido é colisão de nome comum, não a mesma pessoa
 *  cadastrada várias vezes. Só evidência forte decide num pool desse tamanho. */
const MAX_CANDIDATOS_SEM_EVIDENCIA_FORTE = 3;

/** Uma pessoa = um e-mail. Medido no CSV: respondent_id não é confiável (o mesmo
 *  respondent trouxe "joao marcos" e "q q"), e-mail é. Sem e-mail, cai no nome. */
function personKeyOf(submission: TallySubmission) {
  return submission.email || `nome:${submission.normalizedName}`;
}

export function buildSubmissionIndex(submissions: TallySubmission[]) {
  const byFullName = new Map<string, TallySubmission[]>();
  const byFirstLast = new Map<string, TallySubmission[]>();
  const byPerson = new Map<string, TallySubmission[]>();
  for (const submission of submissions) {
    if (submission.isJunk || !submission.normalizedName) continue;
    const push = (map: Map<string, TallySubmission[]>, key: string) => {
      if (!key) return;
      const list = map.get(key);
      if (list) list.push(submission); else map.set(key, [submission]);
    };
    push(byFullName, submission.normalizedName);
    push(byFirstLast, submission.firstLastName);
    push(byPerson, personKeyOf(submission));
  }
  return { byFullName, byFirstLast, byPerson };
}

export type SubmissionIndex = ReturnType<typeof buildSubmissionIndex>;

function evidenceFor(lead: LeadForMatch, submission: TallySubmission) {
  const evidence: string[] = [];
  const formIds = lead.postFormIds || [];
  if (formIds.length && formIds.includes(submission.formId)) evidence.push('form_do_post');
  if (emailMatchesCompany(submission.email, lead.companyName, lead.companyUrl)) evidence.push('dominio_empresa');
  if (lead.firstCommentedAt && submission.submittedAt
    && new Date(submission.submittedAt).getTime() >= new Date(lead.firstCommentedAt).getTime()) {
    evidence.push('apos_comentario');
  }
  return evidence;
}

const STRONG = new Set(['form_do_post', 'dominio_empresa']);

/** Entre as submissions da MESMA pessoa, a mais recente que tenha telefone.
 *  É o que resolve o caso medido da Juliana Yamamoto: preencheu 13:11 sem telefone
 *  e 13:22 com telefone — o match precisa achar a segunda. */
function bestPhoneSubmission(submissions: TallySubmission[]) {
  const withPhone = submissions.filter((submission) => submission.phoneE164);
  if (!withPhone.length) return null;
  return withPhone.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0];
}

function resultFrom(
  lead: LeadForMatch,
  status: MatchStatus,
  method: string | null,
  confidence: number,
  evidence: string[],
  candidates: MatchCandidate[],
  chosen: { person: TallySubmission[]; anchor: TallySubmission } | null,
): MatchResult {
  // O telefone só é lido quando a decisão foi MATCHED. Em REVIEW o candidato fica em
  // `candidates` para o humano olhar, mas nada de telefone sai daqui — é a regra
  // "nunca associar automaticamente o telefone à pessoa errada", garantida no
  // ponto único onde o resultado é montado.
  const phone = status === 'MATCHED' && chosen ? bestPhoneSubmission(chosen.person) : null;
  const finalStatus: MatchStatus = status === 'MATCHED' && !phone ? 'MATCHED_NO_PHONE' : status;
  const resolved = finalStatus === 'MATCHED' || finalStatus === 'MATCHED_NO_PHONE';
  return {
    leadId: lead.id,
    leadName: lead.fullName,
    status: finalStatus,
    method,
    confidence,
    submissionId: resolved && chosen ? (phone?.submissionId ?? chosen.anchor.submissionId) : null,
    phoneE164: phone?.phoneE164 ?? null,
    phoneFormId: phone?.formId ?? null,
    phoneFormName: phone?.formName ?? null,
    phoneSubmittedAt: phone?.submittedAt ?? null,
    evidence,
    candidates,
  };
}

export function matchLeadToSubmissions(lead: LeadForMatch, index: SubmissionIndex): MatchResult {
  const fullKey = fullNameKey(lead.fullName);
  const partialKey = firstLastKey(lead.fullName);
  const specificity = nameSpecificity(lead.fullName);

  // Rejeição humana é filtrada ANTES de escolher entre nome exato e parcial: um
  // candidato rejeitado não deve nem contar como "existe match exato".
  const rejected = new Set(lead.rejectedSubmissionIds || []);
  const keep = (list: TallySubmission[]) => (rejected.size
    ? list.filter((submission) => !rejected.has(submission.submissionId))
    : list);

  const exact = keep(fullKey ? (index.byFullName.get(fullKey) || []) : []);
  const partial = keep(partialKey ? (index.byFirstLast.get(partialKey) || []) : []);
  const pool = exact.length ? exact : partial;
  const nameKind: 'exato' | 'primeiro_ultimo' = exact.length ? 'exato' : 'primeiro_ultimo';

  if (!pool.length) {
    return resultFrom(lead, 'NOT_FOUND', null, 0, [], [], null);
  }

  // Agrupa por pessoa: 3 submissions do mesmo e-mail não são 3 candidatos.
  const people = new Map<string, TallySubmission[]>();
  for (const submission of pool) {
    const key = personKeyOf(submission);
    const list = people.get(key);
    if (list) list.push(submission); else people.set(key, [submission]);
  }

  const candidates: MatchCandidate[] = [];
  for (const [personKey, submissions] of people) {
    const evidence = submissions
      .map((submission) => evidenceFor(lead, submission))
      .reduce<string[]>((accumulator, current) => [...new Set([...accumulator, ...current])], []);
    const anchor = bestPhoneSubmission(submissions) || submissions[0];
    const strong = evidence.filter((item) => STRONG.has(item)).length;
    candidates.push({
      submissionId: anchor.submissionId,
      personKey,
      fullName: anchor.fullName,
      email: anchor.email,
      formId: anchor.formId,
      formName: anchor.formName,
      submittedAt: anchor.submittedAt,
      phoneE164: bestPhoneSubmission(submissions)?.phoneE164 || '',
      evidence,
      score: strong * 2 + (evidence.includes('apos_comentario') ? 1 : 0) + (nameKind === 'exato' ? 1 : 0),
      nameKind,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const topStrong = top.evidence.filter((item) => STRONG.has(item));
  const unique = candidates.length === 1;
  // Empate no topo com evidência forte igual = ambíguo de verdade.
  const tied = candidates.length > 1 && candidates[1].score === top.score;

  const pickOf = (candidate: MatchCandidate) => ({ person: people.get(candidate.personKey)!, anchor: candidate });
  const chosen = pickOf(top);

  // Os três caminhos de sempre: nome exato, único, com corroboração independente.
  if (nameKind === 'exato' && unique && topStrong.includes('form_do_post')) {
    return resultFrom(lead, 'MATCHED', 'nome_exato+form_do_post', CONFIDENCE.nameAndPostForm,
      top.evidence, candidates, chosen);
  }
  if (nameKind === 'exato' && unique && topStrong.includes('dominio_empresa')) {
    return resultFrom(lead, 'MATCHED', 'nome_exato+dominio_empresa', CONFIDENCE.nameAndCompany,
      top.evidence, candidates, chosen);
  }
  // Nome específico (>=3 tokens) e candidato único: colisão é rara o suficiente.
  if (nameKind === 'exato' && unique && specificity >= 3) {
    return resultFrom(lead, 'MATCHED', 'nome_exato_especifico', CONFIDENCE.specificNameUnique,
      top.evidence, candidates, chosen);
  }

  // Daqui para baixo era tudo REVIEW. Agora decide sozinho — ver o cabeçalho.
  //
  // O que separa "vale decidir" de "não vale" é TELEFONE: sem número em jogo, o
  // veredito não tem consequência nenhuma no fluxo (a tela só usa o match para
  // mostrar/exportar o telefone).
  const comTelefone = candidates.filter((candidate) => candidate.phoneE164);

  // (1) Nenhum candidato tem telefone: não existe estrago possível. Registra a
  // identidade provável quando o nome bate exato e é único — é informação honesta e
  // deixa a linha legível na tela — e não afirma nada nos outros casos.
  if (!comTelefone.length) {
    if (nameKind === 'exato' && unique && specificity >= MIN_TOKENS_PARA_DECIDIR) {
      return resultFrom(lead, 'MATCHED', 'auto:sem_telefone_na_base', CONFIDENCE.autoNoPhoneAvailable,
        top.evidence, candidates, chosen);
    }
    return resultFrom(lead, 'NOT_FOUND', 'auto:sem_telefone_na_base', CONFIDENCE.autoNoPhoneAvailable,
      top.evidence, candidates, null);
  }

  // Nome curto demais para identificar alguém: descarta sem olhar o resto.
  if (specificity < MIN_TOKENS_PARA_DECIDIR) {
    return resultFrom(lead, 'NOT_FOUND', 'auto:nome_curto_demais', CONFIDENCE.autoDiscardedAmbiguous,
      top.evidence, candidates, null);
  }

  // (2a) Um único candidato COM telefone carrega evidência forte, e nenhum outro
  // candidato com telefone disputa. É o vencedor claro: o formulário do post ou o
  // domínio corporativo já é a segunda evidência que a regra sempre exigiu.
  const fortesComTelefone = comTelefone.filter((candidate) => candidate.evidence.some((item) => STRONG.has(item)));
  if (fortesComTelefone.length === 1) {
    const vencedor = fortesComTelefone[0];
    return resultFrom(lead, 'MATCHED', `auto:evidencia_forte:${vencedor.evidence.filter((item) => STRONG.has(item)).join('+')}`,
      CONFIDENCE.autoStrongEvidence, vencedor.evidence, candidates, pickOf(vencedor));
  }

  // (2b) Sem evidência forte: aceita quando existe UM só candidato com telefone e o
  // nome bateu exato num pool pequeno. Pool grande com nome exato repetido é colisão
  // de nome comum (os seis "Rafael"), não a mesma pessoa — aí não decide.
  if (comTelefone.length === 1 && nameKind === 'exato'
      && candidates.length <= MAX_CANDIDATOS_SEM_EVIDENCIA_FORTE) {
    const vencedor = comTelefone[0];
    return resultFrom(lead, 'MATCHED', 'auto:unico_com_telefone', CONFIDENCE.autoUniquePhone,
      vencedor.evidence, candidates, pickOf(vencedor));
  }

  // (3) Ambíguo com telefone em jogo: DESCARTA. Dois homônimos com telefones
  // diferentes é exatamente o caso em que chutar manda mensagem para a pessoa errada.
  // Não é definitivo: needsReprocessing() traz o lead de volta no próximo sync.
  const motivo = tied ? 'auto:descartado_empate'
    : nameKind === 'exato' ? 'auto:descartado_homonimos'
    : 'auto:descartado_nome_parcial';
  return resultFrom(lead, 'NOT_FOUND', motivo, CONFIDENCE.autoDiscardedAmbiguous,
    top.evidence, candidates, null);
}

export function matchLeads(leads: LeadForMatch[], submissions: TallySubmission[]) {
  const index = buildSubmissionIndex(submissions);
  const results = leads.map((lead) => matchLeadToSubmissions(lead, index));
  return { results, summary: summarize(results) };
}

export function summarize(results: MatchResult[]) {
  const summary = {
    analisados: results.length,
    MATCHED: 0,
    MATCHED_NO_PHONE: 0,
    REVIEW: 0,
    NOT_FOUND: 0,
    telefones: 0,
  };
  for (const result of results) {
    summary[result.status]++;
    if (result.phoneE164) summary.telefones++;
  }
  return summary;
}

/** Quem reprocessar quando entrar CSV novo: nunca quem já tem telefone confirmado. */
export function needsReprocessing(previous: Pick<MatchResult, 'status' | 'phoneE164'> | null) {
  if (!previous) return true;
  if (previous.status === 'MATCHED' && previous.phoneE164) return false;
  return true;
}
