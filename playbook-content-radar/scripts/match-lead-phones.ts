// Roda o cruzamento Lead ICP aprovado x Base Tally e imprime o resultado.
//
// Uso:
//   npx tsx scripts/match-lead-phones.ts <pasta-ou-arquivo-csv> [...]
//
// Lê os leads/comentários/posts do Supabase com a anon key (só leitura) e as
// submissions dos CSVs em disco. NÃO escreve nada: a persistência em
// tally_submissions/lead_phone_matches exige service role e roda na edge function.
// O objetivo aqui é validar precisão antes de gravar qualquer telefone.

import fs from 'node:fs';
import path from 'node:path';
import { buildPostFormMap } from '../supabase/functions/_shared/leadMagnets.ts';
import { matchLeads, type LeadForMatch, type MatchResult } from '../supabase/functions/_shared/leadPhoneMatch.ts';
import { dedupeSubmissions, formNameFromFileName, submissionsFromCsv, type TallySubmission } from '../supabase/functions/_shared/tallySource.ts';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';

function anonKey() {
  const source = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const match = source.match(/SUPABASE_ANON_KEY = '([^']+)'/);
  if (!match) throw new Error('Não achei a anon key em src/main.jsx');
  return match[1];
}

async function select(table: string, query: string) {
  const key = anonKey();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
}

function collectCsvFiles(inputs: string[]) {
  const files: string[] = [];
  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(input)) {
        if (/\.csv$/i.test(entry)) files.push(path.join(input, entry));
      }
    } else files.push(input);
  }
  return files;
}

// O form_id não está no CSV (verificado: nenhuma coluna indica formulário), só no
// nome do arquivo. Resolvemos pelo nome do formulário contra o mapeamento conhecido.
import { CTA_TO_TALLY_FORM } from '../supabase/functions/_shared/leadMagnets.ts';
function formIdForFile(file: string) {
  const formName = formNameFromFileName(file);
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const hit = CTA_TO_TALLY_FORM.find((link) => normalize(link.formName) === normalize(formName));
  return { formId: hit?.formId || `csv:${normalize(formName)}`, formName, mapped: Boolean(hit) };
}

async function main() {
  const inputs = process.argv.slice(2);
  if (!inputs.length) {
    console.error('Informe a pasta ou os arquivos CSV exportados do Tally.');
    process.exit(1);
  }

  console.log('Lendo Supabase (somente leitura)…');
  const [leads, comments, posts] = await Promise.all([
    select('leads', 'select=id,full_name,company_name,company_url,qualification_status,score&qualification_status=eq.qualified&limit=2000'),
    select('lead_comments', 'select=post_id,lead_id,commented_at&limit=5000'),
    select('content_posts', 'select=id,cta_keyword&limit=3000'),
  ]) as [any[], any[], any[]];

  const postFormMap = buildPostFormMap(posts);
  const commentsByLead = new Map<string, any[]>();
  for (const comment of comments) {
    const list = commentsByLead.get(comment.lead_id);
    if (list) list.push(comment); else commentsByLead.set(comment.lead_id, [comment]);
  }

  const leadsForMatch: LeadForMatch[] = leads.map((lead) => {
    const own = commentsByLead.get(lead.id) || [];
    const formIds = [...new Set(own.flatMap((comment) => postFormMap.get(comment.post_id) || []))];
    const dates = own.map((comment) => comment.commented_at).filter(Boolean).sort();
    return {
      id: lead.id,
      fullName: lead.full_name,
      companyName: lead.company_name,
      companyUrl: lead.company_url,
      postFormIds: formIds,
      firstCommentedAt: dates[0] || null,
    };
  });

  console.log('Lendo CSVs do Tally…');
  let submissions: TallySubmission[] = [];
  for (const file of collectCsvFiles(inputs)) {
    const { formId, formName, mapped } = formIdForFile(file);
    const result = submissionsFromCsv(fs.readFileSync(file, 'utf8'), { formId, formName, sourceFile: file });
    submissions = submissions.concat(result.submissions);
    console.log(`   ${formName} → ${result.submissions.length} submissions`
      + ` | form_id=${formId}${mapped ? '' : ' (SEM VÍNCULO no leadMagnets.ts)'}`
      + (result.skipped ? ` | ${result.skipped} linha(s) sem submission_id` : ''));
  }
  submissions = dedupeSubmissions(submissions);

  const comTelefone = submissions.filter((item) => item.phoneE164 && !item.isJunk);
  const lixo = submissions.filter((item) => item.isJunk);
  console.log(`\nBase Tally: ${submissions.length} submissions | ${comTelefone.length} com telefone`
    + ` | ${lixo.length} marcadas como lixo`);
  const comVinculo = leadsForMatch.filter((lead) => lead.postFormIds?.length).length;
  console.log(`Leads aprovados: ${leadsForMatch.length} | ${comVinculo} com post vinculado a formulário`);

  const { results, summary } = matchLeads(leadsForMatch, submissions);

  console.log('\n==================== RESULTADO');
  console.log(`   ${summary.analisados} leads aprovados analisados`);
  console.log(`   ${summary.MATCHED} MATCHED  (telefone anexado)`);
  console.log(`   ${summary.MATCHED_NO_PHONE} MATCHED_NO_PHONE  (achado no Tally, sem telefone)`);
  console.log(`   ${summary.REVIEW} REVIEW  (precisa de revisão humana)`);
  console.log(`   ${summary.NOT_FOUND} NOT_FOUND`);
  console.log(`   ${summary.telefones} telefone(s) encontrado(s)`);

  const mostrar = (titulo: string, status: MatchResult['status'], limite = 12) => {
    const lista = results.filter((result) => result.status === status);
    if (!lista.length) return;
    console.log(`\n--- ${titulo} (${lista.length})`);
    for (const result of lista.slice(0, limite)) {
      console.log(`   ${result.leadName}`);
      console.log(`      método=${result.method} confiança=${result.confidence} evidência=[${result.evidence.join(', ')}]`);
      if (result.phoneE164) {
        console.log(`      📱 ${result.phoneE164} — ${result.phoneFormName} — ${String(result.phoneSubmittedAt).slice(0, 16)}`);
      }
      for (const candidate of result.candidates.slice(0, 3)) {
        console.log(`      candidato: "${candidate.fullName}" ${candidate.email}`
          + ` tel=${candidate.phoneE164 || 'vazio'} form=${candidate.formName}`
          + ` evid=[${candidate.evidence.join(', ')}]`);
      }
    }
    if (lista.length > limite) console.log(`   … e mais ${lista.length - limite}`);
  };

  mostrar('MATCHED', 'MATCHED');
  mostrar('MATCHED_NO_PHONE', 'MATCHED_NO_PHONE');
  mostrar('REVIEW', 'REVIEW');
}

main().catch((error) => { console.error(error); process.exit(1); });
