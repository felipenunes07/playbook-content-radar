// As três séries históricas empacotadas somam ~1,2 MB de JSON e existem só como rede
// de segurança: o snapshot local de quando o Supabase falha, e o histórico de
// YouTube/Instagram do dashboard completo. Importadas de forma estática, esse 1 MB
// caía no mesmo chunk de QUEM SÓ QUER ABRIR LEADS ICP — a página que nunca lê nada
// disso. Agora só descem quando alguém realmente precisa delas.
let historyPromise = null;
function bundledHistories() {
  if (!historyPromise) {
    historyPromise = Promise.all([
      import('./data/linkedin-history.json'),
      import('./data/youtube-history.json'),
      import('./data/instagram-history.json'),
    ]).then(([linkedin, youtube, instagram]) => ({
      linkedin: linkedin.default || linkedin,
      youtube: youtube.default || youtube,
      instagram: instagram.default || instagram,
    })).catch(() => {
      // Deixar de baixar a rede de segurança não pode ser pior que não ter rede de
      // segurança: quem chama aqui já está no caminho do erro, e uma rejeição
      // silenciosa deixaria a tela em "Carregando…" para sempre. Da próxima vez
      // tenta de novo, em vez de guardar a falha em cache.
      historyPromise = null;
      return { linkedin: { records: [] }, youtube: { records: [] }, instagram: { records: [] } };
    });
  }
  return historyPromise;
}

