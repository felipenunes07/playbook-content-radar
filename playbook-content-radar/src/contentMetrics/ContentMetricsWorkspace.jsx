import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, BarChart3, Database, ExternalLink, FileClock, MessageSquare,
  Play, RefreshCw, Settings, SlidersHorizontal, Users, Video,
} from 'lucide-react';
import { aggregateContentMetrics, aggregateYoutubeMetrics, buildCreatorComparison, buildMonthlyTrend, filterContent, filterYoutube, groupPerformance, rankContent } from './analytics.js';
import { loadContentMetrics } from './repository.js';
import { METRICS_SECTIONS } from './routes.js';
import { ContentFilters, MetricStrip, OperationalPostsTable, StatusPill, TopContentTable, YoutubeFilters, YoutubeVideosTable } from './components.jsx';
import { AccountGrowthChart, ContentTrendChart, CreatorComparisonChart, PerformanceBars } from './charts.jsx';
import './contentMetrics.css';

const integer = new Intl.NumberFormat('pt-BR');
const fallbackAccounts = [
  { id: 'linkedin-victor', platform: 'linkedin', owner_name: 'Victor Baggio', account_name: 'Victor Baggio LinkedIn', account_url: 'https://www.linkedin.com/in/victorzbaggio/', handle: 'victorzbaggio', status: 'active' },
  { id: 'linkedin-fernando', platform: 'linkedin', owner_name: 'Fernando Tedesco', account_name: 'Fernando Tedesco LinkedIn', account_url: 'https://www.linkedin.com/in/fernando-tedesco/', handle: 'fernando-tedesco', status: 'active' },
  { id: 'youtube-victor', platform: 'youtube', owner_name: 'Victor Baggio', account_name: 'Victor Baggio AI', account_url: 'https://www.youtube.com/@VictorBaggio-AI', handle: '@VictorBaggio-AI', status: 'active' },
  { id: 'youtube-fernando', platform: 'youtube', owner_name: 'Fernando Tedesco', account_name: 'Fernando Tedesco', account_url: 'https://www.youtube.com/@fernando_tedesco', handle: '@fernando_tedesco', status: 'active' },
];

const sectionIcons = { overview: BarChart3, linkedin: MessageSquare, youtube: Video, posts: Activity, videos: Play, accounts: Users, imports: FileClock, settings: Settings };

function SourceNotice({ data }) {
  return <div className={`cm-source ${data.source}`}><Database size={15} /><div><strong>{data.source === 'supabase' ? 'Supabase conectado' : 'Snapshot histórico local'}</strong><span>{data.source === 'supabase' ? `Última métrica: ${data.freshness || 'não informada'}` : <>Baseline de 12/05/2026 · <b>222 posts no arquivo completo</b>. Crescimento retroativo não está disponível.</>}</span></div>{data.source !== 'supabase' && <span className="cm-source-reason" title={data.warning || ''}>Schema ainda não publicado</span>}</div>;
}

function Overview({ filtered, allPosts, data, filters, setFilters }) {
  const metrics = aggregateContentMetrics(filtered);
  const trend = buildMonthlyTrend(filtered);
  const comparison = buildCreatorComparison(filtered);
  const youtubeViews = data.youtube.reduce((sum, video) => sum + Number(video.views || 0), 0);
  return <>
    <ContentFilters filters={filters} onChange={setFilters} posts={allPosts} />
    <MetricStrip metrics={metrics} youtubeViews={youtubeViews} />
    <div className="cm-primary-grid">
      <section className="cm-panel cm-trend-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Evolução</span><h2>Engagement por mês</h2></div><small>{trend.length} períodos</small></div><ContentTrendChart data={trend} /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Criadores</span><h2>Victor vs Fernando</h2></div></div><CreatorComparisonChart data={comparison} /></section>
    </div>
    <TopContentTable rows={rankContent(filtered, 'engagement_score', 10)} />
  </>;
}

