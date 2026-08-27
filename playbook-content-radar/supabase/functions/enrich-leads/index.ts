import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { collectorDeadline, remainingMs, runActor } from '../_shared/apify.ts';
import { buildCompanyActorInput, buildCompanyIndex, companyEmployeeCount, findCompany } from './company.ts';
import { chunk, errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, finishRun, json, startRun } from '../_shared/server.ts';
import { llmHeaders, LlmProvider, parseLlmJson, requireClassificationProviders, withLlmFallback } from '../_shared/llm.ts';
import { bdScrape, bdProfileToCanonical, bdCompanyToCanonical, BD_PROFILE_DATASET, BD_COMPANY_DATASET } from '../_shared/brightdata.ts';
import { cargoJaReprova } from '../_shared/cargo.ts';

// Fase 2 da prospecção: pega leads com enrichment_status='pending', enriquece com
// profile (apimaestro, em lote) + company (harvestapi, em lote) e passa um payload
// ENXUTO pro agente de qualificação (LLM). Regras do Victor: só cargo alto (C-level/
// diretoria/gerência), áreas comerciais (marketing/vendas/operações), empresa 200+
// colaboradores. Desempregado NUNCA qualifica pela empresa antiga.
// Processa em lotes pequenos e pode ser re-invocado até zerar a fila (o front chama
// em loop; um cron futuro pode fazer o mesmo).
// Ver docs/superpowers/plans/2026-07-04-warm-prospecting-from-commenters.md
//
// MULTI-ICP desde 27/08/2026: os critérios não são mais um texto global — cada
// prospecção escolhe um ICP e a fila real é lead_qualifications (lead_id, icp_id),
// uma linha por veredito a produzir. São duas filas aqui:
//   (A) lead com enrichment_status='pending' → raspa profile+company e qualifica em
//       cada ICP que o espera (uma chamada de LLM por ICP);
//   (B) lead JÁ enriquecido com qualificação pendente de um ICP novo → só LLM,
//       reaproveitando profile_raw/company_raw. É o caso de quem já estava no banco
//       quando o post foi prospectado com outro ICP: nenhum actor roda de novo.
// O enriquecimento é gravado ANTES da qualificação de propósito: se o LLM bater no
// rate limit no meio, o que falta é só LLM — a fila (B) termina depois sem pagar
// scrape outra vez.

function pick(obj: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    const value = key.split('.').reduce((acc: any, part) => (acc == null ? acc : acc[part]), obj);
    if (value != null && value !== '') return value;
  }
  return null;
}

// Pré-filtro barato: headlines claramente júnior/estudante não valem o custo do
// scrape de profile+company. Só corta os casos óbvios — dúvida vai pro agente.
const JUNIOR_PATTERNS = [
  /estagi[áa]ri/i, /\bestudante\b/i, /\bstudent\b/i, /\bintern\b/i, /\btrainee\b/i,
  /\baprendiz\b/i, /\bjovem aprendiz\b/i, /\bgraduand/i, /\bacad[êe]mic/i,
];

function isObviouslyJunior(headline: string | null): boolean {
  if (!headline) return false;
  return JUNIOR_PATTERNS.some((pattern) => pattern.test(headline));
}

// Extrai a experiência ATUAL do payload do apimaestro (defensivo: o formato exato
// varia; guardamos o cru em profile_raw pra auditar). Sem experiência atual =
// possivelmente desempregado → company fica null e o agente é avisado.
function currentExperience(profile: Record<string, any>) {
  // harvestapi resume o cargo atual em currentPosition[]; quando existe, é a fonte
  // mais confiável do emprego vigente. apimaestro não tem esse campo e cai no
  // experience[] abaixo.
  const current = Array.isArray(profile?.currentPosition) ? profile.currentPosition : [];
  if (current.length) return current[0];

  const experiences = profile?.experience || profile?.experiences || profile?.work_experience || [];
  if (!Array.isArray(experiences)) return null;

  // "Emprego atual" difere por actor: apimaestro usa end_date string vazia/"present";
  // harvestapi usa endDate como OBJETO { text: "Present" }. String(objeto) viraria
  // "[object Object]" e o /present/ nunca casaria — por isso lê o .text antes.
  const isCurrent = (e: Record<string, any>) => {
    if (e?.is_current === true || e?.isCurrent === true) return true;
    const end = pick(e, ['end_date', 'endDate', 'date_range.end', 'duration.end']);
    const endText = end && typeof end === 'object' ? (end.text ?? end.label ?? '') : (end ?? '');
    if (String(endText).trim() === '') return true;
    return /present|atual|hoje/i.test(String(endText));
  };
  return experiences.find(isCurrent) || null;
}

type CompanyRef = { name: string | null; url: string | null };

const COMPANY_ACTOR_BATCH_SIZE = 10;

function chunksOf<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function companyRefFromProfile(profile: Record<string, any>, fallback?: CompanyRef): CompanyRef {
  const info = profile?.basic_info || profile;
  const experience = currentExperience(profile);
  const name = fallback?.name
    || pick(experience || {}, ['company', 'company_name', 'companyName'])
    || pick(info, ['current_company', 'company', 'company_name']);
  const url = fallback?.url
    || pick(experience || {}, ['company_linkedin_url', 'companyLinkedinUrl', 'company_url', 'companyUrl', 'company_linkedin']);
  return { name: name ? String(name) : null, url: url ? String(url) : null };
}

