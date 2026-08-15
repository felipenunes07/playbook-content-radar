// Sincronização Tally → tally_submissions e, depois, o matcher nos leads qualified.
//
// Duas etapas separadas de propósito: a ingestão não sabe nada de lead, e o matcher
// não sabe de onde a submission veio (CSV ou API). Trocar a fonte não toca o matcher.
//
// Garantias que este arquivo sustenta:
//   - nunca duplica submission: upsert com onConflict submission_id
//   - só reprocessa lead qualified que ainda não tem MATCHED com telefone
//   - telefone só é persistido em MATCHED; REVIEW nunca carrega telefone (o matcher
//     já devolve null, o CHECK do banco recusa, e aqui não há caminho que contorne)

import { errorMessage } from './content.ts';
import { matchLeads, needsReprocessing, summarize, type LeadForMatch, type MatchResult } from './leadPhoneMatch.ts';
import { firstLastKey, fullNameKey } from './person.ts';
import { submissionsFromApi, dedupeSubmissions, type TallySubmission } from './tallySource.ts';
import type { TallyApi, TallyForm } from './tallyApi.ts';

export type FormSyncStat = {
  formId: string;
  formName: string;
  received: number;
  inserted: number;
  updated: number;
  withPhone: number;
  junk: number;
  error?: string;
};

export type IngestStats = {
  formsRead: number;
  received: number;
  inserted: number;
  updated: number;
  withPhone: number;
  junk: number;
  perForm: FormSyncStat[];
};

const PAGE = 1000; // teto de linhas por request do PostgREST

/** Lê uma tabela em páginas, porque o PostgREST corta em 1000 linhas por request. */
async function selectAll(client: any, table: string, columns: string, apply?: (query: any) => any) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = client.from(table).select(columns).range(from, from + PAGE - 1);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function toRow(submission: TallySubmission) {
  return {
    submission_id: submission.submissionId,
    respondent_id: submission.respondentId,
    form_id: submission.formId,
    form_name: submission.formName,
    submitted_at: submission.submittedAt,
    first_name: submission.firstName,
    last_name: submission.lastName,
    full_name: submission.fullName,
    normalized_name: submission.normalizedName,
    first_last_name: submission.firstLastName,
    email: submission.email,
    email_domain: submission.emailDomain,
    is_corporate_email: submission.isCorporateEmail,
    phone_raw: submission.phoneRaw,
    phone_e164: submission.phoneE164 || null,
    is_junk: submission.isJunk,
    source: submission.source,
    source_file: submission.sourceFile,
    imported_at: new Date().toISOString(),
    raw: submission.raw,
  };
}

/** Grava as submissions e devolve quantas eram novas e quantas já existiam. A
 *  contagem sai de uma consulta prévia dos ids do formulário — o upsert do
 *  PostgREST não diferencia insert de update. */
export async function upsertSubmissions(client: any, submissions: TallySubmission[]) {
  if (!submissions.length) return { inserted: 0, updated: 0 };
  const ids = submissions.map((submission) => submission.submissionId);
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += PAGE) {
    const slice = ids.slice(index, index + PAGE);
    const { data, error } = await client.from('tally_submissions').select('submission_id').in('submission_id', slice);
    if (error) throw error;
    for (const row of data || []) existing.add(row.submission_id);
  }

  for (let index = 0; index < submissions.length; index += 500) {
    const batch = submissions.slice(index, index + 500).map(toRow);
    const { error } = await client.from('tally_submissions').upsert(batch, { onConflict: 'submission_id' });
    if (error) throw error;
  }

  const updated = ids.filter((id) => existing.has(id)).length;
  return { inserted: ids.length - updated, updated };
}