function LinkedinAnalysis({ filtered, allPosts, filters, setFilters }) {
  const metrics = aggregateContentMetrics(filtered);
  return <>
    <ContentFilters filters={filters} onChange={setFilters} posts={allPosts} advanced />
    <MetricStrip metrics={metrics} />
    <div className="cm-analysis-grid">
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Formato</span><h2>O que mais performa</h2></div></div><PerformanceBars rows={groupPerformance(filtered, 'format')} valueKey="score" label="Score" /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">CTA</span><h2>Comentários por chamada</h2></div></div><PerformanceBars rows={groupPerformance(filtered, 'cta_keyword')} valueKey="comments" label="Comentários" /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Tema</span><h2>Performance temática</h2></div></div><PerformanceBars rows={groupPerformance(filtered, 'theme')} valueKey="engagement" /></section>
    </div>
    <TopContentTable rows={rankContent(filtered, 'comments', 10)} metric="comments" title="Top posts por comentários" />
  </>;
}

function EmptyCollector({ platform, onSettings }) {
  const youtube = platform === 'YouTube';
  return <div className="cm-collector-empty"><div className="cm-empty-icon">{youtube ? <Video size={28} /> : <Activity size={28} />}</div><span className="cm-eyebrow">Coleta aguardando configuração</span><h2>{platform}</h2><p>{youtube ? 'Adicione YOUTUBE_API_KEY e execute collect-youtube para carregar canais, vídeos, views, likes e inscritos públicos.' : 'Adicione APIFY_TOKEN e APIFY_LINKEDIN_ACTOR_ID para iniciar snapshots diários.'}</p><button type="button" onClick={onSettings}><Settings size={15} /> Abrir configurações</button></div>;
}

function YoutubeSection({ data, videos, filters, setFilters, onSettings }) {
  const growth = data.growth.length ? <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Conta</span><h2>Crescimento de contas</h2></div></div><AccountGrowthChart data={data.growth} /></section> : null;
  if (!data.youtube.length) return <>{growth}<EmptyCollector platform="YouTube" onSettings={onSettings} /></>;
  const totals = aggregateYoutubeMetrics(videos);
  const trend = buildMonthlyTrend(videos.map((video) => ({ ...video, engagement_total: video.engagement_total || 0, shares: 0 })));
  return <><YoutubeFilters filters={filters} onChange={setFilters} videos={data.youtube} /><div className="cm-metric-strip"><div className="cm-metric"><span>Vídeos</span><strong>{totals.videos}</strong></div><div className="cm-metric"><span>Views</span><strong>{integer.format(totals.views)}</strong></div><div className="cm-metric"><span>Likes</span><strong>{integer.format(totals.likes)}</strong></div><div className="cm-metric"><span>Comentários</span><strong>{integer.format(totals.comments)}</strong></div><div className="cm-metric"><span>Engagement</span><strong>{integer.format(totals.engagement)}</strong></div><div className="cm-metric"><span>Taxa média</span><strong>{totals.engagementRate.toLocaleString('pt-BR')}%</strong></div></div><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Publicação</span><h2>Vídeos publicados por mês</h2></div><small>{trend.length} períodos</small></div><ContentTrendChart data={trend} metric="posts" /></section>{growth}<YoutubeVideosTable rows={[...videos].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 50)} title="Top vídeos por views" /></>;
}

function PostsSection({ filtered, allPosts, filters, setFilters, onAction }) {
  return <><ContentFilters filters={filters} onChange={setFilters} posts={allPosts} compact advanced /><OperationalPostsTable rows={rankContent(filtered, 'engagement_score', 250)} onAction={onAction} /></>;
}

function VideosSection({ data, onSettings }) {
  if (!data.youtube.length) return <EmptyCollector platform="YouTube" onSettings={onSettings} />;
  return <YoutubeVideosTable rows={data.youtube} />;
}

function AccountsSection({ data }) {
  const accounts = data.accounts.length ? data.accounts : fallbackAccounts;
  return <section className="cm-table-section"><div className="cm-section-heading"><div><span className="cm-eyebrow">Monitoramento</span><h2>Contas</h2></div><small>{accounts.length} contas</small></div><div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>Pessoa</th><th>Plataforma</th><th>Conta</th><th>Handle</th><th>ID externo</th><th>Status</th><th>Última coleta</th><th>Último erro</th><th /></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.owner_name}</strong></td><td>{account.platform}</td><td>{account.account_name}</td><td>{account.handle || '—'}</td><td>{account.external_id || '—'}</td><td><StatusPill status={account.status} /></td><td>{account.last_collected_at || 'Ainda não coletada'}</td><td>{account.last_error || '—'}</td><td><a className="cm-open" href={account.account_url} target="_blank" rel="noreferrer" aria-label={`Abrir conta de ${account.owner_name}`}><ExternalLink size={15} /></a></td></tr>)}</tbody></table></div>{data.source !== 'supabase' && <p className="cm-table-note">Contas previstas na configuração. Publique o schema para editar status e acompanhar erros.</p>}</section>;
}

