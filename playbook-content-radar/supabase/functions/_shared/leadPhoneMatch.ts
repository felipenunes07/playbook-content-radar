// Cruzamento Lead ICP aprovado x Base Tally. Puro, sem I/O.
//
// Responde UMA pergunta: "essa pessoa que já foi aprovada tem telefone nas nossas
// submissions?". Não requalifica nada — o status de ICP entra como filtro de entrada
// e sai intocado.
//
// A regra que manda: falso positivo é muito pior que não achar. Nome sozinho só
// decide quando é específico o bastante (>=3 tokens) E o candidato é único; nos
// outros casos exige uma segunda evidência independente, ou cai em REVIEW.
//
// Evidências independentes do nome:
//   - form_do_post: a submission é do formulário mapeado para o post em que o lead
//     comentou. Medido: quem faz isso é quase certamente a mesma pessoa.
//   - dominio_empresa: e-mail corporativo cujo domínio casa com company_name/url.
// Sinal fraco (só desempata, nunca promove):
//   - apos_comentario: submission depois do comentário.

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
  reviewGenericName: 0.6,
  reviewPartialName: 0.45,
  reviewAmbiguous: 0.3,
};

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

  const exact = fullKey ? (index.byFullName.get(fullKey) || []) : [];
  const partial = partialKey ? (index.byFirstLast.get(partialKey) || []) : [];
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

  const chosen = { person: people.get(top.personKey)!, anchor: top };

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
  // Nome de 2 tokens sem corroboração: "joao silva" colide, não promove.
  if (nameKind === 'exato' && unique) {
    return resultFrom(lead, 'REVIEW', 'nome_exato_generico', CONFIDENCE.reviewGenericName,
      top.evidence, candidates, chosen);
  }
  if (nameKind === 'exato' && !tied && topStrong.length) {
    return resultFrom(lead, 'REVIEW', 'nome_exato_multiplos_candidatos', CONFIDENCE.reviewGenericName,
      top.evidence, candidates, chosen);
  }
  if (nameKind === 'exato') {
    return resultFrom(lead, 'REVIEW', 'nome_exato_ambiguo', CONFIDENCE.reviewAmbiguous,
      top.evidence, candidates, chosen);
  }
  return resultFrom(lead, 'REVIEW', unique ? 'nome_parcial' : 'nome_parcial_ambiguo',
    unique ? CONFIDENCE.reviewPartialName : CONFIDENCE.reviewAmbiguous,
    top.evidence, candidates, chosen);
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