const empty = {
  youtube: [],
  instagram: [],
  accounts: [],
  imports: [],
  runs: [],
  growth: [],
  prospecting: [],
  leads: [],
  leadPhones: [],
  tallyStats: { total: 0, comTelefone: 0, ultimaSync: null },
  leadOutreach: [],
  leadComments: [],
  leadQualifications: [],
  icpProfiles: [],
  goals: [],
  bookings: [],
  pipeline: [],
  touchpoints: [],
  pipelineCadence: null,
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const cacheByClient = new WeakMap();

const LEAD_COLUMNS_BASE = [
  'id',
  'first_seen_post_id',
  'full_name',
  'public_identifier',
  'profile_url',
  'score',
  'headline',
  'job_title',
  'company_name',
  'company_size',
  'area',
  'seniority',
  'enrichment_status',
  'qualification_status',
  'qualification_reason',
  'suggested_angle',
  'created_at',
];

// ICP dono do veredito espelhado: sem ele a lista não sabe dizer de qual ICP é o
// 'aprovado' que está mostrando. Coluna criada pela migration do multi-ICP, então a
// leitura tem fallback para o banco que ainda não a recebeu.
const LEAD_COLUMNS = [...LEAD_COLUMNS_BASE, 'qualification_icp_id'].join(', ');
const LEAD_COLUMNS_SEM_ICP = LEAD_COLUMNS_BASE.join(', ');

// A view do telefone repete identidade que a tela já tem em `leads` (nome, empresa,
// headline, cargo, profile_url) — colunas de texto longo que dobravam o payload sem
// nada de novo. Aqui fica só o que a célula, os modais e a exportação leem de fato.
const LEAD_PHONE_COLUMNS = [
  'lead_id',
  'match_status',
  'match_method',
  'confidence',
  'phone_e164',
  'phone_form_name',
  'phone_submitted_at',
  'submission_id',
  'evidence',
  // `candidates` continua vindo: é dele que sai "qual isca a pessoa baixou" nos 86
  // leads em MATCHED_NO_PHONE, todos sem phone_form_name.
  'candidates',
  'rejected_submission_ids',
  'review_decision',
  'reviewed_by',
  'reviewed_at',
  'matched_at',
].join(', ');

const LEAD_POST_COLUMNS = [
  'id',
  'external_post_id',
  'owner_name',
  'author_name',
  'published_at',
  'post_url',
  'hook',
  // `content` (o corpo inteiro do post) ficava aqui só como texto reserva para o
  // rótulo quando `hook` faltasse — e não falta em nenhum dos 225 posts. Eram 264 KB
  // e ~0,8s por abertura para alimentar um fallback que nunca dispara.
  'format',
  'media_url',
  'media_type',
  'is_repost',
  'repost_id',
].join(', ');

// Caminho de erro: aqui o custo de baixar o histórico já não importa, porque a
// alternativa é a tela sem dado nenhum.
async function localSnapshot(fallback, warning, { loadError = false } = {}) {
  const bundled = await bundledHistories();
  const base = fallback || bundled.linkedin;
  return {
    source: 'local_snapshot',
    linkedin: withoutReposts(base.records),
    ...empty,
    youtube: bundled.youtube.records || [],
    instagram: bundled.instagram.records || [],
    freshness: base.collected_at || null,
    warning,
    loadError,
  };
}

function clientCache(supabase) {
  let cache = cacheByClient.get(supabase);
  if (!cache) {
    cache = new Map();
    cacheByClient.set(supabase, cache);
  }
  return cache;
}

// O PostgREST corta a resposta em 1.000 linhas por padrão e NÃO avisa: a resposta
// chega sem erro, só menor. Em 17/08/2026 a tela de Leads ICP mostrava 230 dos 2.199
// leads do post das 36 Skills — o comercial teria trabalhado achando que aquilo era
// a lista inteira. Tudo que cresce com o volume de prospecção é lido em páginas.
export const SUPABASE_PAGE_SIZE = 1000;
// Freio contra loop infinito se o servidor devolver sempre página cheia.
const MAX_PAGES = 60;

const TOO_MANY_PAGES = { message: `Paginação passou de ${MAX_PAGES} páginas — consulta parece não terminar` };

// Página por página, uma esperando a outra: é o que sobra quando o servidor não diz
// quantas linhas existem. Continua correto — só é lento.
async function fetchPagesSequentially(buildQuery, firstRows) {
  const rows = [...firstRows];
  for (let page = 1; page < MAX_PAGES; page += 1) {
    const from = page * SUPABASE_PAGE_SIZE;
    // O builder do supabase-js só executa uma vez, então cada página remonta a query.
    const result = await buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (result.error) return result;
    const data = result.data || [];
    rows.push(...data);
    if (data.length < SUPABASE_PAGE_SIZE) return { data: rows, error: null };
  }
  return { data: rows, error: TOO_MANY_PAGES };
}

// A primeira página pede o total junto: `count: 'exact'` viaja no Content-Range da
// MESMA resposta, não custa uma consulta a mais. Sabendo o total, as páginas que
// faltam saem todas de uma vez.
//
// Antes elas saíam em fila indiana, e a espera não era teórica: `leads` (3.154),
// `lead_comments` (3.263) e `lead_qualifications` (3.154) são quatro páginas cada,
// de ~1s — doze idas e voltas encadeadas que sozinhas respondiam por metade do
// tempo de abrir a tela de Leads ICP.
async function fetchAllPages(buildQuery) {
  const first = await buildQuery({ count: 'exact' }).range(0, SUPABASE_PAGE_SIZE - 1);
  if (first.error) return first;
  const firstRows = first.data || [];
  // Coube tudo na primeira página: o caso da maioria das tabelas.
  if (firstRows.length < SUPABASE_PAGE_SIZE) return { data: firstRows, error: null };

  const total = Number(first.count);
  // Sem contagem confiável não dá para saber quantas páginas pedir, e chutar
  // arriscaria parar antes do fim — que é justamente o bug que a paginação existe
  // para evitar. Volta para a fila indiana.
  if (!Number.isFinite(total) || total <= 0) return fetchPagesSequentially(buildQuery, firstRows);

  const totalPages = Math.ceil(total / SUPABASE_PAGE_SIZE);
  // Continua sendo erro, não truncamento silencioso: lista cortada nesta tela já
  // fez o comercial trabalhar achando que via tudo.
  if (totalPages > MAX_PAGES) return { data: firstRows, error: TOO_MANY_PAGES };

  const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => {
    const from = (index + 1) * SUPABASE_PAGE_SIZE;
    return buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1);
  }));
  const failed = rest.find((page) => page.error);
  if (failed) return failed;
  return { data: [...firstRows, ...rest.flatMap((page) => page.data || [])], error: null };
}

// Tabela que pode legitimamente ainda não existir no banco: o código nasce antes da
// migration subir. Sem isto, um 42P01 numa consulta nova derruba fetchContentMetrics
// inteiro e a tela cai no snapshot local — dado velho, sem dizer que o motivo foi
// tabela faltando.
function isMissingRelation(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') return true;
  return /does not exist|could not find the table|schema cache/i.test(String(error.message || ''));
}