export async function ingestTallyForms(options: {
  api: TallyApi;
  client: any;
  /** quando omitido, sincroniza todo formulário com submissão */
  formIds?: string[];
  since?: string | null;
  log?: (message: string) => void;
}): Promise<IngestStats> {
  const log = options.log ?? (() => {});
  const all = await options.api.listForms();
  const wanted: TallyForm[] = options.formIds?.length
    ? all.filter((form) => options.formIds!.includes(form.id))
    : all.filter((form) => (form.numberOfSubmissions ?? 0) > 0);

  log(`${wanted.length} formulário(s) a sincronizar (de ${all.length} na conta)`);
  const perForm: FormSyncStat[] = [];

  for (const form of wanted) {
    const stat: FormSyncStat = {
      formId: form.id, formName: form.name, received: 0, inserted: 0, updated: 0, withPhone: 0, junk: 0,
    };
    try {
      const { questions, submissions } = await options.api.fetchFormSubmissions(form.id, { since: options.since });
      const normalized = dedupeSubmissions(submissionsFromApi({
        formId: form.id, formName: form.name, questions, submissions,
      }));
      stat.received = normalized.length;
      stat.withPhone = normalized.filter((item) => item.phoneE164 && !item.isJunk).length;
      stat.junk = normalized.filter((item) => item.isJunk).length;
      const counts = await upsertSubmissions(options.client, normalized);
      stat.inserted = counts.inserted;
      stat.updated = counts.updated;
      log(`   ${form.name}: ${stat.received} recebidas, ${stat.inserted} novas, ${stat.updated} atualizadas, ${stat.withPhone} com telefone`);
    } catch (error) {
      stat.error = errorMessage(error);
      log(`   ${form.name}: ERRO ${stat.error}`);
    }
    perForm.push(stat);
  }

  const total = (pick: (stat: FormSyncStat) => number) => perForm.reduce((sum, stat) => sum + pick(stat), 0);
  return {
    formsRead: perForm.filter((stat) => !stat.error).length,
    received: total((stat) => stat.received),
    inserted: total((stat) => stat.inserted),
    updated: total((stat) => stat.updated),
    withPhone: total((stat) => stat.withPhone),
    junk: total((stat) => stat.junk),
    perForm,
  };
}

function rowToSubmission(row: any): TallySubmission {
  return {
    submissionId: row.submission_id,
    respondentId: row.respondent_id ?? null,
    formId: row.form_id,
    formName: row.form_name ?? '',
    submittedAt: row.submitted_at ?? null,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    fullName: row.full_name ?? '',
    normalizedName: row.normalized_name ?? '',
    firstLastName: row.first_last_name ?? '',
    email: row.email ?? '',
    emailDomain: row.email_domain ?? '',
    isCorporateEmail: Boolean(row.is_corporate_email),
    phoneRaw: row.phone_raw ?? '',
    phoneE164: row.phone_e164 ?? '',
    isJunk: Boolean(row.is_junk),
    source: row.source === 'api' ? 'api' : 'csv',
    sourceFile: row.source_file ?? null,
    raw: row.raw ?? {},
  };
}

export type MatchRunStats = {
  qualified: number;
  skippedAlreadyMatched: number;
  reprocessed: number;
  candidateSubmissions: number;
  MATCHED: number;
  MATCHED_NO_PHONE: number;
  REVIEW: number;
  NOT_FOUND: number;
  telefones: number;
};

