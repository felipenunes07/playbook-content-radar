import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { collectorDeadline, remainingMs, runActor } from '../_shared/apify.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, finishRun, json, startRun } from '../_shared/server.ts';

// Fase 2 da prospecção: pega leads com enrichment_status='pending', enriquece com
// profile (apimaestro, em lote) + company (harvestapi, em lote) e passa um payload
// ENXUTO pro agente de qualificação (LLM). Regras do Victor: só cargo alto (C-level/
// diretoria/gerência), áreas comerciais (marketing/vendas/operações), empresa 200+
// colaboradores. Desempregado NUNCA qualifica pela empresa antiga.
// Processa em lotes pequenos e pode ser re-invocado até zerar a fila (o front chama
// em loop; um cron futuro pode fazer o mesmo).
// Ver docs/superpowers/plans/2026-07-04-warm-prospecting-from-commenters.md

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
  const experiences = profile?.experience || profile?.experiences || profile?.work_experience || [];
  if (!Array.isArray(experiences)) return null;
  return experiences.find((e: Record<string, any>) =>
    e?.is_current === true || e?.isCurrent === true
    || String(pick(e, ['end_date', 'endDate', 'date_range.end', 'duration.end']) ?? '').trim() === ''
    || /present|atual|hoje/i.test(String(pick(e, ['end_date', 'endDate', 'duration']) || ''))) || null;
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

