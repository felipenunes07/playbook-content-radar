// Monta o dataset completo do cruzamento "5 ROTINAS" (xX8rVJ) e grava JSON para o
// gerador de Excel.
//
// Uso:
//   npx tsx scratch/rotinas-dataset.ts [formId] > scratch/rotinas-dataset.json
//
// Cruza, por pessoa do Tally:
//   Tally (nome/e-mail/telefone) → leads (perfil, cargo, empresa, ICP)
//                                → lead_comments (o que comentou, onde, quando)
//                                → tally_submissions (outros lead magnets)
//                                → lead_outreach (já foi prospectado?)
//                                → lead_magnet_bookings (agendou?)
//                                → lead_phone_matches (match já registrado?)
// Somente leitura, anon key.

import fs from 'node:fs';
import { matchLeads, type LeadForMatch } from '../supabase/functions/_shared/leadPhoneMatch.ts';
import type { TallySubmission } from '../supabase/functions/_shared/tallySource.ts';
import {
  emailDomain,
  firstLastKey,
  isCorporateEmail,
  isJunkName,
  normalizePersonName,
  phoneE164,
} from '../supabase/functions/_shared/person.ts';

const FORM_ID = process.argv[2] || 'xX8rVJ';
const CSV_PATH = process.argv[3] || '';
const OUTPUT_PATH = process.argv[4] || '';
const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const TESTE = new Set(['fereservas@gmail.com', 'felipearian10197@gmail.com']);

function anonKey() {
  const source = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const match = source.match(/SUPABASE_ANON_KEY = '([^']+)'/);
  if (!match) throw new Error('Não achei a anon key em src/main.jsx');
  return match[1];
}

const KEY = anonKey();
const log = (msg: string) => process.stderr.write(msg + '\n');