export async function matchQualifiedLeads(options: {
  client: any;
  log?: (message: string) => void;
  dryRun?: boolean;
}): Promise<{ stats: MatchRunStats; results: MatchResult[] }> {
  const log = options.log ?? (() => {});
  const client = options.client;

  const leads = await selectAll(client, 'leads', 'id,full_name,company_name,company_url',
    (query) => query.eq('qualification_status', 'qualified'));
  const previous = await selectAll(client, 'lead_phone_matches',
    'lead_id,match_status,phone_e164,rejected_submission_ids,review_decision,reviewed_by,reviewed_at');
  const previousByLead = new Map(previous.map((row) => [row.lead_id, row]));

  // Só entra quem ainda não tem MATCHED com telefone. É o que permite que alguém
  // sem telefone num CSV antigo seja encontrado depois de preencher um lead magnet novo.
  const pending = leads.filter((lead) => needsReprocessing(
    previousByLead.has(lead.id)
      ? { status: previousByLead.get(lead.id).match_status, phoneE164: previousByLead.get(lead.id).phone_e164 }
      : null,
  ));
  log(`${leads.length} leads qualified | ${leads.length - pending.length} já com telefone confirmado (pulados) | ${pending.length} a processar`);
  if (!pending.length) {
    return {
      stats: {
        qualified: leads.length, skippedAlreadyMatched: leads.length - pending.length, reprocessed: 0,
        candidateSubmissions: 0, MATCHED: 0, MATCHED_NO_PHONE: 0, REVIEW: 0, NOT_FOUND: 0, telefones: 0,
      },
      results: [],
    };
  }

  const comments = await selectAll(client, 'lead_comments', 'lead_id,post_id,commented_at');
  const magnets = await selectAll(client, 'post_lead_magnets', 'post_id,tally_form_id');
  const formsByPost = new Map<string, string[]>();
  for (const link of magnets) {
    const list = formsByPost.get(link.post_id);
    if (list) list.push(link.tally_form_id); else formsByPost.set(link.post_id, [link.tally_form_id]);
  }
  const commentsByLead = new Map<string, any[]>();
  for (const comment of comments) {
    const list = commentsByLead.get(comment.lead_id);
    if (list) list.push(comment); else commentsByLead.set(comment.lead_id, [comment]);
  }

  const leadsForMatch: LeadForMatch[] = pending.map((lead) => {
    const own = commentsByLead.get(lead.id) || [];
    const dates = own.map((comment) => comment.commented_at).filter(Boolean).sort();
    return {
      id: lead.id,
      fullName: lead.full_name,
      companyName: lead.company_name,
      companyUrl: lead.company_url,
      postFormIds: [...new Set(own.flatMap((comment) => formsByPost.get(comment.post_id) || []))],
      firstCommentedAt: dates[0] || null,
      rejectedSubmissionIds: previousByLead.get(lead.id)?.rejected_submission_ids || [],
    };
  });

  // Puxa só as submissions cujo nome pode casar com algum lead pendente, em vez das
  // ~19 mil: com ~230 leads são no máximo ~460 chaves.
  const keys = [...new Set(leadsForMatch.flatMap((lead) => [fullNameKey(lead.fullName), firstLastKey(lead.fullName)]).filter(Boolean))];
  const rows: any[] = [];
  for (let index = 0; index < keys.length; index += 100) {
    const slice = keys.slice(index, index + 100);
    for (const column of ['normalized_name', 'first_last_name']) {
      const { data, error } = await client.from('tally_submissions')
        .select('*').eq('is_junk', false).in(column, slice).limit(PAGE);
      if (error) throw error;
      rows.push(...(data || []));
    }
  }
  const candidates = dedupeSubmissions(rows.map(rowToSubmission));
  log(`${candidates.length} submission(s) candidata(s) carregada(s) por nome`);

  const { results } = matchLeads(leadsForMatch, candidates);
  const summary = summarize(results);

  if (!options.dryRun) {
    const payload = results.map((result) => ({
      lead_id: result.leadId,
      submission_id: result.submissionId,
      match_status: result.status,
      match_method: result.method,
      confidence: result.confidence,
      // Só MATCHED traz telefone. O matcher devolve null nos outros status e o
      // CHECK do banco recusaria — aqui é só o repasse fiel.
      phone_e164: result.status === 'MATCHED' ? result.phoneE164 : null,
      phone_form_id: result.status === 'MATCHED' ? result.phoneFormId : null,
      phone_form_name: result.status === 'MATCHED' ? result.phoneFormName : null,
      phone_submitted_at: result.status === 'MATCHED' ? result.phoneSubmittedAt : null,
      evidence: result.evidence,
      candidates: result.candidates,
      matched_at: new Date().toISOString(),
      // A decisão humana sobrevive ao reprocessamento: o upsert reescreve a linha
      // inteira, então repassar os valores anteriores é o que impede uma rejeição
      // (ou uma confirmação) de ser apagada pela sincronização seguinte.
      rejected_submission_ids: previousByLead.get(result.leadId)?.rejected_submission_ids || [],
      review_decision: previousByLead.get(result.leadId)?.review_decision ?? null,
      reviewed_by: previousByLead.get(result.leadId)?.reviewed_by ?? null,
      reviewed_at: previousByLead.get(result.leadId)?.reviewed_at ?? null,
    }));
    for (let index = 0; index < payload.length; index += 500) {
      const { error } = await client.from('lead_phone_matches')
        .upsert(payload.slice(index, index + 500), { onConflict: 'lead_id' });
      if (error) throw error;
    }
  }

  return {
    stats: {
      qualified: leads.length,
      skippedAlreadyMatched: leads.length - pending.length,
      reprocessed: pending.length,
      candidateSubmissions: candidates.length,
      MATCHED: summary.MATCHED,
      MATCHED_NO_PHONE: summary.MATCHED_NO_PHONE,
      REVIEW: summary.REVIEW,
      NOT_FOUND: summary.NOT_FOUND,
      telefones: summary.telefones,
    },
    results,
  };
}