// Coluna que a migration do multi-ICP acrescenta e que pode não existir ainda.
// Pedir uma coluna inexistente faz o PostgREST devolver 42703 e a consulta INTEIRA
// falhar — o que derrubaria a tela de Leads no banco antigo.
function isMissingColumn(error) {
  if (!error) return false;
  return String(error.code || '') === '42703'
    || /column .* does not exist/i.test(String(error.message || ''));
}

function isSchemaBehind(error) {
  return isMissingRelation(error) || isMissingColumn(error);
}

function queryPlan(supabase, mode) {
  const queries = new Map();
  const add = (key, query) => queries.set(key, query);
  // Chave paginada: recebe uma FUNÇÃO que monta a query, não a query pronta.
  const addPaginated = (key, buildQuery) => queries.set(key, { paginate: buildQuery });
  // Opcional: se a relação não existir, volta vazia em vez de derrubar a tela. Só
  // para o que a interface sabe degradar — nunca para dado que ela precisa ter.
  const addOptional = (key, query) => queries.set(key, { optional: true, query });
  const addOptionalPaginated = (key, buildQuery) => queries.set(key, { optional: true, paginate: buildQuery });
  // Duas versões da mesma consulta: a nova (com as colunas do multi-ICP) e a antiga.
  // Se o banco ainda não tiver a migration, a segunda responde e a tela funciona
  // como antes, em vez de cair inteira no snapshot local.
  const addPaginatedWithFallback = (key, buildQuery, buildFallback) => queries.set(key, { paginate: buildQuery, paginateFallback: buildFallback });

  if (mode !== 'goals') {
    add('linkedin', supabase
      .from('v_latest_linkedin_post_metrics')
      .select(mode === 'leads' ? LEAD_POST_COLUMNS : '*'));
  }

  if (mode === 'full') {
    add('youtube', supabase.from('v_latest_youtube_video_metrics').select('*'));
    add('instagram', supabase.from('v_latest_instagram_post_metrics').select('*'));
    add('accounts', supabase.from('content_accounts').select('*'));
    add('imports', supabase.from('import_batches').select('*'));
    add('runs', supabase.from('collection_runs').select('id, source, started_at, accounts_processed, items_processed, status, error_message'));
    add('accountMetrics', supabase.from('account_daily_metrics').select('*'));
    add('goals', supabase.from('content_goals').select('*'));
    add('bookings', supabase.from('lead_magnet_bookings').select('booking_uid, lead_magnet, lead_name, lead_email, status, trigger_event, start_time, created_at, utm_source, utm_campaign'));
  } else if (mode === 'prospecting') {
    add('prospecting', supabase.from('v_post_prospecting_stats').select('*'));
    // Os ICPs alimentam o diálogo do botão Prospectar ("quais ICPs usar neste post?").
    addOptional('icpProfiles', supabase.from('icp_profiles').select('*').order('is_default', { ascending: false }).order('name'));
  } else if (mode === 'leads') {
    // As quatro paginadas: um único post viral já coloca ~2.200 linhas em `leads` e
    // ~2.300 em `lead_comments`, bem acima do teto de 1.000 do PostgREST.
    // A ordem precisa ser TOTAL: `range` sobre ordem ambígua faz página repetir ou
    // perder linha, e um upsert em lote grava dezenas de leads com o mesmo
    // created_at — por isso o desempate pelo id.
    addPaginatedWithFallback(
      'leads',
      (options) => supabase.from('leads').select(LEAD_COLUMNS, options).order('created_at', { ascending: false }).order('id'),
      (options) => supabase.from('leads').select(LEAD_COLUMNS_SEM_ICP, options).order('created_at', { ascending: false }).order('id'),
    );
    // message_icp_id: lead_outreach é unique por lead, então a mensagem guardada pode
    // ter sido escrita para o outro ICP. A tela usa isto para avisar antes de copiar.
    addPaginatedWithFallback(
      'leadOutreach',
      (options) => supabase.from('lead_outreach').select('lead_id, status, generated_message, message_icp_id', options).order('lead_id'),
      (options) => supabase.from('lead_outreach').select('lead_id, status, generated_message', options).order('lead_id'),
    );
    addPaginated('leadComments', (options) => supabase.from('lead_comments').select('lead_id, post_id, comment_text, commented_at, created_at', options)
      .order('lead_id').order('post_id'));
    // Telefone vindo da Base Tally. A view já filtra por qualification_status =
    // 'qualified' e traz o match com evidências e candidatos — a tela não precisa
    // saber nada do matcher, só ler o resultado.
    addPaginated('leadPhones', (options) => supabase.from('v_lead_phones').select(LEAD_PHONE_COLUMNS, options).order('lead_id'));
    // Resumo da Base Tally para o rótulo de última sincronização. São três consultas
    // sem payload de linha (head + count, e um order/limit 1) em vez de baixar a
    // tabela: ela já tem ~1k linhas e vai para ~19k quando os 59 formulários entrarem.
    add('tallyLatest', supabase.from('tally_submissions').select('imported_at').order('imported_at', { ascending: false }).limit(1));
    add('tallyTotal', supabase.from('tally_submissions').select('submission_id', { count: 'exact', head: true }));
    add('tallyPhones', supabase.from('tally_submissions').select('submission_id', { count: 'exact', head: true }).not('phone_e164', 'is', null).eq('is_junk', false));
    // Veredito por ICP: o filtro de ICP da tela troca status/score/motivo por estes.
    // Paginado pelo mesmo motivo das outras — são até um registro por lead por ICP.
    addOptionalPaginated('leadQualifications', (options) => supabase.from('lead_qualifications')
      .select('lead_id, icp_id, status, score, reason, suggested_angle, decided_by', options)
      .order('lead_id').order('icp_id'));
    addOptional('icpProfiles', supabase.from('icp_profiles').select('*').order('is_default', { ascending: false }).order('name'));
  } else if (mode === 'pipeline') {
    // O board lê a view, que já entrega toques, último contato, dias sem resposta e
    // a fila "precisa de contato hoje" calculados. Uma linha por lead SELECIONADO —
    // centenas, não os 3.1k de `leads` — mas pagina do mesmo jeito, porque foi
    // exatamente assim que a lista de leads passou meses mostrando 230 de 2.199.
    addPaginated('pipeline', (options) => supabase.from('v_lead_pipeline').select('*', options)
      .order('lead_id'));
    // Timeline do card. Inclui os anulados: a view os ignora nos cálculos, mas quem
    // abre o histórico precisa ver que houve uma correção — é a auditoria.
    addPaginated('touchpoints', (options) => supabase.from('lead_touchpoints')
      .select('id, lead_id, direction, channel, touch_number, touched_at, note, created_by, cancelled_at, cancelled_by, cancel_reason', options)
      .order('lead_id').order('touched_at'));
    add('pipelineSettings', supabase.from('pipeline_settings').select('cadence').eq('id', true).limit(1));
    add('icpProfiles', supabase.from('icp_profiles').select('id, name').order('name'));
    // Post de origem do card: só o suficiente pro rótulo, não a tabela inteira.
    add('linkedin', supabase.from('v_latest_linkedin_post_metrics')
      .select('id, hook, published_at, post_url, owner_name'));
  } else if (mode === 'goals') {
    add('accounts', supabase.from('content_accounts').select('*'));
    add('accountMetrics', supabase.from('account_daily_metrics').select('*'));
    add('goals', supabase.from('content_goals').select('*'));
  }

  return queries;
}

