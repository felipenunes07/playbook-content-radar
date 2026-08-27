// Cruza as inscrições do Tally "5 ROTINAS PARA AUTOMATIZAR SUA OPERAÇÃO" (xX8rVJ)
// com quem já comentou em posts antigos nossos, para desenhar o ICP.
//
// Uso:
//   npx tsx scratch/cruzar-rotinas-comentarios.ts [formId]
//
// Somente leitura, com a anon key. Usa o MESMO matcher do lead_phone_matches
// (leadPhoneMatch.ts), então a regra de "nome sozinho não decide" vale aqui igual.

import fs from 'node:fs';
import { buildPostFormMap } from '../supabase/functions/_shared/leadMagnets.ts';
import { matchLeads, type LeadForMatch } from '../supabase/functions/_shared/leadPhoneMatch.ts';
import type { TallySubmission } from '../supabase/functions/_shared/tallySource.ts';

const FORM_ID = process.argv[2] || 'xX8rVJ';
const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';

function anonKey() {
  const source = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const match = source.match(/SUPABASE_ANON_KEY = '([^']+)'/);
  if (!match) throw new Error('Não achei a anon key em src/main.jsx');
  return match[1];
}

const KEY = anonKey();

// PostgREST corta em 1000 linhas por resposta; pagina até acabar.
async function selectAll(table: string, query: string) {
  const rows: any[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}&limit=${page}&offset=${offset}`;
    const response = await fetch(url, {
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
    submissionId: row.submission_id,
    respondentId: row.respondent_id,
    formId: row.form_id,
    formName: row.form_name || '',
    submittedAt: row.submitted_at,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    fullName: row.full_name || '',
    normalizedName: row.normalized_name || '',
    firstLastName: row.first_last_name || '',
    email: row.email || '',
    emailDomain: row.email_domain || '',
    isCorporateEmail: Boolean(row.is_corporate_email),
    phoneRaw: row.phone_raw || '',
    phoneE164: row.phone_e164 || '',
    isJunk: Boolean(row.is_junk),
    source: 'api',
    sourceFile: null,
    raw: row.raw || {},
  };
}

const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';

async function main() {
  console.log(`Lendo Supabase (somente leitura) — formulário ${FORM_ID}…`);
  const [subRows, leadRows, commentRows, postRows] = await Promise.all([
    selectAll('tally_submissions', `select=*&form_id=eq.${FORM_ID}&order=submitted_at.asc`),
    selectAll('leads', 'select=id,full_name,public_identifier,profile_url,headline,job_title,seniority,area,company_name,company_url,company_size,company_revenue_estimated,location,qualification_status,qualification_reason,score&order=created_at.asc'),
    selectAll('lead_comments', 'select=post_id,lead_id,commented_at,comment_text&order=commented_at.asc'),
    selectAll('content_posts', 'select=id,cta_keyword,published_at,author_name,hook,post_url'),
  ]);

  const submissions = subRows.map(toSubmission);
  const postById = new Map(postRows.map((post: any) => [post.id, post]));
  const postFormMap = buildPostFormMap(postRows as any);

  const commentsByLead = new Map<string, any[]>();
  for (const comment of commentRows) {
    const list = commentsByLead.get(comment.lead_id);
    if (list) list.push(comment); else commentsByLead.set(comment.lead_id, [comment]);
  }

  // Só interessa quem JÁ COMENTOU: a pergunta é "esse inscrito já era audiência nossa?".
  const leadsComComentario = leadRows.filter((lead: any) => commentsByLead.has(lead.id));

  const leadsForMatch: LeadForMatch[] = leadsComComentario.map((lead: any) => {
    const own = commentsByLead.get(lead.id) || [];
    const formIds = [...new Set(own.flatMap((comment: any) => postFormMap.get(comment.post_id) || []))];
    const dates = own.map((comment: any) => comment.commented_at).filter(Boolean).sort();
    return {
      id: lead.id,
      fullName: lead.full_name,
      companyName: lead.company_name,
      companyUrl: lead.company_url,
      postFormIds: formIds,
      firstCommentedAt: dates[0] || null,
    };
  });

  const leadById = new Map(leadsComComentario.map((lead: any) => [lead.id, lead]));

  console.log(`Submissions do formulário: ${submissions.length}`
    + ` | ${submissions.filter((s) => s.isJunk).length} lixo`
    + ` | ${submissions.filter((s) => s.phoneE164).length} com telefone`);
  console.log(`Leads com pelo menos 1 comentário: ${leadsForMatch.length} (de ${leadRows.length} leads)`);
  console.log(`Comentários lidos: ${commentRows.length} | Posts: ${postRows.length}\n`);

  const { results, summary } = matchLeads(leadsForMatch, submissions);

  console.log('==================== CRUZAMENTO');
  console.log(`   ${summary.MATCHED + summary.MATCHED_NO_PHONE} identificados com confiança`);
  console.log(`   ${summary.REVIEW} em REVIEW (nome ambíguo — precisa de olho humano)`);
  console.log(`   ${summary.NOT_FOUND} leads-comentaristas sem correspondência neste formulário`);

  const linhas: any[] = [];
  const detalhar = (status: string) => {
    const lista = results.filter((r) => r.status === status && r.candidates.length);
    if (!lista.length) return;
    console.log(`\n--- ${status} (${lista.length})`);
    for (const result of lista) {
      const lead: any = leadById.get(result.leadId);
      const candidate = result.candidates[0];
      const comentarios = commentsByLead.get(result.leadId) || [];
      const posts = [...new Set(comentarios.map((c: any) => c.post_id))]
        .map((id) => postById.get(id))
        .filter(Boolean) as any[];
      const sub = submissions.find((s) => s.submissionId === candidate.submissionId);

      console.log(`\n   ${lead.full_name}  [${status}] metodo=${result.method} conf=${result.confidence}`);
      console.log(`      Tally: ${candidate.fullName} | ${candidate.email} | tel=${candidate.phoneE164 || 'vazio'}`
        + ` | ${String(candidate.submittedAt).slice(0, 16)}`);
      console.log(`      LinkedIn: ${lead.profile_url || lead.public_identifier || '-'}`);
      console.log(`      Cargo: ${lead.job_title || lead.headline || '-'} | Senioridade: ${lead.seniority || '-'} | Area: ${lead.area || '-'}`);
      console.log(`      Empresa: ${lead.company_name || '-'} | Tamanho: ${lead.company_size ?? '-'} | Local: ${lead.location || '-'}`);
      console.log(`      ICP: ${lead.qualification_status || '-'} (score ${lead.score ?? '-'})`);
      console.log(`      Comentou ${comentarios.length}x em ${posts.length} post(s):`);
      for (const post of posts.slice(0, 5)) {
        console.log(`         ${String(post.published_at).slice(0, 10)} · ${post.author_name} · CTA=${post.cta_keyword || '-'} · ${String(post.hook || '').slice(0, 70)}`);
      }

      linhas.push({
        status,
        metodo: result.method,
        confianca: result.confidence,
        evidencia: result.evidence.join(' + '),
        nome_tally: candidate.fullName,
        primeiro_nome: sub?.firstName || '',
        sobrenome: sub?.lastName || '',
        email: candidate.email,
        email_corporativo: sub?.isCorporateEmail ? 'sim' : 'nao',
        telefone: candidate.phoneE164 || '',
        inscrito_em: candidate.submittedAt,
        nome_linkedin: lead.full_name,
        linkedin: lead.profile_url || '',
        headline: lead.headline || '',
        cargo: lead.job_title || '',
        senioridade: lead.seniority || '',
        area: lead.area || '',
        empresa: lead.company_name || '',
        tamanho_empresa: lead.company_size ?? '',
        faturamento_estimado: lead.company_revenue_estimated || '',
        local: lead.location || '',
        icp_status: lead.qualification_status || '',
        icp_motivo: lead.qualification_reason || '',
        score: lead.score ?? '',
        qtd_comentarios: comentarios.length,
        primeiro_comentario: comentarios[0]?.commented_at || '',
        ultimo_comentario: comentarios[comentarios.length - 1]?.commented_at || '',
        posts_comentados: posts.map((p) => `${String(p.published_at).slice(0, 10)} ${p.cta_keyword || 's/CTA'}`).join(' | '),
      });
    }
  };

  detalhar('MATCHED');
  detalhar('MATCHED_NO_PHONE');
  detalhar('REVIEW');

  // Quem se inscreveu e NÃO aparece como comentarista — audiência nova.
  const casados = new Set(results.filter((r) => r.status !== 'NOT_FOUND')
    .flatMap((r) => r.candidates.map((c) => c.email || c.personKey)));
  const validas = submissions.filter((s) => !s.isJunk);
  const novos = validas.filter((s) => !casados.has(s.email || `nome:${s.normalizedName}`));
  console.log(`\n--- INSCRITOS SEM HISTORICO DE COMENTARIO (${novos.length} de ${validas.length} validos)`);
  for (const sub of novos) {
    console.log(`   ${sub.fullName} | ${sub.email}${sub.isCorporateEmail ? ' (corporativo)' : ''}`
      + ` | ${sub.phoneE164 || 'sem tel'} | ${String(sub.submittedAt).slice(0, 16)}`);
  }

  if (linhas.length) {
    const headers = Object.keys(linhas[0]);
    const csv = [headers.join(','), ...linhas.map((row) => headers.map((h) => csvCell(row[h])).join(','))].join('\n');
    const out = new URL(`./rotinas-x-comentaristas-${FORM_ID}.csv`, import.meta.url);
    fs.writeFileSync(out, '﻿' + csv, 'utf8');
    console.log(`\nCSV: ${decodeURIComponent(out.pathname).slice(1)}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