async function fetchCompanyRecords(
  actorId: string,
  token: string,
  companies: CompanyRef[],
  deadlineAt: number,
  bd?: { apiKey: string; datasetId: string } | null,
) {
  const unique = [...new Map(companies
    .filter((company) => company.url || company.name)
    .map((company) => [`${company.url || ''}\n${company.name || ''}`.toLowerCase(), company])).values()];
  const records: Record<string, any>[] = [];
  const errors: string[] = [];
  let actorRuns = 0;

  const runInputs = async (refs: CompanyRef[]) => {
    for (const chunk of chunksOf(refs, COMPANY_ACTOR_BATCH_SIZE)) {
      if (remainingMs(deadlineAt) < 30000) throw new Error('Tempo insuficiente para concluir o enriquecimento de empresas');
      try {
        if (bd) {
          // Bright Data raspa empresa por URL do LinkedIn (não por nome). Empresas
          // que só têm nome ficam sem porte — o LLM decide pelo contexto/conhecimento.
          const urls = chunk.map((c) => c.url).filter((u): u is string => Boolean(u) && /linkedin\.com\/company\//i.test(String(u)));
          if (!urls.length) continue;
          actorRuns += 1;
          const rows = await bdScrape(bd.datasetId, urls, bd.apiKey, deadlineAt);
          records.push(...rows.map(bdCompanyToCanonical));
        } else {
          const input = buildCompanyActorInput(chunk);
          if (!Object.keys(input).length) continue;
          actorRuns += 1;
          const result = await runActor(actorId, token, input, deadlineAt);
          if (Array.isArray(result)) records.push(...result);
        }
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
  };

  await runInputs(unique);

  // O profile scraper costuma devolver /company/<id>, enquanto o actor de empresa
  // pode devolver a URL canônica com slug. O índice casa pelo id, URL e nome. Se
  // ainda faltar uma empresa que tinha URL, tenta uma busca pelo nome como fallback.
  let index = buildCompanyIndex(records);
  const unmatched = unique.filter((company) => !findCompany(index, company) && company.name);
  if (unmatched.length && remainingMs(deadlineAt) > 30000) {
    await runInputs(unmatched.map((company) => ({ name: company.name, url: null })));
    index = buildCompanyIndex(records);
  }

  if (!records.length && unique.length >= 5) {
    const detail = errors.length ? `: ${[...new Set(errors)].join(' | ')}` : '';
    throw new Error(`O actor de empresas não retornou nenhum resultado para ${unique.length} empresa(s)${detail}`);
  }

  return { index, records, actorRuns, errors };
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const GEMINI_SAFE_BATCH_SIZE = 2;
const GEMINI_RETRY_AFTER_SECONDS = 75;
const GEMINI_ESTIMATED_SECONDS_PER_LEAD = 24;

function retryAfterSecondsFromBody(body: Record<string, any>) {
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  for (const detail of details) {
    const retryDelay = detail?.retryDelay || detail?.retry_delay;
    const seconds = String(retryDelay || '').match(/(\d+(?:\.\d+)?)s/)?.[1];
    if (seconds) return Math.max(GEMINI_RETRY_AFTER_SECONDS, Math.ceil(Number(seconds)));
  }
  return GEMINI_RETRY_AFTER_SECONDS;
}

class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds = GEMINI_RETRY_AFTER_SECONDS) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// O tier free do Gemini limita ~10 req/min: 429 é esperado em lotes. Uma nova
// tentativa com espera resolve; sem ela o lead ia pra 'error' à toa (aconteceu no
// primeiro teste E2E em 04/07: 3 de 9 leads caíram por rate limit).
async function llmFetch(url: string, init: RequestInit, deadlineAt: number) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, init);
    if (response.status !== 429 && response.status < 500) return response;
    const retryDelay = 15000 * (attempt + 1);
    if (attempt >= 2 || remainingMs(deadlineAt) < retryDelay + 30000) return response;
    await response.body?.cancel();
    await wait(retryDelay);
  }
}