async function selectAll(table: string, query: string) {
  const rows: any[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}&limit=${page}&offset=${offset}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

function toSubmission(row: any): TallySubmission {
  return {
    submissionId: row.submission_id, respondentId: row.respondent_id,
    formId: row.form_id, formName: row.form_name || '', submittedAt: row.submitted_at,
    firstName: row.first_name || '', lastName: row.last_name || '', fullName: row.full_name || '',
    normalizedName: row.normalized_name || '', firstLastName: row.first_last_name || '',
    email: row.email || '', emailDomain: row.email_domain || '',
    isCorporateEmail: Boolean(row.is_corporate_email),
    phoneRaw: row.phone_raw || '', phoneE164: row.phone_e164 || '',
    isJunk: Boolean(row.is_junk), source: 'api', sourceFile: null, raw: row.raw || {},
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function submissionsFromCsv(path: string): TallySubmission[] {
  const rows = parseCsv(fs.readFileSync(path, 'utf8'));
  const headers = rows.shift() || [];
  const position = new Map(headers.map((header, index) => [header.replace(/^\uFEFF/, ''), index]));
  const cell = (row: string[], header: string) => row[position.get(header) ?? -1] || '';
  return rows.filter((row) => row.some(Boolean)).map((row) => {
    const firstName = cell(row, 'Nome').trim();
    const lastName = cell(row, 'Sobrenome').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const email = cell(row, 'E-mail').trim().toLowerCase();
    return {
      submissionId: cell(row, 'Submission ID'),
      respondentId: cell(row, 'Respondent ID'),
      formId: FORM_ID,
      formName: '5 ROTINAS PARA AUTOMATIZAR SUA OPERAÇÃO',
      submittedAt: cell(row, 'Submitted at') || null,
      firstName,
      lastName,
      fullName,
      normalizedName: normalizePersonName(fullName),
      firstLastName: firstLastKey(fullName),
      email,
      emailDomain: emailDomain(email),
      isCorporateEmail: isCorporateEmail(email),
      phoneRaw: cell(row, 'Telefone'),
      phoneE164: phoneE164(cell(row, 'Telefone')),
      isJunk: isJunkName(firstName, lastName),
      source: 'csv',
      sourceFile: path,
      raw: {},
    };
  });
}

// leads.location gravou a string "[object Object]" em 1.763 de 3.140 linhas. O valor
// real sobreviveu em profile_raw.location — recupera de lá.
function localidade(lead: any) {
  const bug = !lead?.location || lead.location === '[object Object]';
  const raw = lead?.profile_raw?.location;
  const parsed = raw?.parsed || {};
  const texto = raw?.linkedinText || parsed.text || (bug ? '' : lead.location);
  return {
    cidade: parsed.city || '',
    estado: parsed.state || '',
    pais: parsed.country || parsed.countryFull || '',
    localidade: texto || '',
    recuperado: bug && Boolean(texto),
  };
}

function industria(lead: any) {
  const industries = lead?.company_raw?.industries;
  if (Array.isArray(industries)) {
    return industries.map((item: any) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean).join(', ');
  }
  return typeof industries === 'string' ? industries : '';
}

const dia = (value: unknown) => (value ? String(value).slice(0, 10) : '');
const minuto = (value: unknown) => (value ? String(value).slice(0, 16).replace('T', ' ') : '');

async function main() {
  log(`Lendo Supabase — formulário ${FORM_ID}…`);
  const [todasSubs, leadRows, commentRows, postRows, magnetRows, outreachRows, bookingRows, phoneMatchRows] = await Promise.all([
    selectAll('tally_submissions', 'select=submission_id,respondent_id,form_id,form_name,submitted_at,first_name,last_name,full_name,normalized_name,first_last_name,email,email_domain,is_corporate_email,phone_raw,phone_e164,is_junk&order=submitted_at.asc'),
    selectAll('leads', 'select=id,full_name,public_identifier,profile_url,headline,job_title,seniority,area,company_name,company_url,company_size,company_revenue_estimated,location,qualification_status,qualification_reason,score,suggested_angle,created_at&order=created_at.asc'),
    selectAll('lead_comments', 'select=post_id,lead_id,commented_at,comment_text&order=commented_at.asc'),
    selectAll('content_posts', 'select=id,cta_keyword,published_at,author_name,hook,post_url,theme,format'),
    selectAll('post_lead_magnets', 'select=post_id,tally_form_id'),
    selectAll('lead_outreach', 'select=lead_id,status,channel,angle,prospected_at,created_at'),
    selectAll('lead_magnet_bookings', 'select=lead_name,lead_email,lead_magnet,event_name,status,start_time'),
    selectAll('lead_phone_matches', 'select=lead_id,submission_id,match_status,match_method,confidence,phone_e164,phone_form_name,matched_at,review_decision'),
  ]);

  const submissions = CSV_PATH
    ? submissionsFromCsv(CSV_PATH)
    : todasSubs.filter((row: any) => row.form_id === FORM_ID).map(toSubmission);
  const postById = new Map(postRows.map((post: any) => [post.id, post]));
  // Fonte da verdade do vínculo post->formulário é post_lead_magnets (igual à produção
  // em tallySync.ts), não o cta_keyword — que o LinkedIn tornou obsoleto e o coletor
  // reescreve todo dia. Assim o vínculo manual do post de rotinas entra aqui também.
  const postFormMap = new Map<string, string[]>();
  for (const magnet of magnetRows as any[]) {
    if (!magnet.post_id || !magnet.tally_form_id) continue;
    const list = postFormMap.get(magnet.post_id);
    if (list) { if (!list.includes(magnet.tally_form_id)) list.push(magnet.tally_form_id); }
    else postFormMap.set(magnet.post_id, [magnet.tally_form_id]);
  }

  const commentsByLead = new Map<string, any[]>();
  for (const comment of commentRows) {
    const list = commentsByLead.get(comment.lead_id);
    if (list) list.push(comment); else commentsByLead.set(comment.lead_id, [comment]);
  }

  const leadsComComentario = leadRows.filter((lead: any) => commentsByLead.has(lead.id));
  const leadsForMatch: LeadForMatch[] = leadsComComentario.map((lead: any) => {
    const own = commentsByLead.get(lead.id) || [];
    const formIds = [...new Set(own.flatMap((c: any) => postFormMap.get(c.post_id) || []))];
    const datas = own.map((c: any) => c.commented_at).filter(Boolean).sort();
    return {
      id: lead.id, fullName: lead.full_name,
      companyName: lead.company_name, companyUrl: lead.company_url,
      postFormIds: formIds, firstCommentedAt: datas[0] || null,
    };
  });

  const { results } = matchLeads(leadsForMatch, submissions);
  const comMatch = results.filter((r) => r.status !== 'NOT_FOUND');

  // Busca profile_raw/company_raw só dos leads que casaram — o blob é grande.
  const idsCasados = [...new Set(comMatch.map((r) => r.leadId))];
  log(`Leads casados: ${idsCasados.length}. Buscando profile_raw/company_raw desses…`);
  const rawRows = idsCasados.length
    ? await selectAll('leads', `select=id,profile_raw,company_raw&id=in.(${idsCasados.join(',')})`)
    : [];
  const rawById = new Map(rawRows.map((row: any) => [row.id, row]));
  const leadById = new Map(leadRows.map((lead: any) => [lead.id, lead]));

  const outreachByLead = new Map<string, any[]>();
  for (const row of outreachRows) {
    const list = outreachByLead.get(row.lead_id);
    if (list) list.push(row); else outreachByLead.set(row.lead_id, [row]);
  }
  const phoneMatchByLead = new Map(phoneMatchRows.map((row: any) => [row.lead_id, row]));
  const bookingByEmail = new Map(bookingRows.map((row: any) => [String(row.lead_email || '').toLowerCase(), row]));

  // Histórico do e-mail em TODOS os formulários do Tally.
  const historicoPorEmail = new Map<string, any[]>();
  for (const row of todasSubs) {
    const email = String(row.email || '').toLowerCase();
    if (!email) continue;
    const list = historicoPorEmail.get(email);
    if (list) list.push(row); else historicoPorEmail.set(email, [row]);
  }

  // Um registro por e-mail do formulário; guarda todos os leads candidatos.
  type Pessoa = { subs: TallySubmission[]; matches: typeof comMatch };
  const pessoas = new Map<string, Pessoa>();
  for (const sub of submissions) {
    const chave = (sub.email || `nome:${sub.normalizedName}`).toLowerCase();
    const atual = pessoas.get(chave) || { subs: [], matches: [] };
    atual.subs.push(sub);
    pessoas.set(chave, atual);
  }
  for (const result of comMatch) {
    for (const candidate of result.candidates) {
      const chave = (candidate.email || candidate.personKey).toLowerCase();
      const pessoa = pessoas.get(chave);
      if (pessoa && !pessoa.matches.includes(result)) pessoa.matches.push(result);
    }
  }

  const ordemStatus: Record<string, number> = { MATCHED: 0, MATCHED_NO_PHONE: 1, REVIEW: 2 };

  const inscritos = [...pessoas.entries()].map(([chave, pessoa]) => {
    const sub = pessoa.subs[0];
    const email = (sub.email || '').toLowerCase();
    const historico = (historicoPorEmail.get(email) || []).filter((row: any) => row.form_id !== FORM_ID);
    const outrosForms = [...new Set(historico.map((row: any) => row.form_name))];
    const primeiroContato = [...historico.map((row: any) => row.submitted_at), sub.submittedAt]
      .filter(Boolean).sort()[0];

    const melhor = [...pessoa.matches].sort((a, b) =>
      (ordemStatus[a.status] ?? 9) - (ordemStatus[b.status] ?? 9) || b.confidence - a.confidence)[0];
    const lead: any = melhor ? leadById.get(melhor.leadId) : null;
    const raw: any = melhor ? rawById.get(melhor.leadId) : null;
    const enriquecido = lead ? { ...lead, profile_raw: raw?.profile_raw, company_raw: raw?.company_raw } : null;
    const loc = enriquecido ? localidade(enriquecido) : { cidade: '', estado: '', pais: '', localidade: '', recuperado: false };
    const comentarios = melhor ? (commentsByLead.get(melhor.leadId) || []) : [];
    const posts = [...new Set(comentarios.map((c: any) => c.post_id))].map((id) => postById.get(id)).filter(Boolean) as any[];
    const outreach = melhor ? (outreachByLead.get(melhor.leadId) || []) : [];
    const booking = bookingByEmail.get(email);
    const phoneMatch = melhor ? phoneMatchByLead.get(melhor.leadId) : null;

    const audiencia = melhor ? 'Comentou em post' : (historico.length ? 'Baixou outro lead magnet' : 'Novo');

    return {
      chave,
      teste: TESTE.has(email),
      lixo: sub.isJunk,
      audiencia,
      nome_tally: sub.fullName,
      primeiro_nome: sub.firstName,
      sobrenome: sub.lastName,
      email: sub.email,
      dominio: sub.emailDomain,
      corporativo: sub.isCorporateEmail ? 'sim' : 'não',
      telefone: sub.phoneE164,
      inscrito_em: minuto(sub.submittedAt),
      inscricoes_neste_form: pessoa.subs.length,
      outros_lead_magnets: historico.length,
      quais_lead_magnets: outrosForms.join(' | '),
      primeiro_contato: dia(primeiroContato),
      dias_na_base: primeiroContato
        ? Math.round((Date.parse(String(sub.submittedAt)) - Date.parse(String(primeiroContato))) / 86400000)
        : 0,
      match_status: melhor?.status || 'NOT_FOUND',
      match_metodo: melhor?.method || '',
      match_confianca: melhor?.confidence ?? '',
      match_evidencia: (melhor?.evidence || []).join(' + '),
      leads_candidatos: pessoa.matches.length,
      nome_linkedin: lead?.full_name || '',
      linkedin: lead?.profile_url || '',
      headline: lead?.headline || '',
      cargo: lead?.job_title || '',
      senioridade: lead?.seniority || '',
      area: lead?.area || '',
      empresa: lead?.company_name || '',
      tamanho_empresa: lead?.company_size ?? '',
      industria: enriquecido ? industria(enriquecido) : '',
      faturamento_estimado: lead?.company_revenue_estimated || '',
      cidade: loc.cidade,
      estado: loc.estado,
      pais: loc.pais,
      localidade: loc.localidade,
      icp_status: lead?.qualification_status || '',
      icp_score: lead?.score ?? '',
      icp_motivo: lead?.qualification_reason || '',
      angulo_sugerido: lead?.suggested_angle || '',
      comentarios: comentarios.length,
      primeiro_comentario: dia(comentarios[0]?.commented_at),
      ultimo_comentario: dia(comentarios[comentarios.length - 1]?.commented_at),
      posts_comentados: posts.map((p) => `${dia(p.published_at)} ${p.cta_keyword || 's/CTA'}`).join(' | '),
      ctas_comentados: [...new Set(posts.map((p) => p.cta_keyword).filter((c) => c && c !== 'Sem CTA'))].join(', '),
      prospectado: outreach.length ? (outreach[0].status || 'sim') : 'não',
      canal_outreach: outreach[0]?.channel || '',
      data_outreach: dia(outreach[0]?.prospected_at || outreach[0]?.created_at),
      agendou_reuniao: booking ? `${booking.event_name || 'sim'} (${dia(booking.start_time)})` : 'não',
      telefone_ja_registrado: phoneMatch ? `${phoneMatch.match_status} ${phoneMatch.phone_e164 || ''}`.trim() : '',
    };
  });

  // Uma linha por par (inscrição × lead candidato).
  const matches = comMatch.flatMap((result) => {
    const lead: any = leadById.get(result.leadId);
    const comentarios = commentsByLead.get(result.leadId) || [];
    const posts = [...new Set(comentarios.map((c: any) => c.post_id))].map((id) => postById.get(id)).filter(Boolean) as any[];
    return result.candidates.map((candidate, indice) => ({
      status: result.status,
      metodo: result.method,
      confianca: result.confidence,
      evidencia: result.evidence.join(' + '),
      candidato: indice + 1,
      candidatos_total: result.candidates.length,
      nome_tally: candidate.fullName,
      email: candidate.email,
      telefone: candidate.phoneE164,
      inscrito_em: minuto(candidate.submittedAt),
      tipo_de_nome: candidate.nameKind,
      nome_linkedin: lead?.full_name || '',
      linkedin: lead?.profile_url || '',
      cargo: lead?.job_title || lead?.headline || '',
      empresa: lead?.company_name || '',
      tamanho_empresa: lead?.company_size ?? '',
      icp_status: lead?.qualification_status || '',
      icp_score: lead?.score ?? '',
      comentarios: comentarios.length,
      posts_comentados: posts.map((p) => `${dia(p.published_at)} ${p.cta_keyword || 's/CTA'}`).join(' | '),
    }));
  });

  // Comentários literais de quem casou — matéria-prima do ICP.
  const comentariosLista = comMatch.flatMap((result) => {
    const lead: any = leadById.get(result.leadId);
    return (commentsByLead.get(result.leadId) || []).map((comment: any) => {
      const post: any = postById.get(comment.post_id);
      return {
        nome_linkedin: lead?.full_name || '',
        match_status: result.status,
        cargo: lead?.job_title || lead?.headline || '',
        empresa: lead?.company_name || '',
        comentado_em: dia(comment.commented_at),
        post_publicado_em: dia(post?.published_at),
        post_autor: post?.author_name || '',
        post_cta: post?.cta_keyword || '',
        post_hook: String(post?.hook || '').slice(0, 120),
        comentario: String(comment.comment_text || '').replace(/\s+/g, ' ').trim(),
      };
    });
  });

  const historicoLista = inscritos
    .filter((row) => row.outros_lead_magnets > 0)
    .flatMap((row) => (historicoPorEmail.get(row.email.toLowerCase()) || [])
      .filter((sub: any) => sub.form_id !== FORM_ID)
      .map((sub: any) => ({
        nome_tally: row.nome_tally,
        email: row.email,
        audiencia: row.audiencia,
        lead_magnet: sub.form_name,
        form_id: sub.form_id,
        baixado_em: minuto(sub.submitted_at),
        telefone: sub.phone_e164 || '',
      })));

  const saida = { formId: FORM_ID, geradoEm: minuto(new Date().toISOString()), inscritos, matches, comentarios: comentariosLista, historico: historicoLista };
  const json = JSON.stringify(saida, null, 2);
  if (OUTPUT_PATH) fs.writeFileSync(OUTPUT_PATH, json);
  else process.stdout.write(json);
  log(`\nInscritos: ${inscritos.length} | matches: ${matches.length} | comentários: ${comentariosLista.length} | histórico: ${historicoLista.length}`);
}

main().catch((error) => { log(String(error)); process.exit(1); });