async function qualifyLead(payload: Record<string, unknown>, deadlineAt: number, rulesOverride?: string | null) {
  const url = Deno.env.get('CLASSIFICATION_API_URL') || 'https://api.openai.com/v1/chat/completions';
  const apiKey = Deno.env.get('CLASSIFICATION_API_KEY');
  const model = Deno.env.get('CLASSIFICATION_MODEL');
  if (!apiKey || !model) throw new Error('CLASSIFICATION_API_KEY e CLASSIFICATION_MODEL são obrigatórios');
  const minHeadcount = Number(Deno.env.get('PROSPECT_MIN_HEADCOUNT') || 200);
  // Critérios editáveis sem deploy: prospect_settings.icp_rules (editável na UI,
  // botão "Ver/editar ICP") > secret PROSPECT_ICP_RULES > default do escopo formal
  // de 2026-07-05 + ICP da Playbook (Victor: "se vier pouca gente a gente baixa;
  // se vier muito lixo, aperta").
  const rules = rulesOverride || Deno.env.get('PROSPECT_ICP_RULES') || `1. Cargo alto (aprova): founder, sócio, CEO, C-level, diretor, Head, gerente, liderança comercial/marketing/operações, Growth, RevOps, gerente de inovação. Rejeita: estagiário, estudante, analista júnior, SDR/vendedor baixo na hierarquia, assistente.
2. Área (aprova): marketing, vendas/comercial, operações, growth, receita/RevOps, tecnologia/produto, dono do negócio. Rejeita: financeiro, jurídico, RH. Rejeita também quem parece só querer aprender automação, autônomos/freelancers, negócios B2C locais sem time de vendas.
3. Empresa atual com ${minHeadcount}+ colaboradores. Se employee_count vier null mas a empresa parecer claramente grande (banco, multinacional conhecida), pode aprovar citando isso no motivo.
4. IMPORTANTE: se "currently_employed" for false, o lead está sem emprego atual — NUNCA aprove pela empresa antiga; status "rejeitado" com motivo explicando.
5. Casos limítrofes (cargo alto mas empresa sem headcount conhecido, porte um pouco abaixo do corte com contexto forte): APROVE e deixe a incerteza explícita no motivo — quem decide se prospecta é o Victor, na revisão manual da lista.
Score 0-100 (fit geral de cargo + área + porte + contexto do comentário): fit cravado fica 80+, aprovado com ressalva 50-79, rejeitado abaixo de 50.`;
  const prompt = `Você qualifica leads B2B para a Playbook Lab (consultoria de IA para vendas). Avalie o lead abaixo e retorne SOMENTE JSON válido com:
{"status": "aprovado"|"rejeitado", "score": number (0-100), "job_title": string|null, "seniority": "c-level"|"diretoria"|"gerencia"|"coordenacao"|"operacional"|"desconhecido", "area": "marketing"|"vendas"|"operacoes"|"growth"|"tecnologia"|"financeiro"|"rh"|"outro"|"desconhecido", "reason": string (1 frase em pt-BR explicando a decisão), "suggested_angle": string|null (1 frase em pt-BR sugerindo o ângulo de abordagem, conectando o comentário/tema do post com uma dor provável da empresa)}

Critérios de qualificação:
${rules}

Lead:
${JSON.stringify(payload)}`;
  const response = await llmFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
  }, deadlineAt);
  const body = await response.json();
  if (response.status === 429) {
    throw new RateLimitError(body?.error?.message || 'Classification API 429', retryAfterSecondsFromBody(body));
  }
  if (!response.ok) throw new Error(`${body?.error?.message || 'Classification API'} (${response.status})`);
  const content = body.choices?.[0]?.message?.content || body.output_text;
  if (!content) throw new Error('Modelo não retornou conteúdo');
  const parsed = JSON.parse(String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
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

// Recalcula "novos qualificados" dos posts afetados: conta leads qualificados que
// entraram por aquele post e grava no job mais recente do post.
async function refreshJobQualifiedCounts(client: ReturnType<typeof adminClient>, postIds: string[]) {
  for (const postId of postIds) {
    const { count } = await client.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('first_seen_post_id', postId)
      .in('qualification_status', ['qualified', 'review']);
    const { data: job } = await client.from('prospecting_jobs')
      .select('id').eq('post_id', postId).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (job) await client.from('prospecting_jobs').update({ new_qualified: count ?? 0 }).eq('id', job.id);
  }
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
    const profileActorId = Deno.env.get('APIFY_LINKEDIN_PROFILE_ACTOR_ID') || 'apimaestro/linkedin-profile-batch-scraper-no-cookies-required';
    const companyActorId = Deno.env.get('APIFY_LINKEDIN_COMPANY_ACTOR_ID') || 'harvestapi/linkedin-company';

    const client = adminClient();
    const deadlineAt = collectorDeadline();

    // Trava de concorrência: duas análises em paralelo brigam pelo rate limit do
    // LLM (10 req/min no Gemini free) e as duas morrem por timeout — foi a causa
    // dos runs zumbis de 05/07. Se já tem uma rodando há menos de 8 min, recusa.
    const { data: activeRuns } = await client.from('collection_runs')
      .select('id')
      .eq('source', 'prospect_enrich')
      .eq('status', 'running')
      .gte('started_at', new Date(Date.now() - 8 * 60000).toISOString())
      .limit(1);
    if (activeRuns?.length) {
      return json({ success: false, busy: true, error: 'Já existe uma análise em andamento. Aguarde ela terminar (ou até 8 minutos, se tiver travado).' });
    }

    runId = await startRun(client, 'prospect_enrich');

    // Critérios do ICP editáveis pela UI (tabela singleton prospect_settings).
    const { data: settings } = await client.from('prospect_settings').select('icp_rules').eq('id', true).maybeSingle();
    const icpRules = settings?.icp_rules || null;

    const limit = Math.max(1, Math.min(20, Number(body.limit || 10)));
    const { data: pending, error: pendingError } = await client.from('leads')
      .select('id, public_identifier, profile_url, full_name, headline, first_seen_post_id')
      .eq('enrichment_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (pendingError) throw pendingError;
    const leads = pending || [];

    // (1) Pré-filtro barato pelo headline que veio do scrape de comentários.
    const junior = leads.filter((lead) => isObviouslyJunior(lead.headline));
    for (const lead of junior) {
      await client.from('leads').update({
        enrichment_status: 'skipped',
        qualification_status: 'disqualified',
        qualification_reason: 'Cargo júnior/estudante identificado no headline (pré-filtro, sem scrape)',
        score: 5,
      }).eq('id', lead.id);
    }
    const toEnrich = leads.filter((lead) => !junior.includes(lead) && lead.public_identifier);
    const noIdentifier = leads.filter((lead) => !junior.includes(lead) && !lead.public_identifier);
    for (const lead of noIdentifier) {
      await client.from('leads').update({ enrichment_status: 'error', enrichment_error: 'Lead sem public_identifier — impossível raspar profile' }).eq('id', lead.id);
    }

    // O comentário e o tema do post entram no payload do agente (escopo: motivo tipo
    // "comentou em post sobre automação comercial" e ângulo de abordagem contextual).
    const commentByLead = new Map<string, { text: string | null; postId: string | null }>();
    const hookByPost = new Map<string, string>();
    if (toEnrich.length) {
      const { data: comments } = await client.from('lead_comments')
        .select('lead_id, comment_text, post_id, created_at')
        .in('lead_id', toEnrich.map((lead) => lead.id))
        .order('created_at', { ascending: false });
      for (const comment of comments || []) {
        if (!commentByLead.has(comment.lead_id)) commentByLead.set(comment.lead_id, { text: comment.comment_text, postId: comment.post_id });
      }
      const postIds = [...new Set([...commentByLead.values()].map((c) => c.postId).filter(Boolean))] as string[];
      if (postIds.length) {
        const { data: posts } = await client.from('content_posts').select('id, hook').in('id', postIds);
        for (const post of posts || []) hookByPost.set(post.id, post.hook || '');
      }
    }

    // (2) Profile em lote (um run só, mesmo actor dos seguidores do collect-linkedin).
    const profileByIdentifier = new Map<string, Record<string, any>>();
    if (toEnrich.length) {
      const usernames = toEnrich.map((lead) => lead.public_identifier);
      const profiles = await runActor(profileActorId, token, { usernames, includeEmail: false }, deadlineAt);
      for (const profile of Array.isArray(profiles) ? profiles : []) {
        const info = profile?.basic_info || profile;
        const identifier = String(info?.public_identifier || info?.publicIdentifier || '').toLowerCase();
        if (identifier) profileByIdentifier.set(identifier, profile);
      }
    }

    // (3) Company em lote, best-effort: junta as empresas atuais distintas e roda um
    // run só. Falha aqui não derruba o lote — o agente decide sem o headcount.
    const companyByKey = new Map<string, Record<string, any>>();
    const companyKeys = new Set<string>();
    const leadCompany = new Map<string, { name: string | null; url: string | null }>();
    for (const lead of toEnrich) {
      const profile = profileByIdentifier.get(String(lead.public_identifier).toLowerCase());
      if (!profile) continue;
      const info = profile?.basic_info || profile;
      const experience = currentExperience(profile);
      const name = pick(experience || {}, ['company', 'company_name', 'companyName'])
        || pick(info, ['current_company', 'company', 'company_name']);
      const url = pick(experience || {}, ['company_linkedin_url', 'company_url', 'companyUrl', 'company_linkedin']);
      leadCompany.set(lead.id, { name: name ? String(name) : null, url: url ? String(url) : null });
      const key = String(url || name || '').toLowerCase().trim();
      if (key) companyKeys.add(String(url || name));
    }
    if (companyKeys.size && remainingMs(deadlineAt) > 60000) {
      try {
        const companies = await runActor(companyActorId, token, { companies: [...companyKeys] }, deadlineAt);
        for (const company of Array.isArray(companies) ? companies : []) {
          for (const key of [company?.linkedinUrl, company?.url, company?.name, company?.universalName]) {
            if (key) companyByKey.set(String(key).toLowerCase().trim(), company);
          }
        }
      } catch (companyError) {
        console.error('Scrape de company falhou (seguindo sem headcount):', errorMessage(companyError));
      }
    }

    // (4) Qualificação lead a lead com payload enxuto.
    let processed = 0;
    let qualified = 0;
    let llmCalls = 0;
    let rateLimited = false;
    // Metadados de ritmo pro front montar a estimativa/espera (Task 2 do plano
    // safe-lead-analysis-queue): o Gemini free não manda Retry-After utilizável,
    // então usamos uma janela conservadora fixa em vez de tentar parsear o header.
    let retryAfterSeconds = GEMINI_RETRY_AFTER_SECONDS;
    const secondsPerLeadEstimate = GEMINI_ESTIMATED_SECONDS_PER_LEAD;
    const recommendedBatchSize = GEMINI_SAFE_BATCH_SIZE;
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
        const companyDetails = company.url && companyByKey.get(String(company.url).toLowerCase().trim())
          || (company.name && companyByKey.get(String(company.name).toLowerCase().trim()))
          || null;
        const employeeCount = companyDetails
          ? Number(pick(companyDetails, ['employeeCount', 'employee_count', 'staffCount', 'staff_count', 'employeesAmountInLinkedin'])) || null
          : null;
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

        // Espaça as chamadas pro LLM (tier free do Gemini: ~10 req/min).
        if (llmCalls > 0) await wait(6500);
        llmCalls += 1;
        const result = await qualifyLead(payload, deadlineAt, icpRules);
        const { error: updateError } = await client.from('leads').update({
          full_name: payload.name || lead.full_name,
          headline: payload.headline || lead.headline,
          job_title: result.job_title || payload.current_title,
          seniority: result.seniority,
          area: result.area,
          company_name: payload.company_name,
          company_url: currentlyEmployed ? company.url : null,
          company_size: payload.company_employee_count,
          location: payload.location ? String(payload.location).slice(0, 200) : null,
          qualification_status: result.status,
          qualification_reason: result.reason,
          score: result.score,
          suggested_angle: result.suggested_angle,
          enrichment_status: 'enriched',
          enrichment_error: null,
          profile_raw: profile,
          company_raw: companyDetails || {},
        }).eq('id', lead.id);
        if (updateError) throw updateError;
        processed += 1;
        if (result.qualified) qualified += 1;
        if (lead.first_seen_post_id) affectedPosts.add(lead.first_seen_post_id);
      } catch (leadError) {
        const message = errorMessage(leadError);
        // Rate limit do LLM não é culpa do lead: volta pra fila (pending) e encerra
        // o lote — o próximo lote tenta de novo quando a janela de rate limit virar.
        if (leadError instanceof RateLimitError || message.includes('429') || /RESOURCE_EXHAUSTED|quota|rate/i.test(message)) {
          rateLimited = true;
          retryAfterSeconds = leadError instanceof RateLimitError ? leadError.retryAfterSeconds : GEMINI_RETRY_AFTER_SECONDS;
          await client.from('leads').update({ enrichment_status: 'pending', enrichment_error: null }).eq('id', lead.id);
          break;
        }
        errors.push({ lead: lead.public_identifier || lead.id, error: message });
        await client.from('leads').update({ enrichment_status: 'error', enrichment_error: message }).eq('id', lead.id);
      }
    }

    // Posts dos leads pré-filtrados também precisam do recount.
    for (const lead of junior) if (lead.first_seen_post_id) affectedPosts.add(lead.first_seen_post_id);
    await refreshJobQualifiedCounts(client, [...affectedPosts]);

    const { count: remainingCount } = await client.from('leads')
      .select('id', { count: 'exact', head: true }).eq('enrichment_status', 'pending');

    const status = errors.length ? (processed ? 'partial' : 'failed') : 'success';
    await finishRun(client, runId, {
      status,
      items_processed: processed + junior.length,
      error_message: errors.length ? `${errors.length} lead(s) falharam` : null,
      raw: { errors, prefiltered: junior.length, qualified },
    });
    return json({
      success: status !== 'failed' || rateLimited,
      runId,
      status,
      processed,
      prefiltered: junior.length,
      qualified,
      rateLimited,
      retryAfterSeconds: rateLimited ? retryAfterSeconds : GEMINI_RETRY_AFTER_SECONDS,
      recommendedBatchSize,
      estimatedSecondsPerLead: secondsPerLeadEstimate,
      errors,
      remaining: remainingCount ?? 0,
    });
  } catch (error) {
    const message = errorMessage(error);
    if (runId) await finishRun(adminClient(), runId, { status: 'failed', error_message: message });
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