// Faz a chamada de qualificação num provedor. 429/5xx viram RateLimitError; quando
// é o ÚLTIMO provedor, isso volta o lead pra fila (o principal cai no reserva antes).
async function qualifyWithProvider(provider: LlmProvider, prompt: string, deadlineAt: number) {
  const response = await llmFetch(provider.url, {
    method: 'POST',
    headers: llmHeaders(provider),
    body: JSON.stringify({ model: provider.model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
  }, deadlineAt);
  const body = await response.json();
  if (response.status === 429) {
    throw new RateLimitError(body?.error?.message || JSON.stringify(body) || 'Classification API 429', retryAfterSecondsFromBody(body));
  }
  // 5xx do provedor (503 overloaded / 500 / UNAVAILABLE) é transitório, não é erro do
  // lead: trata como rate limit pra o lead voltar pra fila e o fluxo esperar+seguir
  // em vez de queimar o lead como 'error'. O importante é terminar a lista.
  if (response.status >= 500) {
    throw new RateLimitError(body?.error?.message || JSON.stringify(body) || `Classification API ${response.status}`, retryAfterSecondsFromBody(body));
  }
  if (!response.ok) throw new Error(`${body?.error?.message || JSON.stringify(body) || 'Classification API'} (${response.status})`);
  const parsed = parseLlmJson(body);
  // aprovado/rejeitado → qualified/disqualified. "revisar" foi extinto a pedido do
  // Felipe (05/07): limítrofe vira aprovado e o Victor decide na lista — se algum
  // modelo antigo devolver "revisar", cai em qualified.
  const statusMap: Record<string, string> = { aprovado: 'qualified', rejeitado: 'disqualified', revisar: 'qualified' };
  const status = statusMap[String(parsed.status || '').toLowerCase()] || (parsed.qualified === true ? 'qualified' : 'disqualified');
  const score = Number(parsed.score);
  return {
    status,
    qualified: status === 'qualified',
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
    job_title: parsed.job_title ? String(parsed.job_title).slice(0, 200) : null,
    seniority: parsed.seniority ? String(parsed.seniority).slice(0, 50) : null,
    area: parsed.area ? String(parsed.area).slice(0, 50) : null,
    reason: parsed.reason ? String(parsed.reason).slice(0, 500) : null,
    suggested_angle: parsed.suggested_angle ? String(parsed.suggested_angle).slice(0, 500) : null,
  };
}

async function qualifyLead(payload: Record<string, unknown>, deadlineAt: number, rulesOverride?: string | null) {
  const providers = requireClassificationProviders();
  const minHeadcount = Number(Deno.env.get('PROSPECT_MIN_HEADCOUNT') || 200);
  // Critérios editáveis sem deploy: icp_profiles.icp_rules do ICP daquela qualificação
  // (editável na UI, botão "Ver/editar ICPs") > secret PROSPECT_ICP_RULES
  // > default do escopo formal
  // de 2026-07-05 + ICP da Playbook (Victor: "se vier pouca gente a gente baixa;
  // se vier muito lixo, aperta").
  const rules = rulesOverride || Deno.env.get('PROSPECT_ICP_RULES') || `1. Cargo alto (aprova): founder, sócio, CEO, C-level, diretor, Head, gerente, liderança comercial/marketing/operações, Growth, RevOps, gerente de inovação. Rejeita: estagiário, estudante, analista júnior, SDR/vendedor baixo na hierarquia, assistente.
2. Área (aprova): marketing, vendas/comercial, operações, growth, receita/RevOps, tecnologia/produto, dono do negócio. Rejeita: financeiro, jurídico, RH. Rejeita também quem parece só querer aprender automação, autônomos/freelancers, negócios B2C locais sem time de vendas.
3. Empresa atual com ${minHeadcount}+ colaboradores. Se employee_count vier null mas a empresa parecer claramente grande (banco, multinacional conhecida), pode aprovar citando isso no motivo.
4. IMPORTANTE: se "currently_employed" for false, o lead está sem emprego atual — NUNCA aprove pela empresa antiga; status "rejeitado" com motivo explicando.
5. Casos limítrofes (cargo alto mas empresa sem headcount conhecido, porte um pouco abaixo do corte com contexto forte): APROVE e deixe a incerteza explícita no motivo — quem decide se prospecta é o Victor, na revisão manual da lista.
Score 0-100 (fit geral de cargo + área + porte + contexto do comentário): fit cravado fica 80+, aprovado com ressalva 50-79, rejeitado abaixo de 50.`;
  // O enquadramento vem do ICP, não do código. Cravar "consultoria de IA para vendas"
  // aqui enviesava QUALQUER ICP: o agente que julgava o público do Second Brain era
  // informado de que trabalha numa consultoria comercial, e puxava o veredito para o
  // corte comercial mesmo com outros critérios escritos. Com dois públicos
  // "completamente diferentes" (palavras do Felipe, 27/08), isso deixa de funcionar.
  //
  // `seniority` e `area` continuam num enum fechado de propósito: são os valores que
  // a regra dura por ICP filtra e que a tela mostra. Um ICP fora do corte comercial
  // usa 'outro'/'desconhecido' nesses campos e é julgado pelo texto de critérios —
  // o que manda no veredito é `status`, não o rótulo de área.
  const prompt = `Você qualifica leads para uma operação de prospecção no LinkedIn, seguindo EXCLUSIVAMENTE os critérios abaixo. Não presuma nada sobre o negócio de quem prospecta além do que os critérios dizem: se eles descreverem um público não-comercial, julgue por eles e não por um padrão B2B de vendas. Avalie o lead abaixo e retorne SOMENTE JSON válido com:
{"status": "aprovado"|"rejeitado", "score": number (0-100), "job_title": string|null, "seniority": "c-level"|"diretoria"|"gerencia"|"coordenacao"|"operacional"|"desconhecido", "area": "marketing"|"vendas"|"operacoes"|"growth"|"tecnologia"|"financeiro"|"rh"|"outro"|"desconhecido", "reason": string (1 frase em pt-BR explicando a decisão), "suggested_angle": string|null (1 frase em pt-BR sugerindo o ângulo de abordagem, conectando o comentário/tema do post com uma dor provável da empresa)}

Critérios de qualificação:
${rules}

Lead:
${JSON.stringify(payload)}`;
  return withLlmFallback(
    providers,
    (provider) => qualifyWithProvider(provider, prompt, deadlineAt),
    (provider, error) => console.warn(`Qualificação: provedor ${provider.label} falhou (${errorMessage(error)}), tentando reserva.`),
  );
}

// Recalcula "novos qualificados" dos posts afetados: conta leads aprovados que
// entraram por aquele post em ALGUM dos ICPs do job — a coluna tem que refletir o que
// aquela prospecção produziu, e uma prospecção pode ter rodado dois públicos.
//
// Conta LEADS distintos, não linhas de qualificação: aprovado nos dois ICPs é uma
// oportunidade só, e somar as linhas mostraria o dobro na tela.
async function refreshJobQualifiedCounts(client: ReturnType<typeof adminClient>, postIds: string[]) {
  for (const postId of postIds) {
    const { data: job } = await client.from('prospecting_jobs')
      .select('id, icp_id, icp_ids').eq('post_id', postId).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (!job) continue;
    const jobIcpIds: string[] = (Array.isArray(job.icp_ids) && job.icp_ids.length)
      ? job.icp_ids
      : (job.icp_id ? [job.icp_id] : []);
    let count: number | null = null;
    if (jobIcpIds.length) {
      // Paginado: o teto do PostgREST é 1.000 linhas e aqui são (leads aprovados ×
      // ICPs do job). Hoje o maior post tem 163, mas um post viral com dois ICPs
      // chega perto do teto — e um recount truncado mentiria pra menos em silêncio.
      const distintos = new Set<string>();
      const pageSize = 1000;
      let falhou = false;
      for (let from = 0; ; from += pageSize) {
        const { data: rows, error } = await client.from('lead_qualifications')
          .select('lead_id, lead:leads!inner(first_seen_post_id)')
          .in('icp_id', jobIcpIds)
          .in('status', ['qualified', 'review'])
          .eq('lead.first_seen_post_id', postId)
          .order('lead_id')
          .range(from, from + pageSize - 1);
        if (error) {
          console.warn(`Recount por ICP falhou no post ${postId}: ${errorMessage(error)}`);
          falhou = true;
          break;
        }
        const page = rows || [];
        for (const row of page) distintos.add((row as { lead_id: string }).lead_id);
        if (page.length < pageSize) break;
      }
      if (!falhou) count = distintos.size;
    }
    if (count == null) {
      // Job sem ICP (histórico) ou consulta com embed indisponível: cai no espelho.
      const { count: mirrored } = await client.from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('first_seen_post_id', postId)
        .in('qualification_status', ['qualified', 'review']);
      count = mirrored ?? 0;
    }
    await client.from('prospecting_jobs').update({ new_qualified: count }).eq('id', job.id);
  }
}

type IcpProfile = { id: string; name: string; icp_rules: string | null; hard_rules_enabled: boolean };

// Todos os ICPs cadastrados, indexados por id, + qual é o default. Um lote pode
// misturar ICPs (dois posts diferentes na fila), então carregamos todos de uma vez.
async function loadIcps(client: ReturnType<typeof adminClient>) {
  const { data, error } = await client.from('icp_profiles').select('id, name, icp_rules, is_default, hard_rules_enabled');
  if (error) throw error;
  const byId = new Map<string, IcpProfile>();
  let defaultId: string | null = null;
  for (const row of data || []) {
    byId.set(row.id, { id: row.id, name: row.name, icp_rules: row.icp_rules, hard_rules_enabled: row.hard_rules_enabled === true });
    if (row.is_default) defaultId = row.id;
  }
  return { byId, defaultId };
}

// Quais ICPs ainda esperam veredito de cada lead.
async function pendingIcpsByLead(client: ReturnType<typeof adminClient>, leadIds: string[]) {
  const map = new Map<string, string[]>();
  for (const batch of chunk(leadIds, 100)) {
    const { data, error } = await client.from('lead_qualifications')
      .select('lead_id, icp_id').eq('status', 'pending').in('lead_id', batch);
    if (error) throw error;
    for (const row of data || []) {
      const list = map.get(row.lead_id) || [];
      list.push(row.icp_id);
      map.set(row.lead_id, list);
    }
  }
  return map;
}

type QualificationResult = {
  status: string;
  qualified: boolean;
  score: number | null;
  reason: string | null;
  suggested_angle: string | null;
};

// Grava o veredito daquele ICP. Só isso — o espelho em `leads` (que v_lead_phones, o
// tally-sync e o export leem) é reescrito pelo trigger lead_qualifications_mirror,
// com o MELHOR veredito entre os ICPs.
//
// Espelhar aqui na mão era o bug de 27/08: escrevia o veredito do ICP recém-julgado
// por cima, então rodar um segundo ICP num lead já aprovado no primeiro o marcava
// como descartado — sumia da aba Aprovados e saía do cruzamento de telefone. Quem é
// aprovado em algum ICP é lead aprovado; qual ICP aprovou é o que as colunas por ICP
// da tela mostram.
async function persistQualification(
  client: ReturnType<typeof adminClient>,
  leadId: string,
  icpId: string,
  result: QualificationResult,
) {
  const { error: qualError } = await client.from('lead_qualifications').upsert({
    lead_id: leadId,
    icp_id: icpId,
    status: result.status,
    score: result.score,
    reason: result.reason,
    suggested_angle: result.suggested_angle,
    decided_by: 'llm',
    decided_at: new Date().toISOString(),
  }, { onConflict: 'lead_id,icp_id' });
  if (qualError) throw qualError;
}

// Fecha qualificações pendentes sem gastar LLM (pré-filtro, ou lead que não tem como
// ser julgado). Sem isso a fila de um ICP novo nunca zeraria.
async function resolvePendingQualifications(
  client: ReturnType<typeof adminClient>,
  leadIds: string[],
  patch: { status: string; score: number | null; reason: string; decided_by: string },
) {
  let touched = 0;
  for (const batch of chunk(leadIds.filter(Boolean), 100)) {
    const { data, error } = await client.from('lead_qualifications')
      .update({ ...patch, decided_at: new Date().toISOString() })
      .in('lead_id', batch).eq('status', 'pending').select('id');
    if (error) throw error;
    touched += (data || []).length;
  }
  return touched;
}

// Comentário mais recente de cada lead + hook do post: entram no payload do agente
// (motivo tipo "comentou em post sobre automação comercial" e ângulo de abordagem).
async function fetchCommentContext(client: ReturnType<typeof adminClient>, leadIds: string[]) {
  const commentByLead = new Map<string, { text: string | null; postId: string | null }>();
  const hookByPost = new Map<string, string>();
  if (!leadIds.length) return { commentByLead, hookByPost };
  const { data: comments } = await client.from('lead_comments')
    .select('lead_id, comment_text, post_id, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false });
  for (const comment of comments || []) {
    if (!commentByLead.has(comment.lead_id)) commentByLead.set(comment.lead_id, { text: comment.comment_text, postId: comment.post_id });
  }
  const postIds = [...new Set([...commentByLead.values()].map((c) => c.postId).filter(Boolean))] as string[];
  if (postIds.length) {
    const { data: posts } = await client.from('content_posts').select('id, hook').in('id', postIds);
    for (const post of posts || []) hookByPost.set(post.id, post.hook || '');
  }
  return { commentByLead, hookByPost };
}

// Payload do agente montado só com o que JÁ está no banco — é o que permite
// qualificar um lead antigo num ICP novo sem rodar actor nenhum. Mesmos campos da
// fila (A), pra o veredito não depender de qual caminho trouxe o lead.
function payloadFromStoredLead(
  lead: Record<string, any>,
  comment: { text: string | null; postId: string | null } | undefined,
  hookByPost: Map<string, string>,
) {
  const profile = (lead.profile_raw || {}) as Record<string, any>;
  const info = profile.basic_info || profile;
  const companyRaw = (lead.company_raw || {}) as Record<string, any>;
  const hasCompanyDetails = Object.keys(companyRaw).length > 0;
  return {
    name: lead.full_name,
    headline: lead.headline,
    current_title: lead.job_title,
    about: String(pick(info, ['about', 'summary']) || '').slice(0, 600) || null,
    currently_employed: Boolean(lead.company_name),
    company_name: lead.company_name,
    company_employee_count: lead.company_size,
    company_industry: hasCompanyDetails ? pick(companyRaw, ['industry', 'industries']) : null,
    company_description: hasCompanyDetails ? String(pick(companyRaw, ['description', 'tagline']) || '').slice(0, 400) || null : null,
    location: lead.location,
    comment_text: comment?.text ? String(comment.text).slice(0, 400) : null,
    post_theme: comment?.postId ? hookByPost.get(comment.postId) || null : null,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let runId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const expectedSecret = Deno.env.get('COLLECTOR_SHARED_SECRET');
    const hasSecret = Boolean(expectedSecret) && request.headers.get('x-collector-secret') === expectedSecret;
    if (!hasSecret && body?.manual !== true) throw new Error('Execução não autorizada');

    const token = Deno.env.get('APIFY_TOKEN');
    if (!token) throw new Error('APIFY_TOKEN é obrigatório');
    // Default trocado de apimaestro para harvestapi em 17/08/2026: o apimaestro
    // devolvia 0 perfis na conta Apify de fallback (provável actor sem aluguel no
    // plano trial), enquanto o harvestapi roda nas duas contas. Overridável por body
    // (teste) ou env (voltar ao apimaestro na conta principal, se quiser).
    const profileActorId = body?.profileActorId || Deno.env.get('APIFY_LINKEDIN_PROFILE_ACTOR_ID') || 'harvestapi/linkedin-profile-scraper';
    const companyActorId = Deno.env.get('APIFY_LINKEDIN_COMPANY_ACTOR_ID') || 'harvestapi/linkedin-company';

    // Provedor de enriquecimento. Bright Data entra como alternativa quando a Apify
    // não roda os scrapers de perfil (conta trial). Selecionável por body (teste) ou
    // env; default apify pra não mudar o comportamento existente sem intenção.
    const provider = body?.provider || Deno.env.get('ENRICH_PROVIDER') || 'apify';
    const bdKey = Deno.env.get('BRIGHTDATA_API_KEY') || null;
    const bdProfileDataset = body?.bdProfileDataset || Deno.env.get('BRIGHTDATA_PROFILE_DATASET') || BD_PROFILE_DATASET;
    const bdCompanyDataset = body?.bdCompanyDataset || Deno.env.get('BRIGHTDATA_COMPANY_DATASET') || BD_COMPANY_DATASET;
    const bdCompany = provider === 'brightdata' && bdKey ? { apiKey: bdKey, datasetId: bdCompanyDataset } : null;
    // debugRaw devolve a primeira linha crua do Bright Data na resposta HTTP, pra
    // conferir o schema real num único deploy sem chutar nomes de campo.
    const debugRaw = body?.debugRaw === true;
    let bdProfileSample: Record<string, any> | null = null;

    const client = adminClient();
    const deadlineAt = collectorDeadline();
    const companyOnly = body?.companyOnly === true;
    const limit = Math.max(1, Math.min(50, Number(body.limit || 10)));
    const leadIds = Array.isArray(body.leadIds)
      ? body.leadIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 5000)
      : null;
    if (companyOnly && !leadIds?.length) throw new Error('O backfill companyOnly exige leadIds explícitos');
    const runSource = companyOnly ? 'prospect_company_backfill' : 'prospect_enrich';

    // Trava de concorrência: duas análises em paralelo brigam pelo rate limit do
    // LLM/actors e podem morrer por timeout. O backfill de empresa também entra
    // nessa trava para não disputar o mesmo actor com a fila normal.
    const { data: activeRuns } = await client.from('collection_runs')
      .select('id')
      .in('source', ['prospect_enrich', 'prospect_company_backfill'])
      .eq('status', 'running')
      .gte('started_at', new Date(Date.now() - 8 * 60000).toISOString())
      .limit(1);
    if (activeRuns?.length) {
      return json({ success: false, busy: true, error: 'Já existe uma análise em andamento. Aguarde ela terminar (ou até 8 minutos, se tiver travado).' });
    }

    runId = await startRun(client, runSource);

    // Backfill cirúrgico: usa profile_raw/company_url já salvos, consulta apenas
    // o actor de empresas e não refaz profile nem qualificação por IA.
    if (companyOnly) {
      const { data: backfillRows, error: backfillError } = await client.from('leads')
        .select('id, full_name, company_name, company_url, company_size, profile_raw')
        .in('id', leadIds!)
        .is('company_size', null)
        .limit(limit);
      if (backfillError) throw backfillError;
      const rows = backfillRows || [];
      const companyByLead = new Map<string, CompanyRef>();
      for (const lead of rows) {
        companyByLead.set(lead.id, companyRefFromProfile(lead.profile_raw || {}, {
          name: lead.company_name || null,
          url: lead.company_url || null,
        }));
      }
      const refs = [...companyByLead.values()].filter((company) => company.url || company.name);
      const companyFetch = refs.length
        ? await fetchCompanyRecords(companyActorId, token, refs, deadlineAt, bdCompany)
        : { index: new Map<string, Record<string, any>>(), records: [], actorRuns: 0, errors: [] };
      let updated = 0;
      const missing: Array<{ id: string; name: string | null; company: string | null }> = [];
      const updateErrors: Array<{ id: string; error: string }> = [];
      for (const lead of rows) {
        const company = companyByLead.get(lead.id) || { name: null, url: null };
        const details = findCompany(companyFetch.index, company);
        const employeeCount = companyEmployeeCount(details);
        if (!details || !employeeCount) {
          missing.push({ id: lead.id, name: lead.full_name, company: company.name });
          continue;
        }
        const { error: updateError } = await client.from('leads').update({
          company_name: company.name || pick(details, ['name', 'companyName', 'company_name']),
          company_url: company.url || pick(details, ['linkedinUrl', 'linkedin_url', 'companyUrl', 'url']),
          company_size: employeeCount,
          company_raw: details,
          enrichment_error: null,
        }).eq('id', lead.id);
        if (updateError) updateErrors.push({ id: lead.id, error: errorMessage(updateError) });
        else updated += 1;
      }
      const status = updateErrors.length ? (updated ? 'partial' : 'failed') : 'success';
      await finishRun(client, runId, {
        status,
        items_processed: rows.length,
        error_message: updateErrors.length ? `${updateErrors.length} atualização(ões) falharam` : null,
        raw: { companyOnly: true, updated, missing: missing.length, actorRuns: companyFetch.actorRuns, actorErrors: companyFetch.errors, updateErrors },
      });
      return json({
        success: status !== 'failed',
        runId,
        status,
        processed: rows.length,
        updated,
        missing,
        actorRuns: companyFetch.actorRuns,
        actorErrors: companyFetch.errors,
        errors: updateErrors,
      }, status === 'failed' ? 500 : 200);
    }

    // Um ICP por prospecção: os critérios saem do ICP que cada qualificação
    // pendente aponta (icp_profiles), não mais de um texto único global.
    const { byId: icpById, defaultId: defaultIcpId } = await loadIcps(client);

    // Qualificação pendente de lead que não tem como ser julgado: resolve sem gastar
    // LLM, senão o "restam N" da tela nunca zera. 'skipped' é o pré-filtro júnior;
    // 'error' é enriquecimento que falhou e não deixou dado de perfil pra julgar.
    const UNQUALIFIABLE: Array<[string, { status: string; score: number | null; reason: string; decided_by: string }]> = [
      ['skipped', { status: 'disqualified', score: 5, reason: 'Cargo júnior/estudante identificado no headline (pré-filtro, sem scrape)', decided_by: 'prefilter' }],
      ['error', { status: 'disqualified', score: null, reason: 'Enriquecimento do perfil falhou — sem dados para julgar neste ICP (ver enrichment_error do lead)', decided_by: 'enrichment_error' }],
    ];
    let autoResolved = 0;
    for (const [enrichmentStatus, patch] of UNQUALIFIABLE) {
      const { data: blocked, error: blockedError } = await client.from('lead_qualifications')
        .select('lead_id, lead:leads!inner(enrichment_status)')
        .eq('status', 'pending').eq('lead.enrichment_status', enrichmentStatus).limit(500);
      if (blockedError) {
        console.warn(`Não foi possível resolver qualificações de leads '${enrichmentStatus}': ${errorMessage(blockedError)}`);
        continue;
      }
      autoResolved += await resolvePendingQualifications(client, (blocked || []).map((row: any) => row.lead_id), patch);
    }

    // Escopo opcional: quando o front filtra por um post, manda os leadIds daquele
    // post e a análise processa (e conta o "remaining") só esse subconjunto. Sem
    // leadIds, roda a fila inteira como antes.
    let pendingQuery = client.from('leads')
      .select('id, public_identifier, profile_url, full_name, headline, first_seen_post_id')
      .eq('enrichment_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (leadIds) pendingQuery = pendingQuery.in('id', leadIds);
    const { data: pending, error: pendingError } = await pendingQuery;
    if (pendingError) throw pendingError;
    const leads = pending || [];

    // (1) Pré-filtro barato pelo headline que veio do scrape de comentários.
    // O veredito escrito direto em `leads` aqui é só rede de segurança para lead
    // legado sem nenhuma linha em lead_qualifications: o resolvePendingQualifications
    // logo abaixo dispara o trigger do espelho, que sobrescreve isto com o melhor
    // veredito entre os ICPs sempre que existir qualificação de verdade.
    const junior = leads.filter((lead) => isObviouslyJunior(lead.headline));
    for (const lead of junior) {
      await client.from('leads').update({
        enrichment_status: 'skipped',
        qualification_status: 'disqualified',
        qualification_reason: 'Cargo júnior/estudante identificado no headline (pré-filtro, sem scrape)',
        score: 5,
      }).eq('id', lead.id);
    }
    if (junior.length) {
      await resolvePendingQualifications(client, junior.map((lead) => lead.id), {
        status: 'disqualified',
        score: 5,
        reason: 'Cargo júnior/estudante identificado no headline (pré-filtro, sem scrape)',
        decided_by: 'prefilter',
      });
    }
    const toEnrich = leads.filter((lead) => !junior.includes(lead) && lead.public_identifier);
    const noIdentifier = leads.filter((lead) => !junior.includes(lead) && !lead.public_identifier);
    for (const lead of noIdentifier) {
      await client.from('leads').update({ enrichment_status: 'error', enrichment_error: 'Lead sem public_identifier — impossível raspar profile' }).eq('id', lead.id);
    }
    if (noIdentifier.length) {
      await resolvePendingQualifications(client, noIdentifier.map((lead) => lead.id), {
        status: 'disqualified',
        score: null,
        reason: 'Lead sem public_identifier — impossível raspar o perfil para julgar',
        decided_by: 'enrichment_error',
      });
    }

    // Quais ICPs esperam cada um destes leads. Um lead pode estar em mais de um.
    const pendingIcps = await pendingIcpsByLead(client, toEnrich.map((lead) => lead.id));

    // O comentário e o tema do post entram no payload do agente (escopo: motivo tipo
    // "comentou em post sobre automação comercial" e ângulo de abordagem contextual).
    const { commentByLead, hookByPost } = await fetchCommentContext(client, toEnrich.map((lead) => lead.id));

    // (2) Profile em lote (um run só, mesmo actor dos seguidores do collect-linkedin).
    const profileByIdentifier = new Map<string, Record<string, any>>();
    if (toEnrich.length) {
      const usernames = toEnrich.map((lead) => lead.public_identifier);
      let profiles: any[];
      if (provider === 'brightdata') {
        if (!bdKey) throw new Error('BRIGHTDATA_API_KEY é obrigatório para o provedor brightdata');
        const urls = usernames.map((u) => `https://www.linkedin.com/in/${u}`);
        const rawProfiles = await bdScrape(bdProfileDataset, urls, bdKey, deadlineAt);
        bdProfileSample = rawProfiles[0] || null;
        profiles = rawProfiles.map(bdProfileToCanonical);
      } else {
        // Entrada difere por actor. harvestapi: publicIdentifiers + profileScraperMode
        // (o valor do modo inclui o preço, é o enum literal do actor). apimaestro:
        // usernames + includeEmail.
        const profileInput = profileActorId.includes('harvestapi')
          ? { publicIdentifiers: usernames, profileScraperMode: 'Profile details no email ($4 per 1k)' }
          : { usernames, includeEmail: false };
        profiles = await runActor(profileActorId, token, profileInput, deadlineAt);
      }
      for (const profile of Array.isArray(profiles) ? profiles : []) {
        const info = profile?.basic_info || profile;
        const identifier = String(info?.public_identifier || info?.publicIdentifier || '').toLowerCase();
        if (identifier) profileByIdentifier.set(identifier, profile);
      }
    }

    // (3) Company em lotes pequenos. URL e nome usam campos de input distintos no
    // actor atual; o resultado é indexado por id/URL/nome e nomes sem match ganham
    // uma tentativa de fallback. Uma falha total não pode mais virar falso sucesso.
    // (2.5) CORTE PELO CARGO, antes de comprar a empresa. O perfil já disse o cargo
    // real; se ele reprova na regra dura de TODOS os ICPs que esperam este lead, o
    // porte da empresa não pode salvá-lo — então nem a empresa nem o LLM são pagos.
    // Um ICP com a regra dura desligada nunca entra aqui: lá quem decide é o texto de
    // critérios, e o modelo pode muito bem aprovar um analista.
    const reprovadosPeloCargo = new Map<string, string[]>();
    for (const lead of toEnrich) {
      const profile = profileByIdentifier.get(String(lead.public_identifier).toLowerCase());
      if (!profile) continue;
      const experience = currentExperience(profile);
      const tituloReal = pick(experience || {}, ['title', 'position', 'job_title']) || lead.headline;
      if (!cargoJaReprova(tituloReal ? String(tituloReal) : null, lead.headline)) continue;
      const icpsDoLead = [...(pendingIcps.get(lead.id) || [])];
      const alvo = icpsDoLead.length ? icpsDoLead : (defaultIcpId ? [defaultIcpId] : []);
      if (!alvo.length) continue;
      if (!alvo.every((icpId) => icpById.get(icpId)?.hard_rules_enabled)) continue;
      reprovadosPeloCargo.set(lead.id, alvo);
    }

    const leadCompany = new Map<string, { name: string | null; url: string | null }>();
    for (const lead of toEnrich) {
      const profile = profileByIdentifier.get(String(lead.public_identifier).toLowerCase());
      if (!profile) continue;
      // Empresa só de quem ainda pode ser aprovado.
      if (reprovadosPeloCargo.has(lead.id)) continue;
      leadCompany.set(lead.id, companyRefFromProfile(profile));
    }
    const companyRefs = [...leadCompany.values()].filter((company) => company.url || company.name);
    const companyFetch = companyRefs.length
      ? await fetchCompanyRecords(companyActorId, token, companyRefs, deadlineAt, bdCompany)
      : { index: new Map<string, Record<string, any>>(), records: [], actorRuns: 0, errors: [] };

    // (4) Qualificação lead a lead com payload enxuto.
    let processed = 0;
    let qualified = 0;
    let llmCalls = 0;
    // Quantos leads foram fechados só pelo cargo: economia de 1 raspagem de empresa
    // + 1 chamada de LLM por ICP em cada um.
    let cortadosPeloCargo = 0;
    let rateLimited = false;
    let lastRateLimitError: string | null = null;
    // Metadados de ritmo pro front montar a estimativa/espera (Task 2 do plano
    // safe-lead-analysis-queue): o Gemini free não manda Retry-After utilizável,
    // então usamos uma janela conservadora fixa em vez de tentar parsear o header.
    const providers = requireClassificationProviders();
    const hasPrincipal = providers.some((p) => p.label === 'principal');
    let retryAfterSeconds = GEMINI_RETRY_AFTER_SECONDS;
    const secondsPerLeadEstimate = hasPrincipal ? 3 : GEMINI_ESTIMATED_SECONDS_PER_LEAD;
    const recommendedBatchSize = hasPrincipal ? 15 : GEMINI_SAFE_BATCH_SIZE;
    const errors: Array<{ lead: string; error: string }> = [];
    const affectedPosts = new Set<string>();
    for (const lead of toEnrich) {
      // Orçamento de parede: se falta pouco tempo, deixa o resto pendente pro
      // próximo lote em vez de ser morto pelo runtime sem finalizar o run
      // (era isso que deixava execuções "running" pra sempre).
      if (remainingMs(deadlineAt) < 50000) break;
      try {
        const profile = profileByIdentifier.get(String(lead.public_identifier).toLowerCase());
        if (!profile) throw new Error('Profile não retornou do actor');
        const info = profile?.basic_info || profile;
        const experience = currentExperience(profile);
        const company = leadCompany.get(lead.id) || { name: null, url: null };
        const companyDetails = findCompany(companyFetch.index, company);
        const employeeCount = companyEmployeeCount(companyDetails);
        const currentlyEmployed = Boolean(experience && company.name);

        const leadComment = commentByLead.get(lead.id);
        const payload = {
          name: lead.full_name || pick(info, ['fullname', 'full_name', 'name']),
          headline: pick(info, ['headline']) || lead.headline,
          current_title: pick(experience || {}, ['title', 'position', 'job_title']),
          about: String(pick(info, ['about', 'summary']) || '').slice(0, 600) || null,
          currently_employed: currentlyEmployed,
          company_name: currentlyEmployed ? company.name : null,
          company_employee_count: currentlyEmployed ? employeeCount : null,
          company_industry: companyDetails ? pick(companyDetails, ['industry', 'industries']) : null,
          company_description: companyDetails ? String(pick(companyDetails, ['description', 'tagline']) || '').slice(0, 400) || null : null,
          location: pick(info, ['location', 'location.full', 'geo_location']),
          comment_text: leadComment?.text ? String(leadComment.text).slice(0, 400) : null,
          post_theme: leadComment?.postId ? hookByPost.get(leadComment.postId) || null : null,
        };

        // O enriquecimento é gravado ANTES de qualificar: se o LLM bater no rate
        // limit no meio, o que falta é só LLM e a fila (B) termina depois — reverter
        // pra 'pending' aqui era o que fazia o lead ser raspado (e pago) duas vezes.
        const { error: updateError } = await client.from('leads').update({
          full_name: payload.name || lead.full_name,
          headline: payload.headline || lead.headline,
          job_title: payload.current_title,
          company_name: payload.company_name,
          company_url: currentlyEmployed ? company.url : null,
          company_size: payload.company_employee_count,
          location: payload.location ? String(payload.location).slice(0, 200) : null,
          enrichment_status: 'enriched',
          enrichment_error: currentlyEmployed && !employeeCount ? 'Empresa não retornou porte no enriquecimento' : null,
          profile_raw: profile,
          company_raw: companyDetails || {},
        }).eq('id', lead.id);
        if (updateError) throw updateError;

        // Cargo já reprovado pela regra dura de todos os ICPs deste lead: grava o
        // veredito direto e pula o LLM. Chamar o modelo aqui seria pagar por uma
        // resposta que o cron da regra dura sobrescreveria em até 10 minutos.
        const alvosReprovados = reprovadosPeloCargo.get(lead.id);
        if (alvosReprovados) {
          for (const icpId of alvosReprovados) {
            await persistQualification(client, lead.id, icpId, {
              status: 'disqualified',
              qualified: false,
              score: 15,
              reason: `Cargo operacional sem marcador de liderança ("${payload.current_title || payload.headline || 'sem cargo'}") — rejeitado pela regra dura deste ICP, sem gastar IA nem raspagem de empresa.`,
              suggested_angle: null,
            });
          }
          const { error: cargoError } = await client.from('leads')
            .update({ job_title: payload.current_title, seniority: 'operacional' }).eq('id', lead.id);
          if (cargoError) throw cargoError;
          cortadosPeloCargo += 1;
          processed += 1;
          if (lead.first_seen_post_id) affectedPosts.add(lead.first_seen_post_id);
          continue;
        }

        // Uma chamada de LLM por ICP que espera este lead: o mesmo comentarista pode
        // estar na fila do ICP comercial e na do Second Brain, com critérios
        // diferentes e — de propósito — vereditos diferentes.
        const targets = [...(pendingIcps.get(lead.id) || [])];
        if (!targets.length && defaultIcpId) targets.push(defaultIcpId);
        if (!targets.length) throw new Error('Nenhum ICP cadastrado para qualificar o lead');
        let attributes: { job_title: string | null; seniority: string | null; area: string | null } | null = null;
        for (const icpId of targets) {
          // Espaça as chamadas pro LLM se estiver usando o Gemini/fallback (free tier: ~10 req/min).
          if (llmCalls > 0 && !hasPrincipal) await wait(6500);
          llmCalls += 1;
          const result = await qualifyLead(payload, deadlineAt, icpById.get(icpId)?.icp_rules || null);
          await persistQualification(client, lead.id, icpId, result);
          // Cargo/área/senioridade normalizados pelo agente são atributos do LEAD,
          // não do ICP: a última leitura serve pra todas as listas (e é o que a
          // regra dura em SQL lê).
          attributes = { job_title: result.job_title || payload.current_title, seniority: result.seniority, area: result.area };
          if (result.qualified) qualified += 1;
        }
        if (attributes) {
          const { error: attributesError } = await client.from('leads').update(attributes).eq('id', lead.id);
          if (attributesError) throw attributesError;
        }
        processed += 1;
        if (lead.first_seen_post_id) affectedPosts.add(lead.first_seen_post_id);
      } catch (leadError) {
        const message = errorMessage(leadError);
        console.error(`Erro na qualificação do lead ${lead.id}:`, leadError);
        // Rate limit do LLM não é culpa do lead: volta pra fila (pending) e encerra
        // o lote — o próximo lote tenta de novo quando a janela de rate limit virar.
        if (leadError instanceof RateLimitError || /\b429\b|\b50[03]\b|RESOURCE_EXHAUSTED|quota|rate|overloaded|unavailable/i.test(message)) {
          rateLimited = true;
          lastRateLimitError = message;
          retryAfterSeconds = leadError instanceof RateLimitError ? leadError.retryAfterSeconds : GEMINI_RETRY_AFTER_SECONDS;
          // Não volta pro 'pending' de enriquecimento: o profile/company já está
          // gravado e as qualificações que faltam são só LLM — a fila (B) retoma no
          // próximo lote sem pagar scrape de novo.
          break;
        }
        errors.push({ lead: lead.public_identifier || lead.id, error: message });
        await client.from('leads').update({ enrichment_status: 'error', enrichment_error: message }).eq('id', lead.id);
      }
    }

    // Posts dos leads pré-filtrados também precisam do recount.
    for (const lead of junior) if (lead.first_seen_post_id) affectedPosts.add(lead.first_seen_post_id);

    // (5) Fila só-qualificação: lead JÁ enriquecido esperando o veredito de um ICP
    // novo — quem já estava no banco quando o post foi prospectado com outro ICP.
    // Nenhum actor roda aqui: o payload sai de profile_raw/company_raw. É o que faz
    // "aprovado diferente por ICP" valer também pro público que repete comentário.
    let requalified = 0;
    const requalifyErrors: Array<{ lead: string; error: string }> = [];
    if (!rateLimited && remainingMs(deadlineAt) > 50000) {
      let pendingQualQuery = client.from('lead_qualifications')
        .select('lead_id, icp_id, lead:leads!inner(id, full_name, headline, job_title, company_name, company_size, location, enrichment_status, first_seen_post_id, profile_raw, company_raw)')
        .eq('status', 'pending')
        .eq('lead.enrichment_status', 'enriched')
        .order('created_at', { ascending: true })
        .limit(limit);
      if (leadIds) pendingQualQuery = pendingQualQuery.in('lead_id', leadIds);
      const { data: pendingQuals, error: pendingQualError } = await pendingQualQuery;
      if (pendingQualError) console.warn(`Fila de requalificação indisponível: ${errorMessage(pendingQualError)}`);
      const requalifyRows = (pendingQuals || []) as any[];
      const requalifyContext = await fetchCommentContext(client, [...new Set(requalifyRows.map((row) => row.lead_id))]);
      for (const row of requalifyRows) {
        if (remainingMs(deadlineAt) < 50000) break;
        const storedLead = row.lead;
        if (!storedLead) continue;
        try {
          if (llmCalls > 0 && !hasPrincipal) await wait(6500);
          llmCalls += 1;
          const payload = payloadFromStoredLead(storedLead, requalifyContext.commentByLead.get(row.lead_id), requalifyContext.hookByPost);
          const result = await qualifyLead(payload, deadlineAt, icpById.get(row.icp_id)?.icp_rules || null);
          await persistQualification(client, row.lead_id, row.icp_id, result);
          requalified += 1;
          if (result.qualified) qualified += 1;
          if (storedLead.first_seen_post_id) affectedPosts.add(storedLead.first_seen_post_id);
        } catch (qualError) {
          const message = errorMessage(qualError);
          console.error(`Erro na requalificação do lead ${row.lead_id}:`, qualError);
          if (qualError instanceof RateLimitError || /\b429\b|\b50[03]\b|RESOURCE_EXHAUSTED|quota|rate|overloaded|unavailable/i.test(message)) {
            rateLimited = true;
            lastRateLimitError = message;
            retryAfterSeconds = qualError instanceof RateLimitError ? qualError.retryAfterSeconds : GEMINI_RETRY_AFTER_SECONDS;
            // A linha continua 'pending': o próximo lote pega de onde parou.
            break;
          }
          requalifyErrors.push({ lead: row.lead_id, error: message });
        }
      }
    }

    await refreshJobQualifiedCounts(client, [...affectedPosts]);

    // "Restam N" agora conta VEREDITOS a produzir (cada linha pendente de
    // lead_qualifications é uma chamada de LLM), não leads: o mesmo lead pode faltar
    // em dois ICPs. O max com a fila de enriquecimento é rede de segurança — se
    // algum lead ficar sem linha de qualificação, a fila não parece vazia à toa.
    let pendingQualQueueQuery = client.from('lead_qualifications')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (leadIds) pendingQualQueueQuery = pendingQualQueueQuery.in('lead_id', leadIds);
    const { count: pendingQualCount } = await pendingQualQueueQuery;
    let remainingQuery = client.from('leads')
      .select('id', { count: 'exact', head: true }).eq('enrichment_status', 'pending');
    if (leadIds) remainingQuery = remainingQuery.in('id', leadIds);
    const { count: pendingEnrichCount } = await remainingQuery;
    const remainingCount = Math.max(pendingQualCount ?? 0, pendingEnrichCount ?? 0);

    const allErrors = [...errors, ...requalifyErrors];
    const status = allErrors.length ? (processed + requalified ? 'partial' : 'failed') : 'success';
    await finishRun(client, runId, {
      status,
      items_processed: processed + junior.length + requalified,
      error_message: allErrors.length ? `${allErrors.length} lead(s) falharam` : null,
      raw: {
        errors: allErrors,
        prefiltered: junior.length,
      cortadosPeloCargo,
        cortadosPeloCargo,
        qualified,
        requalified,
        autoResolved,
        companyRecords: companyFetch.records.length,
        companyActorRuns: companyFetch.actorRuns,
        companyActorErrors: companyFetch.errors,
      },
    });
    return json({
      success: status !== 'failed' || rateLimited,
      runId,
      status,
      processed,
      prefiltered: junior.length,
      qualified,
      requalified,
      autoResolved,
      rateLimited,
      rateLimitErrorReason: lastRateLimitError,
      retryAfterSeconds: rateLimited ? retryAfterSeconds : GEMINI_RETRY_AFTER_SECONDS,
      recommendedBatchSize,
      estimatedSecondsPerLead: secondsPerLeadEstimate,
      companyRecords: companyFetch.records.length,
      companyActorRuns: companyFetch.actorRuns,
      companyActorErrors: companyFetch.errors,
      errors: allErrors,
      remaining: remainingCount,
      ...(debugRaw ? { bdProfileSample, bdCompanySample: companyFetch.records[0] || null } : {}),
    });
  } catch (error) {
    const message = errorMessage(error);
    if (runId) await finishRun(adminClient(), runId, { status: 'failed', error_message: message });
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