function ImportsSection({ data }) {
  const rows = data.imports.length ? data.imports : [
    { id: 'fernando-local', file_name: 'fernando-posts.json', owner_name: 'Fernando Tedesco', total_items: 105, imported_items: 105, skipped_items: 0, collected_at: '2026-05-12', status: 'success' },
    { id: 'victor-local', file_name: 'victor-posts.json', owner_name: 'Victor Baggio', total_items: 117, imported_items: 117, skipped_items: 0, collected_at: '2026-05-12', status: 'success' },
  ];
  return <><section className="cm-table-section"><div className="cm-section-heading"><div><span className="cm-eyebrow">Auditoria</span><h2>Importações</h2></div><small>{rows.length} lotes</small></div><div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>Arquivo</th><th>Pessoa</th><th>Total</th><th>Importados</th><th>Ignorados</th><th>Data-base</th><th>Importado em</th><th>Status</th><th>Erro</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.file_name}</strong></td><td>{row.owner_name}</td><td>{row.total_items}</td><td>{row.imported_items}</td><td>{row.skipped_items}</td><td>{String(row.collected_at || '').slice(0, 10)}</td><td>{row.created_at || 'Snapshot local'}</td><td><StatusPill status={row.status} /></td><td>{row.error_message || '—'}</td></tr>)}</tbody></table></div></section><section className="cm-table-section"><div className="cm-section-heading"><div><span className="cm-eyebrow">Coletas</span><h2>Execuções automáticas</h2></div><small>{data.runs.length} execuções</small></div>{!data.runs.length ? <div className="cm-empty">As execuções aparecerão aqui após a primeira coleta automática.</div> : <div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>Fonte</th><th>Início</th><th>Contas</th><th>Itens</th><th>Status</th><th>Erro</th></tr></thead><tbody>{data.runs.map((run) => <tr key={run.id}><td><strong>{run.source}</strong></td><td>{run.started_at || '—'}</td><td>{run.accounts_processed || 0}</td><td>{run.items_processed || 0}</td><td><StatusPill status={run.status} /></td><td>{run.error_message || '—'}</td></tr>)}</tbody></table></div>}</section></>;
}

function SettingsSection({ data, client }) {
  const [running, setRunning] = useState('');
  const [message, setMessage] = useState('');
  const run = async (name) => {
    if (!client?.functions?.invoke) { setMessage('Publique as Edge Functions e configure os secrets antes da execução manual.'); return; }
    setRunning(name); setMessage('');
    const { error } = await client.functions.invoke(name, { body: { manual: true } });
    setMessage(error ? error.message : `${name} iniciado com sucesso.`); setRunning('');
  };
  const secrets = [
    ['YouTube API', 'YOUTUBE_API_KEY'], ['Apify token', 'APIFY_TOKEN'], ['Apify actor', 'APIFY_LINKEDIN_ACTOR_ID'], ['Classificação', 'CLASSIFICATION_API_KEY'],
  ];
  return <div className="cm-settings-grid"><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Secrets</span><h2>Integrações</h2></div></div><div className="cm-secret-list">{secrets.map(([label, name]) => <div key={name}><span>{label}</span><code>{name}</code><StatusPill status={data.source === 'supabase' ? 'pending' : 'paused'} /></div>)}</div><p className="cm-table-note">Tokens reais nunca são exibidos no frontend. Configure-os no painel de Edge Function Secrets.</p></section><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Agenda</span><h2>Coletas automáticas</h2></div></div><div className="cm-schedule"><div><span>YouTube</span><strong>Todos os dias · 06:00</strong><button onClick={() => run('collect-youtube')} disabled={Boolean(running)}><RefreshCw size={14} className={running === 'collect-youtube' ? 'spin' : ''} /> Executar agora</button></div><div><span>LinkedIn</span><strong>Todos os dias · 06:30</strong><button onClick={() => run('collect-linkedin')} disabled={Boolean(running)}><RefreshCw size={14} className={running === 'collect-linkedin' ? 'spin' : ''} /> Executar agora</button></div></div>{message && <div className="cm-settings-message">{message}</div>}</section><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Histórico</span><h2>Backfill e classificação</h2></div></div><div className="cm-config-summary"><div><span>Data-base importada</span><strong>12/05/2026</strong></div><div><span>Janela de backfill</span><strong>Configurável por coleta</strong></div><div><span>Taxonomia</span><strong>Formato, tema, CTA, funil e intenção</strong></div><div><span>Revisão manual</span><strong>Disponível pela API protegida</strong></div></div><p className="cm-table-note">As regras vivem em <code>classify-content</code>; alterações manuais preservam o status e a data da revisão.</p></section></div>;
}