async function fetchContentMetrics({ supabase, fallback, mode }) {
  try {
    // No dashboard completo o histórico empacotado cobre o que o banco ainda não
    // tem de YouTube/Instagram, então ele desce EM PARALELO com as consultas — quem
    // abre o dashboard não espera nada a mais por isso. As telas comerciais nem
    // tocam nele.
    const bundledForFull = mode === 'full' ? bundledHistories() : null;
    const queries = queryPlan(supabase, mode);
    const entries = await Promise.all([...queries.entries()].map(async ([key, query]) => {
      const run = async (spec) => (spec?.paginate ? fetchAllPages(spec.paginate) : (spec?.query ?? spec));
      let result = await run(query);
      // Banco sem a migration do multi-ICP: repete a consulta sem as colunas novas.
      if (query?.paginateFallback && isSchemaBehind(result?.error)) {
        result = await fetchAllPages(query.paginateFallback);
      }
      // Relação inexistente numa consulta opcional vira lista vazia: a tela sabe
      // funcionar sem ela (cai no comportamento de ICP único) em vez de mostrar
      // dado velho sem explicar por quê.
      if (query?.optional && isMissingRelation(result?.error)) {
        return [key, { data: [], error: null, missingRelation: true }];
      }
      return [key, result];
    }));
    const results = Object.fromEntries(entries);
    const failed = entries.find(([, result]) => result.error);
    if (failed) {
      const [key, result] = failed;
      throw new Error(`${key}: ${result.error.message || 'Falha ao carregar dados'}`);
    }

    const bundled = bundledForFull ? await bundledForFull : null;
    const accounts = results.accounts?.data || [];
    const linkedin = withoutReposts(results.linkedin?.data || []);
    const growth = buildAccountGrowth(results.accountMetrics?.data || [], accounts);

    return {
      source: 'supabase',
      ...empty,
      linkedin,
      youtube: results.youtube?.data?.length ? results.youtube.data : (bundled?.youtube?.records || []),
      instagram: results.instagram?.data?.length ? results.instagram.data : (bundled?.instagram?.records || []),
      accounts,
      imports: results.imports?.data || [],
      runs: results.runs?.data || [],
      growth,
      prospecting: results.prospecting?.data || [],
      leads: (results.leads?.data || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      leadOutreach: results.leadOutreach?.data || [],
      leadComments: results.leadComments?.data || [],
      leadQualifications: results.leadQualifications?.data || [],
      icpProfiles: results.icpProfiles?.data || [],
      // A tela avisa que os ICPs múltiplos ainda não existem no banco em vez de
      // fingir que não há nenhum ICP cadastrado.
      icpTablesMissing: Boolean(results.icpProfiles?.missingRelation),
      leadPhones: results.leadPhones?.data || [],
      tallyStats: {
        total: results.tallyTotal?.count ?? 0,
        comTelefone: results.tallyPhones?.count ?? 0,
        ultimaSync: results.tallyLatest?.data?.[0]?.imported_at || null,
      },
      pipeline: results.pipeline?.data || [],
      touchpoints: results.touchpoints?.data || [],
      pipelineCadence: results.pipelineSettings?.data?.[0]?.cadence || null,
      goals: results.goals?.data || [],
      bookings: (results.bookings?.data || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      freshness: latestDate(linkedin),
      warning: null,
      loadError: false,
    };
  } catch (error) {
    return localSnapshot(fallback, error instanceof Error ? error.message : String(error), { loadError: true });
  }
}

function latestDate(rows, fallback) {
  return rows.reduce((latest, row) => {
    const candidate = row.metric_date || row.published_at;
    return candidate && (!latest || candidate > latest) ? candidate : latest;
  }, fallback || null);
}

const generatedAccountGrowthSources = new Set(['historical_json', 'historical_import']);

// Reposts não contam como conteúdo próprio (engagement pertence ao post original).
// A view do Supabase já os exclui; este filtro garante o mesmo no snapshot local.
function withoutReposts(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !(row.is_repost || row.format === 'repost'));
}

function buildAccountGrowth(metrics = [], accounts = []) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return (Array.isArray(metrics) ? metrics : [])
    .map((metric) => {
      const account = accountById.get(metric.account_id);
      if (!account) return null;
      return {
        ...metric,
        owner_name: account.owner_name,
        platform: account.platform,
        account_name: account.account_name,
        account_url: account.account_url,
      };
    })
    .filter(Boolean)
    .filter((row) => !generatedAccountGrowthSources.has(row.source))
    .sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
}

// `fallback` sem valor significa "use o snapshot empacotado" — resolvido lá dentro,
// só no caminho que precisa dele.
export async function loadContentMetrics({ supabase, fallback = null, mode = 'full', force = false } = {}) {
  if (!supabase) {
    return localSnapshot(fallback, 'Supabase não configurado', { loadError: mode !== 'full' });
  }

  const cache = clientCache(supabase);
  const cached = cache.get(mode);
  if (!force && cached?.data && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.data;
  if (cached?.inFlight) return cached.inFlight;

  const inFlight = fetchContentMetrics({ supabase, fallback, mode }).then((result) => {
    if (!result.loadError) cache.set(mode, { data: result, savedAt: Date.now(), inFlight: null });
    return result;
  }).finally(() => {
    const current = cache.get(mode);
    if (current?.inFlight === inFlight) cache.set(mode, { ...current, inFlight: null });
  });

  cache.set(mode, { ...cached, inFlight });
  return inFlight;
}