export default function ContentMetricsWorkspace({ client, initialData, initialSection = 'overview', onSectionChange }) {
  const [section, setSection] = useState(initialSection);
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [filters, setFilters] = useState({});
  const [youtubeFilters, setYoutubeFilters] = useState({});
  const [operationMessage, setOperationMessage] = useState('');

  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    if (initialData) return;
    let active = true;
    loadContentMetrics({ supabase: client }).then((result) => { if (active) { setData(result); setLoading(false); } });
    return () => { active = false; };
  }, [client, initialData]);

  const filtered = useMemo(() => filterContent(data?.linkedin || [], filters), [data, filters]);
  const filteredYoutube = useMemo(() => filterYoutube(data?.youtube || [], youtubeFilters), [data, youtubeFilters]);
  const navigate = (next) => { setSection(next); onSectionChange?.(next); };
  const title = METRICS_SECTIONS.find((item) => item.id === section)?.label || 'Visão geral';

  if (loading || !data) return <div className="cm-loading"><RefreshCw className="spin" size={20} /> Carregando métricas…</div>;

  return <div className="content-metrics-workspace">
    <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Performance publicada</span><h1>Métricas de conteúdo</h1><p>Leitura histórica e operação diária de LinkedIn e YouTube.</p></div><div className="cm-header-meta"><span>{data.linkedin.length} posts carregados</span><SlidersHorizontal size={16} /></div></header>
    <SourceNotice data={data} />
    {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
    <nav className="cm-tabs" aria-label="Seções de métricas">{METRICS_SECTIONS.map((item) => { const Icon = sectionIcons[item.id]; return <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-label={item.label}><Icon size={14} />{item.label}</button>; })}</nav>
    <AnimatePresence mode="wait"><motion.div key={section} className="cm-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
      {section !== 'overview' && <div className="cm-view-title"><span className="cm-eyebrow">Content Dashboard</span><h1>{title}</h1></div>}
      {section === 'overview' && <Overview filtered={filtered} allPosts={data.linkedin} data={data} filters={filters} setFilters={setFilters} />}
      {section === 'linkedin' && <LinkedinAnalysis filtered={filtered} allPosts={data.linkedin} filters={filters} setFilters={setFilters} />}
      {section === 'youtube' && <YoutubeSection data={data} videos={filteredYoutube} filters={youtubeFilters} setFilters={setYoutubeFilters} onSettings={() => navigate('settings')} />}
      {section === 'posts' && <PostsSection filtered={filtered} allPosts={data.linkedin} filters={filters} setFilters={setFilters} onAction={(action) => setOperationMessage(action === 'history' ? 'O histórico completo ficará disponível assim que os snapshots diários forem publicados no Supabase.' : 'Essa ação usa a API administrativa protegida. Publique o schema e autentique o operador antes de alterar dados.')} />}
      {section === 'videos' && <VideosSection data={data} onSettings={() => navigate('settings')} />}
      {section === 'accounts' && <AccountsSection data={data} />}
      {section === 'imports' && <ImportsSection data={data} />}
      {section === 'settings' && <SettingsSection data={data} client={client} />}
    </motion.div></AnimatePresence>
  </div>;
}
