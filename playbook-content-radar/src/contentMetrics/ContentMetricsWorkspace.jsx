import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, BarChart3, Database, ExternalLink, FileClock, FileText, Image as ImageIcon, MessageSquare,
  Play, RefreshCw, Settings, SlidersHorizontal, Users, Video, Target, Copy, Check,
} from 'lucide-react';

// lucide-react removeu os ícones de marca (Instagram, LinkedIn…) por questão de
// trademark, então usamos um glyph SVG local — mesmo padrão do LinkedinIcon no app.
const InstagramGlyph = ({ size = 24, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const AllIcon = ({ size = 20, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const LinkedInIcon = ({ size = 20, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const YouTubeIcon = ({ size = 20, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);
import {
  aggregateContentMetrics,
  aggregateYoutubeMetrics,
  buildCreatorComparison,
  buildExecutiveSummary,
  buildMonthlyComparison,
  buildMonthlyTrend,
  buildCalendarHeatmap,
  buildDailyCadence,
  buildWeeklyCadence,
  buildWeeklyContentTypeCadence,
  filterContent,
  filterYoutube,
  groupPerformance,
  rankContent,
  isoWeekKey,
  weekLabel,
} from './analytics.js';
import { loadContentMetrics } from './repository.js';
import { METRICS_SECTIONS } from './routes.js';
import { ContentFilters, MetricStrip, OperationalPostsTable, StatusPill, TopContentTable, YoutubeFilters, YoutubeVideosTable } from './components.jsx';
import {
  AccountGrowthChart,
  ContentTrendChart,
  CreatorComparisonChart,
  FrequencyResultScatter,
  CalendarHeatmapChart,
  NetworkFollowersChart,
  PerformanceBars,
  WeeklyCadenceChart,
  WeeklyContentTypeChart,
  WeeklyEngagementChart,
} from './charts.jsx';
import victorPhoto from '../assets/victor.png';
import fernandoPhoto from '../assets/fernando.png';
import './contentMetrics.css';

const integer = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const LEAD_ANALYSIS_DEFAULT_BATCH = 2;
const LEAD_ANALYSIS_SECONDS_PER_LEAD = 24;
const LEAD_ANALYSIS_RETRY_SECONDS = 75;

function formatDuration(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.ceil((total % 3600) / 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${Math.max(1, minutes)}min`;
}

export function buildLeadAnalysisPlan({ pending = 0, batchSize = LEAD_ANALYSIS_DEFAULT_BATCH, secondsPerLead = LEAD_ANALYSIS_SECONDS_PER_LEAD, retryAfterSeconds = LEAD_ANALYSIS_RETRY_SECONDS } = {}) {
  const safePending = Math.max(0, Math.trunc(Number(pending) || 0));
  const safeBatch = Math.max(1, Math.min(5, Math.trunc(Number(batchSize) || LEAD_ANALYSIS_DEFAULT_BATCH)));
  const safeSecondsPerLead = Math.max(8, Math.trunc(Number(secondsPerLead) || LEAD_ANALYSIS_SECONDS_PER_LEAD));
  const safeRetry = Math.max(30, Math.trunc(Number(retryAfterSeconds) || LEAD_ANALYSIS_RETRY_SECONDS));
  const estimatedSeconds = safePending * safeSecondsPerLead;
  return {
    batchSize: safeBatch,
    retryAfterSeconds: safeRetry,
    secondsPerLead: safeSecondsPerLead,
    estimatedSeconds,
    etaLabel: formatDuration(estimatedSeconds),
  };
}

export async function waitForLeadAnalysisRetry(seconds, stopRef, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  for (let elapsed = 0; elapsed < total; elapsed += 1) {
    if (stopRef?.current) return 'stopped';
    await sleep(1000);
  }
  return stopRef?.current ? 'stopped' : 'elapsed';
}

// Espera progressiva quando o Google limita/erra: a cada erro consecutivo o tempo
// cresce (~1.6×), com teto de 10 min. NÃO aborta a fila — o pedido do Felipe é
// "se der erro do Google, colocar um tempo maior pra continuar; o importante é
// terminar a lista". Só o botão "Parar" interrompe.
export function computeRateLimitBackoff(streak, baseSeconds = 75, capSeconds = 600) {
  const safeStreak = Math.max(1, Math.trunc(Number(streak) || 1));
  const safeBase = Math.max(15, Math.trunc(Number(baseSeconds) || 75));
  const grown = Math.round(safeBase * Math.pow(1.6, safeStreak - 1));
  return Math.min(grown, Math.max(safeBase, Math.trunc(Number(capSeconds) || 600)));
}

const creators = [
  { id: '', label: 'Ambos', owner: '', photo: null, color: '#111827' },
  { id: 'victor', label: 'Victor', owner: 'Victor Baggio', photo: victorPhoto, color: '#0a66c2' },
  { id: 'fernando', label: 'Fernando', owner: 'Fernando Tedesco', photo: fernandoPhoto, color: '#f59e0b' },
];

const fallbackAccounts = [
  { id: 'linkedin-victor', platform: 'linkedin', owner_name: 'Victor Baggio', account_name: 'Victor Baggio LinkedIn', account_url: 'https://www.linkedin.com/in/victorzbaggio/', handle: 'victorzbaggio', status: 'active' },
  { id: 'linkedin-fernando', platform: 'linkedin', owner_name: 'Fernando Tedesco', account_name: 'Fernando Tedesco LinkedIn', account_url: 'https://www.linkedin.com/in/fernando-tedesco/', handle: 'fernando-tedesco', status: 'active' },
  { id: 'youtube-victor', platform: 'youtube', owner_name: 'Victor Baggio', account_name: 'Victor Baggio AI', account_url: 'https://www.youtube.com/@VictorBaggio-AI', handle: '@VictorBaggio-AI', status: 'active' },
  { id: 'youtube-fernando', platform: 'youtube', owner_name: 'Fernando Tedesco', account_name: 'Fernando Tedesco', account_url: 'https://www.youtube.com/@fernando_tedesco', handle: '@fernando_tedesco', status: 'active' },
  { id: 'instagram-victor', platform: 'instagram', owner_name: 'Victor Baggio', account_name: 'Victor Baggio Instagram', account_url: 'https://www.instagram.com/victor.baggio.ai/', handle: 'victor.baggio.ai', status: 'active' },
];

// Metas não é mais uma aba de Métricas: virou página própria no menu lateral (mode="goals").
const sectionIcons = { overview: BarChart3, linkedin: MessageSquare, youtube: Video, instagram: InstagramGlyph, posts: Activity, videos: Play, accounts: Users, imports: FileClock, settings: Settings };

function validUtcDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftUtcMonths(date, months) {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function defaultDateFilters(rows = []) {
  const dates = rows.map((row) => validUtcDate(row?.published_at)).filter(Boolean).sort((a, b) => b - a);
  const latest = dates[0] || new Date();
  return { from: isoDate(shiftUtcMonths(latest, -12)), to: isoDate(latest) };
}

function defaultContentFilters(data) {
  return defaultDateFilters([
    ...(data?.linkedin || []),
    ...(data?.youtube || []),
    ...(data?.instagram || [])
  ]);
}

function defaultYoutubeFilters(data) {
  return defaultDateFilters(data?.youtube || []);
}

function SourceNotice({ data }) {
  const isSupabase = data.source === 'supabase';

  const allPublishDates = [
    ...(data.linkedin || []).map(p => p.published_at),
    ...(data.youtube || []).map(v => v.published_at),
    ...(data.instagram || []).map(p => p.published_at)
  ].filter(Boolean).sort((a, b) => b.localeCompare(a));

  const latestDateStr = allPublishDates[0]
    ? new Date(allPublishDates[0]).toLocaleDateString('pt-BR')
    : '12/05/2026';

  if (isSupabase) {
    return (
      <div className="cm-source supabase" style={{ borderColor: '#a7f3d0', background: '#f0fdf4', padding: '14px 18px', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: '#d1fae5', color: '#047857', flexShrink: 0 }}>
          <Database size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#065f46', fontSize: '13px' }}>Banco de Dados de Produção Conectado (Supabase)</strong>
          <span style={{ color: '#047857', fontSize: '11.5px', marginTop: 4, lineHeight: 1.4, display: 'block' }}>
            Banco de dados online e sincronizado. Última coleta bem-sucedida: <b>{data.freshness || latestDateStr}</b>. As coletas automáticas rodam diariamente às <b>06:00 (YouTube)</b>, <b>06:30 (LinkedIn)</b> e <b>07:00 (Instagram)</b> via Deno Edge Functions.
          </span>
        </div>
        <span className="cm-status success" style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: '999px', fontSize: '10.5px' }}>
          <span className="spin" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
          Sincronizado
        </span>
      </div>
    );
  }

  return (
    <div className="cm-source local_snapshot" style={{ borderColor: '#fde047', background: '#fefce8', padding: '14px 18px', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: '#fef08a', color: '#a16207', flexShrink: 0 }}>
        <Database size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <strong style={{ color: '#854d0e', fontSize: '13px' }}>Snapshot histórico local (Modo Offline de Demonstração)</strong>
        <span style={{ color: '#713f12', fontSize: '11.5px', marginTop: 4, lineHeight: 1.4, display: 'block' }}>
          Dados locais carregados até <b>{latestDateStr}</b> com <b>{data.linkedin.length} posts no arquivo completo</b>. Para ativar coletas automáticas diárias na nuvem, publique as migrações do Supabase e configure as Edge Functions. Os agendamentos automáticos rodarão diariamente às 06:00 (YouTube), 06:30 (LinkedIn) e 07:00 (Instagram).
        </span>
      </div>
      <span className="cm-source-reason" style={{ alignSelf: 'center', color: '#854d0e', background: '#fef08a', borderColor: '#fef08a' }}>
        Schema ainda não publicado
      </span>
    </div>
  );
}

function CreatorToggle({ selectedOwner, onChange }) {
  return <div className="cm-creator-toggle" aria-label="Filtro de criador">
    {creators.map((creator) => {
      const active = (selectedOwner || '') === creator.owner;
      return <button key={creator.id || 'all'} type="button" className={active ? 'active' : ''} onClick={() => onChange(creator.owner)} aria-pressed={active} aria-label={`Ver ${creator.label}`}>
        {creator.photo ? <img src={creator.photo} alt={creator.owner} /> : <span className="cm-avatar-stack"><img src={victorPhoto} alt="" /><img src={fernandoPhoto} alt="" /></span>}
        <span>{creator.label}</span>
      </button>;
    })}
  </div>;
}

// Números atuais de seguidores/inscritos por pessoa. A coleta diária de perfil
// começou em 02/07/2026, então o gráfico de linha fica quase vazio no início —
// esta faixa garante que a seção mostre o estado atual desde o primeiro dia.
function GrowthCurrentStrip({ growth, platform, metric = 'followers', label = 'seguidores' }) {
  const rows = (growth || []).filter((g) => g.platform === platform && g[metric] != null && Number(g[metric]) > 0);
  if (!rows.length) return null;
  const byOwner = new Map();
  rows.forEach((g) => {
    const previous = byOwner.get(g.owner_name);
    if (!previous || String(g.metric_date) > String(previous.metric_date)) byOwner.set(g.owner_name, g);
  });
  const chips = [...byOwner.values()].sort((a, b) => Number(b[metric]) - Number(a[metric]));
  const collectedDays = new Set(rows.map((g) => String(g.metric_date))).size;
  const firstDate = rows.reduce((min, g) => (!min || String(g.metric_date) < min ? String(g.metric_date) : min), null);
  // A nota vive junto do texto descritivo do painel (linha própria, largura toda),
  // e não dentro da faixa de cards — ali ela ficava espremida e quebrava em duas
  // linhas no meio do vazio entre a descrição e os cards.
  return (
    <>
      {collectedDays < 8 && firstDate && (
        <p className="cm-growth-note">
          Coleta diária ativa desde {new Date(firstDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} — o histórico do gráfico se forma a cada dia.
        </p>
      )}
      <div className="cm-growth-strip">
        {chips.map((g) => (
          <div className="cm-growth-chip" key={g.owner_name}>
            <span>{g.owner_name}</span>
            <strong>{Number(g[metric]).toLocaleString('pt-BR')}</strong>
            <small>{label} · {new Date(String(g.metric_date)).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function DeltaBadge({ delta, previousMonthLabel }) {
  if (delta == null) return <em className="cm-delta neutral">sem base em {previousMonthLabel}</em>;
  const up = delta >= 0;
  return <em className={`cm-delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(delta)}% vs {previousMonthLabel}</em>;
}

const platformLabels = { linkedin: 'LinkedIn', youtube: 'YouTube', instagram: 'Instagram' };

function ExecutiveCards({ summary, monthly }) {
  const top = monthly.topPlatform;
  const cards = [
    { label: `Conteúdos em ${monthly.monthLabel}`, value: integer.format(monthly.current.posts), delta: monthly.postsDelta },
    { label: `Engagement em ${monthly.monthLabel}`, value: integer.format(monthly.current.engagement), delta: monthly.engagementDelta },
    { label: `Comentários em ${monthly.monthLabel}`, value: integer.format(monthly.current.comments), delta: monthly.commentsDelta },
    { label: 'Média conteúdos/semana', value: decimal.format(summary.averagePostsPerWeek), note: 'no período filtrado' },
    { label: 'Dias desde último conteúdo', value: summary.daysSinceLastPost == null ? '—' : integer.format(summary.daysSinceLastPost), note: 'todas as plataformas' },
    { label: 'Plataforma destaque do mês', value: top ? (platformLabels[top.platform] || top.platform) : '—', note: top ? `${integer.format(top.posts)} conteúdos em ${monthly.monthLabel}` : 'sem conteúdos no mês' },
  ];
  return <div className="cm-executive-cards">{cards.map((card) => (
    <div className="cm-executive-card" key={card.label}>
      <span>{card.label}</span>
      <strong>{card.value}</strong>
      {card.delta !== undefined
        ? <DeltaBadge delta={card.delta} previousMonthLabel={monthly.previousMonthLabel} />
        : <em className="cm-delta neutral">{card.note}</em>}
    </div>
  ))}</div>;
}

function Overview({ filtered, allPosts, data, filters, setFilters }) {
  const [selectedPlatform, setSelectedPlatform] = useState('all'); // 'all', 'linkedin', 'youtube', 'instagram'
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [distributionView, setDistributionView] = useState('frequency'); // 'frequency' | 'followers'
  const [followersPeriod, setFollowersPeriod] = useState('daily'); // 'daily' | 'weekly'

  const handleDateClick = (dayInfo) => {
    if (selectedDate && selectedDate.date === dayInfo.date) {
      setSelectedDate(null);
    } else {
      setSelectedDate(dayInfo);
      setSelectedWeek(null);
    }
  };

  const handleWeekClick = (weekInfo) => {
    if (selectedWeek && selectedWeek.week === weekInfo.week) {
      setSelectedWeek(null);
    } else {
      setSelectedWeek(weekInfo);
      setSelectedDate(null);
    }
  };

  const handlePlatformClick = (platform, event) => {
    setSelectedDate(null);
    setSelectedWeek(null);

    const isCtrl = event.ctrlKey || event.metaKey;

    if (platform === 'all') {
      setSelectedPlatform('all');
      return;
    }

    if (!isCtrl) {
      setSelectedPlatform(platform);
      return;
    }

    // Ctrl click logic: if 'all', holding Ctrl deselects the clicked platform, leaving the others
    if (selectedPlatform === 'all') {
      const others = ['linkedin', 'youtube', 'instagram'].filter(p => p !== platform);
      setSelectedPlatform(others.join(','));
    } else {
      const activeList = selectedPlatform.split(',').filter(Boolean);
      if (activeList.includes(platform)) {
        const updated = activeList.filter(p => p !== platform);
        if (updated.length === 0 || updated.length === 3) {
          setSelectedPlatform('all');
        } else {
          setSelectedPlatform(updated.join(','));
        }
      } else {
        const updated = [...activeList, platform];
        if (updated.length === 3) {
          setSelectedPlatform('all');
        } else {
          setSelectedPlatform(updated.join(','));
        }
      }
    }
  };

  const platformFiltered = useMemo(() => {
    if (selectedPlatform === 'all') return filtered;
    const activeList = selectedPlatform.split(',');
    return filtered.filter(item => activeList.includes(item.platform));
  }, [filtered, selectedPlatform]);

  const interactiveFiltered = useMemo(() => {
    if (selectedDate) {
      return platformFiltered.filter(item => {
        const itemDateStr = String(item.published_at || '').slice(0, 10);
        return itemDateStr === selectedDate.date;
      });
    }
    if (selectedWeek) {
      return platformFiltered.filter(item => {
        if (!item.published_at) return false;
        const itemDate = new Date(item.published_at);
        return isoWeekKey(itemDate) === selectedWeek.week;
      });
    }
    return platformFiltered;
  }, [platformFiltered, selectedDate, selectedWeek]);

  const stableSummary = buildExecutiveSummary(platformFiltered, filters);
  const interactiveSummary = buildExecutiveSummary(interactiveFiltered, filters);
  
  const summary = {
    ...interactiveSummary,
    postsLast30Days: stableSummary.postsLast30Days,
    averagePostsPerWeek: stableSummary.averagePostsPerWeek,
    daysSinceLastPost: stableSummary.daysSinceLastPost,
    cadenceTrend: stableSummary.cadenceTrend,
  };
  
  const monthly = buildMonthlyComparison(platformFiltered);
  const weekly = buildWeeklyCadence(platformFiltered);
  // Preenchido dia a dia por todo o período do filtro (às vezes 1 ano) ia gerar
  // centenas de barras vazias — os últimos 30 dias é o que dá pra comparar de
  // forma legível com o gráfico de seguidores, que só tem coleta diária recente.
  const daily = buildDailyCadence(platformFiltered).slice(-30);
  // Mesma granularidade do toggle Diário/Semanal do gráfico de seguidores, pra
  // as datas do eixo X baterem entre os dois gráficos (syncId="weekly-metrics").
  const cadenceData = followersPeriod === 'daily' ? daily : weekly;
  const heatmap = buildCalendarHeatmap(platformFiltered);
  const comparison = buildCreatorComparison(interactiveFiltered);
  const networkGrowth = useMemo(
    () => buildNetworkGrowthSeries(data.growth, followersPeriod),
    [data.growth, followersPeriod],
  );
  const youtubeViews = data.youtube.reduce((sum, video) => sum + Number(video.views || 0), 0);

  const activeFilterLabel = selectedDate 
    ? `Dia: ${selectedDate.label}` 
    : selectedWeek 
      ? `Semana: ${selectedWeek.label}` 
      : null;

  return <>
    <div className="cm-executive-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
      <div><span className="cm-eyebrow">Filtro principal</span><h2>Victor, Fernando ou Playbook total</h2></div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <CreatorToggle selectedOwner={filters.owner || ''} onChange={(owner) => setFilters({ ...filters, owner })} />
        <div className="cm-creator-toggle cm-platform-toggle" style={{ margin: 0 }} aria-label="Filtro de plataforma">
          <button type="button" className={`platform-all ${selectedPlatform === 'all' ? 'active' : ''}`} onClick={(e) => handlePlatformClick('all', e)} aria-label="Todas">
            <AllIcon size={15} />
          </button>
          <button type="button" className={`platform-linkedin ${selectedPlatform === 'all' ? '' : selectedPlatform.split(',').includes('linkedin') ? 'active' : ''}`} onClick={(e) => handlePlatformClick('linkedin', e)} aria-label="LinkedIn">
            <LinkedInIcon size={15} />
          </button>
          <button type="button" className={`platform-youtube ${selectedPlatform === 'all' ? '' : selectedPlatform.split(',').includes('youtube') ? 'active' : ''}`} onClick={(e) => handlePlatformClick('youtube', e)} aria-label="YouTube">
            <YouTubeIcon size={15} />
          </button>
          <button type="button" className={`platform-instagram ${selectedPlatform === 'all' ? '' : selectedPlatform.split(',').includes('instagram') ? 'active' : ''}`} onClick={(e) => handlePlatformClick('instagram', e)} aria-label="Instagram">
            <InstagramGlyph size={15} />
          </button>
        </div>
      </div>
    </div>
    <ContentFilters filters={filters} onChange={setFilters} posts={allPosts} hideOwner hideCta />
    
    {activeFilterLabel && (
      <div 
        className="cm-interactive-filter-banner" 
        style={{ 
          background: '#eff6ff', 
          border: '1px solid #bfdbfe', 
          borderRadius: '8px', 
          padding: '10px 16px', 
          marginBottom: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          fontSize: '13px', 
          color: '#1e3a8a',
          fontWeight: 500
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} />
          <span>Filtro gráfico ativo: <strong>{activeFilterLabel}</strong> ({interactiveFiltered.length} conteúdos encontrados)</span>
        </div>
        <button 
          onClick={() => { setSelectedDate(null); setSelectedWeek(null); }}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            padding: '4px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            marginLeft: 'auto'
          }}
        >
          Limpar filtro do gráfico
        </button>
      </div>
    )}

    <ExecutiveCards summary={summary} monthly={monthly} />
    <section className="cm-panel cm-hero-chart">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Cadência</span>
          <h2>{followersPeriod === 'daily' ? 'Conteúdos por dia' : 'Conteúdos por semana'}</h2>
          <p>Victor vs Fernando vs Total Playbook. Este é o gráfico central para saber se a frequência aumentou ou caiu.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="cm-period-toggle" role="tablist" aria-label="Período do gráfico de seguidores por rede">
            <button type="button" role="tab" aria-selected={followersPeriod === 'daily'} className={followersPeriod === 'daily' ? 'active' : ''} onClick={() => setFollowersPeriod('daily')}>Diário</button>
            <button type="button" role="tab" aria-selected={followersPeriod === 'weekly'} className={followersPeriod === 'weekly' ? 'active' : ''} onClick={() => setFollowersPeriod('weekly')}>Semanal</button>
          </div>
          <small>{followersPeriod === 'daily' ? `${daily.length} dias` : `${weekly.length} semanas`}</small>
        </div>
      </div>
      <WeeklyCadenceChart data={cadenceData} onWeekClick={handleWeekClick} selectedWeek={selectedWeek?.week} periodLabel={followersPeriod === 'daily' ? 'dias' : 'semanas'} />
    </section>
    <div className="cm-primary-grid">
      <section className="cm-panel">
        <div className="cm-section-heading">
          <div>
            <span className="cm-eyebrow">Distribuição</span>
            <h2>{distributionView === 'followers' ? 'Seguidores por rede' : 'Frequência diária'}</h2>
            <p>{distributionView === 'followers' ? 'Total de seguidores/inscritos de cada rede ao longo do tempo.' : 'Consistência de conteúdos dia a dia ao longo do ano.'}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {distributionView !== 'followers' && <small>{heatmap.days.length} dias</small>}
            <div className="cm-period-toggle" role="tablist" aria-label="Tipo de gráfico de distribuição">
              <button type="button" role="tab" aria-selected={distributionView === 'frequency'} className={distributionView === 'frequency' ? 'active' : ''} onClick={() => setDistributionView('frequency')}>Frequência</button>
              <button type="button" role="tab" aria-selected={distributionView === 'followers'} className={distributionView === 'followers' ? 'active' : ''} onClick={() => setDistributionView('followers')}>Seguidores</button>
            </div>
          </div>
        </div>
        {distributionView === 'followers'
          ? (networkGrowth.length
            ? <NetworkFollowersChart data={networkGrowth} />
            : <div className="cm-empty-chart">Ainda não há coletas de seguidores suficientes para este período.</div>)
          : <CalendarHeatmapChart data={heatmap} onDateClick={handleDateClick} selectedDate={selectedDate?.date} platform={selectedPlatform} />}
      </section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Resultado</span><h2>{followersPeriod === 'daily' ? 'Engagement por dia' : 'Engagement por semana'}</h2></div></div><WeeklyEngagementChart data={cadenceData} onWeekClick={handleWeekClick} selectedWeek={selectedWeek?.week} /></section>
    </div>
    
    <section className="cm-panel">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Desempenho</span>
          <h2>{activeFilterLabel ? `Conteúdos em destaque (${activeFilterLabel})` : 'Top conteúdos por score'}</h2>
        </div>
      </div>
      <TopContentTable rows={rankContent(interactiveFiltered, 'engagement_score', activeFilterLabel ? 100 : 10)} />
    </section>

    <div className="cm-analysis-grid">
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Formato</span><h2>Formato por média de score</h2></div></div><PerformanceBars rows={groupPerformance(interactiveFiltered, 'format')} valueKey="averageScore" label="Score médio/post" /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Criadores</span><h2>Victor vs Fernando</h2></div></div><CreatorComparisonChart data={comparison} /></section>
    </div>
    {youtubeViews > 0 && <div className="cm-table-note">YouTube já coletado: {integer.format(youtubeViews)} views acumuladas nos vídeos monitorados.</div>}
  </>;
}

function LinkedinAnalysis({ filtered, allPosts, data, filters, setFilters }) {
  const [selectedWeek, setSelectedWeek] = useState(null);

  const handleWeekClick = (weekInfo) => {
    if (selectedWeek && selectedWeek.week === weekInfo.week) {
      setSelectedWeek(null);
    } else {
      setSelectedWeek(weekInfo);
    }
  };

  const interactiveFiltered = useMemo(() => {
    if (selectedWeek) {
      return filtered.filter(item => {
        if (!item.published_at) return false;
        const itemDate = new Date(item.published_at);
        return isoWeekKey(itemDate) === selectedWeek.week;
      });
    }
    return filtered;
  }, [filtered, selectedWeek]);

  const metrics = aggregateContentMetrics(interactiveFiltered);
  const weekly = buildWeeklyCadence(filtered);

  const filteredGrowth = useMemo(() => {
    if (!data?.growth) return [];
    const linkedinGrowth = data.growth.filter(g => g.platform === 'linkedin' || (!g.platform && g.followers !== undefined));
    const grouped = {};
    linkedinGrowth.forEach(g => {
      const date = g.metric_date;
      if (!grouped[date]) {
        grouped[date] = { metric_date: date };
      }
      if (filters.owner) {
        if (g.owner_name === filters.owner) {
          grouped[date]["followers"] = Number(g.followers || 0);
        }
      } else {
        grouped[date][g.owner_name] = Number(g.followers || 0);
      }
    });
    return Object.values(grouped).sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  }, [data?.growth, filters.owner]);

  const growthSection = filteredGrowth.length ? (
    <section className="cm-panel">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Seguidores</span>
          <h2>Crescimento de contas</h2>
          <p>Evolução do número total de seguidores no LinkedIn ao longo do tempo.</p>
        </div>
      </div>
      <GrowthCurrentStrip growth={data.growth} platform="linkedin" />
      <AccountGrowthChart data={filteredGrowth} />
    </section>
  ) : null;

  const activeFilterLabel = selectedWeek ? `Semana: ${selectedWeek.label}` : null;

  return <>
    <div className="cm-executive-toolbar compact"><CreatorToggle selectedOwner={filters.owner || ''} onChange={(owner) => setFilters({ ...filters, owner })} /></div>
    <ContentFilters filters={filters} onChange={setFilters} posts={allPosts} advanced hideOwner />
    
    {activeFilterLabel && (
      <div 
        className="cm-interactive-filter-banner" 
        style={{ 
          background: '#eff6ff', 
          border: '1px solid #bfdbfe', 
          borderRadius: '8px', 
          padding: '10px 16px', 
          marginBottom: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          fontSize: '13px', 
          color: '#1e3a8a',
          fontWeight: 500
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} />
          <span>Filtro gráfico ativo: <strong>{activeFilterLabel}</strong> ({interactiveFiltered.length} posts encontrados)</span>
        </div>
        <button 
          onClick={() => { setSelectedWeek(null); }}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            padding: '4px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            marginLeft: 'auto'
          }}
        >
          Limpar filtro do gráfico
        </button>
      </div>
    )}

    <MetricStrip metrics={metrics} />
    <section className="cm-panel cm-hero-chart">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Cadência</span>
          <h2>Posts por semana</h2>
          <p>Frequência de publicação semanal dos posts no LinkedIn.</p>
        </div>
        <small>{weekly.length} semanas</small>
      </div>
      <WeeklyCadenceChart data={weekly} onWeekClick={handleWeekClick} selectedWeek={selectedWeek?.week} />
    </section>
    {growthSection}
    <div className="cm-analysis-grid">
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Formato</span><h2>O que mais performa</h2></div></div><PerformanceBars rows={groupPerformance(interactiveFiltered, 'format')} valueKey="averageScore" label="Score médio/post" /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">CTA</span><h2>Comentários por chamada</h2></div></div><PerformanceBars rows={groupPerformance(interactiveFiltered, 'cta_keyword')} valueKey="comments" label="Comentários" /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Tema</span><h2>Performance temática</h2></div></div><PerformanceBars rows={groupPerformance(interactiveFiltered, 'theme')} valueKey="comments" label="Comentários" /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Estratégia</span><h2>Frequência vs resultado</h2></div></div><FrequencyResultScatter data={weekly} /></section>
    </div>
    <TopContentTable rows={rankContent(interactiveFiltered, 'comments', activeFilterLabel ? 100 : 10)} metric="comments" title={activeFilterLabel ? `Top posts por comentários (${activeFilterLabel})` : "Top posts por comentários"} />
  </>;
}

const collectorCopy = {
  YouTube: { icon: Video, text: 'Configure APIFY_TOKEN e APIFY_YOUTUBE_ACTOR_ID no backend para coletar canais, vídeos, views, comentários e inscritos sem expor chave no front-end.' },
  Instagram: { icon: InstagramGlyph, text: 'Configure APIFY_TOKEN e APIFY_INSTAGRAM_ACTOR_ID no backend e rode a coleta (npm run collect:apify -- --platform instagram --write-local) para trazer posts e reels de victor.baggio.ai.' },
  LinkedIn: { icon: Activity, text: 'Configure APIFY_TOKEN e APIFY_LINKEDIN_ACTOR_ID no backend para buscar novos posts e atualizar métricas diariamente.' },
};

function EmptyCollector({ platform, onSettings }) {
  const copy = collectorCopy[platform] || collectorCopy.LinkedIn;
  const Icon = copy.icon;
  return <div className="cm-collector-empty"><div className="cm-empty-icon"><Icon size={28} /></div><span className="cm-eyebrow">Coleta aguardando Apify</span><h2>{platform}</h2><p>{copy.text}</p><button type="button" onClick={onSettings}><Settings size={15} /> Abrir configurações</button></div>;
}

function InstagramSection({ data, filtered, allPosts, filters, setFilters, onSettings, client }) {
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState('');

  // Crescimento diário de seguidores (coletado pela collect-instagram no cron).
  // Mesmo padrão das seções LinkedIn/YouTube: uma linha por pessoa no gráfico.
  const filteredGrowth = useMemo(() => {
    if (!data?.growth) return [];
    const instagramGrowth = data.growth.filter(g => g.platform === 'instagram');
    const grouped = {};
    instagramGrowth.forEach(g => {
      const date = g.metric_date;
      if (!grouped[date]) grouped[date] = { metric_date: date };
      grouped[date][g.owner_name] = Number(g.followers || 0);
    });
    return Object.values(grouped).sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  }, [data?.growth]);

  const growthSection = filteredGrowth.length ? (
    <section className="cm-panel">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Seguidores</span>
          <h2>Crescimento de contas</h2>
          <p>Evolução do número total de seguidores no Instagram, coletado diariamente.</p>
        </div>
      </div>
      <GrowthCurrentStrip growth={data.growth} platform="instagram" />
      <AccountGrowthChart data={filteredGrowth} />
    </section>
  ) : null;

  const pullNow = async () => {
    if (!client?.functions?.invoke) { setPullMsg('Coleta manual indisponível no modo offline.'); return; }
    setPulling(true); setPullMsg('');
    try {
      const { data: res, error } = await client.functions.invoke('collect-instagram', { body: { manual: true } });
      if (error) throw error;
      setPullMsg(`Sincronização concluída: ${res?.itemsProcessed ?? 0} item(s). Atualize a página para ver.`);
    } catch (e) {
      setPullMsg(`Falha na coleta: ${e?.message || e}`);
    } finally {
      setPulling(false);
    }
  };
  if (!data.instagram.length) return <>{growthSection}<EmptyCollector platform="Instagram" onSettings={onSettings} /></>;
  const metrics = aggregateContentMetrics(filtered);
  const weekly = buildWeeklyContentTypeCadence(filtered);
  return <>
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, background: 'transparent', marginBottom: 4 }}>
      {pullMsg && <span style={{ fontSize: 12, color: '#475569' }}>{pullMsg}</span>}
      <button type="button" onClick={pullNow} disabled={pulling}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0a66c2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: pulling ? 'default' : 'pointer', opacity: pulling ? 0.7 : 1 }}
        title="Dispara uma coleta agora. Útil para capturar Stories enquanto estão no ar.">
        <RefreshCw size={14} className={pulling ? 'spin' : ''} /> {pulling ? 'Sincronizando…' : 'Sincronizar'}
      </button>
    </div>
    <ContentFilters filters={filters} onChange={setFilters} posts={allPosts} advanced hideOwner />
    <MetricStrip metrics={metrics} />
    <section className="cm-panel cm-hero-chart">
      <div className="cm-section-heading"><div><span className="cm-eyebrow">Cadência</span><h2>Publicações por semana</h2><p>Stories separados de Reels + Publicações (feed permanente).</p></div><small>{weekly.length} semanas</small></div>
      <WeeklyContentTypeChart data={weekly} />
    </section>
    {growthSection}
    <div className="cm-analysis-grid">
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Formato</span><h2>Reel · Story · Carrossel · Imagem</h2></div></div><PerformanceBars rows={groupPerformance(filtered, 'format')} valueKey="averageScore" label="Score médio/post" /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">CTA</span><h2>Comentários por chamada</h2></div></div><PerformanceBars rows={groupPerformance(filtered, 'cta_keyword')} valueKey="comments" label="Comentários" /></section>
    </div>
    <TopContentTable rows={rankContent(filtered, 'engagement_score', 20)} title="Top conteúdos do Instagram" />
  </>;
}

function YoutubeSection({ data, videos, filters, setFilters, onSettings }) {
  const filteredGrowth = useMemo(() => {
    if (!data?.growth) return [];
    const youtubeGrowth = data.growth.filter(g => g.platform === 'youtube' || (!g.platform && (g.subscribers !== undefined || g.total_views !== undefined)));
    const grouped = {};
    youtubeGrowth.forEach(g => {
      const date = g.metric_date;
      if (!grouped[date]) {
        grouped[date] = { metric_date: date };
      }
      if (filters.owner) {
        if (g.owner_name === filters.owner) {
          grouped[date]["subscribers"] = Number(g.subscribers || 0);
          if (g.total_views) grouped[date]["total_views"] = Number(g.total_views || 0);
        }
      } else {
        grouped[date][g.owner_name] = Number(g.subscribers || 0);
      }
    });
    return Object.values(grouped).sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  }, [data?.growth, filters.owner]);

  const growthSection = filteredGrowth.length ? (
    <section className="cm-panel">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Canal</span>
          <h2>Crescimento de contas</h2>
          <p>Evolução de inscritos e views totais do YouTube.</p>
        </div>
      </div>
      <GrowthCurrentStrip growth={data.growth} platform="youtube" metric="subscribers" label="inscritos" />
      <AccountGrowthChart data={filteredGrowth} />
    </section>
  ) : null;

  if (!data.youtube.length) return <>{growthSection}<EmptyCollector platform="YouTube" onSettings={onSettings} /></>;
  const totals = aggregateYoutubeMetrics(videos);
  const trend = buildMonthlyTrend(videos.map((video) => ({ ...video, engagement_total: video.engagement_total || 0, shares: 0 })));
  return <><YoutubeFilters filters={filters} onChange={setFilters} videos={data.youtube} /><div className="cm-metric-strip"><div className="cm-metric"><span>Vídeos</span><strong>{totals.videos}</strong></div><div className="cm-metric"><span>Views</span><strong>{integer.format(totals.views)}</strong></div><div className="cm-metric"><span>Likes</span><strong>{integer.format(totals.likes)}</strong></div><div className="cm-metric"><span>Comentários</span><strong>{integer.format(totals.comments)}</strong></div><div className="cm-metric"><span>Engagement</span><strong>{integer.format(totals.engagement)}</strong></div><div className="cm-metric"><span>Taxa média</span><strong>{totals.engagementRate.toLocaleString('pt-BR')}%</strong></div></div><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Publicação</span><h2>Vídeos publicados por mês</h2></div><small>{trend.length} períodos</small></div><ContentTrendChart data={trend} metric="posts" color="#e52d27" /></section>{growthSection}<YoutubeVideosTable rows={[...videos].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 50)} title="Top vídeos por views" /></>;
}

// ————— Prospecção: banco de leads (Fase 3) —————
// Lista quem comentou nos posts e virou lead. Default mostra os qualificados
// (decisão da call de 04/07: "esses 700 eu não preciso ver" — os demais existem no
// banco só pro de-para, mas dá pra inspecioná-los pelos filtros).

// "Revisar" foi extinto (decisão de 05/07): limítrofe entra em Aprovados com a
// ressalva no motivo — o Victor decide na lista se prospecta ou não.
const leadFilterChips = [
  { id: 'qualified', label: 'Aprovados' },
  { id: 'pending', label: 'Aguardando análise' },
  { id: 'disqualified', label: 'Descartados' },
  { id: 'all', label: 'Todos' },
];

const leadStatusSets = {
  qualified: ['qualified', 'review'],
  pending: ['pending'],
  disqualified: ['disqualified'],
};

const seniorityLabels = { 'c-level': 'C-Level', diretoria: 'Diretoria', gerencia: 'Gerência', coordenacao: 'Coordenação', operacional: 'Operacional', desconhecido: '—' };

function MessageModal({ lead, message, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard bloqueado */ }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(560px, 100%)', boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }} onClick={(e) => e.stopPropagation()}>
        <span className="cm-eyebrow">Mensagem de 1º contato</span>
        <h2 style={{ margin: '4px 0 12px', fontSize: 17 }}>{lead?.full_name || 'Lead'}</h2>
        <textarea readOnly value={message} style={{ width: '100%', minHeight: 160, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, fontSize: 13.5, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', color: '#0f172a' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
          <button type="button" onClick={copy} style={{ background: copied ? '#059669' : '#0a66c2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{copied ? 'Copiado ✓' : 'Copiar mensagem'}</button>
        </div>
      </div>
    </div>
  );
}

// Modal de configuração do ICP + mensagem padrão. O agente de qualificação usa
// exatamente o texto de "Critérios" salvo aqui; a mensagem usa os placeholders
// {nome}, {company} e {tema_post}. Salvar vale já pra próxima análise, sem deploy.
function IcpSettingsModal({ settings, client, onClose, onNotice, onReload }) {
  const [rules, setRules] = useState(settings?.icp_rules || '');
  const [template, setTemplate] = useState(settings?.message_template || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!client?.functions?.invoke) { onNotice('Indisponível no modo offline.'); return; }
    setSaving(true);
    try {
      const { data: res, error } = await client.functions.invoke('lead-outreach', { body: { manual: true, action: 'save_settings', icpRules: rules, messageTemplate: template } });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || 'Falha ao salvar');
      onNotice('ICP e mensagem salvos. Valem já pra próxima análise de leads.');
      await onReload?.();
      onClose();
    } catch (e) {
      onNotice(`Falha ao salvar configurações: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };
  const fieldStyle = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', color: '#0f172a' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(680px, 100%)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }} onClick={(e) => e.stopPropagation()}>
        <span className="cm-eyebrow">Configuração da prospecção</span>
        <h2 style={{ margin: '4px 0 4px', fontSize: 17 }}>ICP — critérios de qualificação</h2>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#64748b' }}>É este texto, literalmente, que o agente de IA usa pra aprovar/rejeitar/revisar cada lead. Edite à vontade (ex.: mudar o corte de 200+ colaboradores) — vale na próxima análise.</p>
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={11} style={fieldStyle} />
        <h2 style={{ margin: '18px 0 4px', fontSize: 17 }}>Mensagem padrão de 1º contato</h2>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#64748b' }}>Enviada exatamente como está, preenchendo <code>{'{nome}'}</code>, <code>{'{company}'}</code> e <code>{'{tema_post}'}</code>. Se ficar vazia, a IA improvisa uma mensagem contextual.</p>
        <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={8} style={fieldStyle} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={save} disabled={saving} style={{ background: '#0a66c2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// Miniatura pequena de um post (usada no dropdown de filtro por post).
function PostMiniThumb({ post, size = 34 }) {
  const [failed, setFailed] = useState(false);
  const base = { width: size, height: size, borderRadius: 6, flexShrink: 0, objectFit: 'cover', border: '1px solid #e2e8f0' };
  if (!failed && post?.media_url && post.media_type === 'image') {
    return <img src={post.media_url} alt="" loading="lazy" onError={() => setFailed(true)} style={base} />;
  }
  if (!failed && post?.media_url && post.media_type === 'video') {
    return <video src={`${post.media_url}#t=0.1`} muted playsInline preload="metadata" onError={() => setFailed(true)} style={base} />;
  }
  const Glyph = post?.format === 'video' || post?.media_type === 'video' ? Video : post?.format === 'text' ? FileText : ImageIcon;
  return <span style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef2f7', color: '#94a3b8' }}><Glyph size={16} /></span>;
}

// Filtro por post COM foto: um select nativo não mostra imagem, então é um dropdown
// custom (botão + popover) com a miniatura + autor + hook de cada post que tem lead.
// Rótulo de progresso de análise de um post: "12/12 analisados" (verde quando
// terminou) ou "8/12 analisados · faltam 4". Retorna null se não houver contagem.
function PostAnalysisTag({ count }) {
  if (!count || !count.total) return null;
  const analyzed = count.total - count.pending;
  const done = count.pending === 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: done ? '#057642' : '#b45309', whiteSpace: 'nowrap' }}>
      {done ? '✓ ' : ''}{analyzed}/{count.total} analisados{done ? '' : ` · faltam ${count.pending}`}
    </span>
  );
}

function PostPhotoFilter({ options, value, onChange, counts = {} }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const selected = options.find((p) => p.id === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Filtrar por post"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', fontSize: 12.5, color: '#334155', background: '#fff', cursor: 'pointer', maxWidth: 420 }}>
        {selected ? <PostMiniThumb post={selected} size={26} /> : null}
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
          {selected ? String(selected.hook).slice(0, 46) : 'Post: todos'}
        </span>
        {selected && <PostAnalysisTag count={counts[selected.id]} />}
        <span style={{ color: '#94a3b8' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: '110%', left: 0, width: 440, maxHeight: 340, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 12px 30px rgba(15,23,42,0.15)', padding: 6 }}>
          <button type="button" onClick={() => { onChange(''); setOpen(false); }}
            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 10px', border: 'none', background: !value ? '#eff6ff' : 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155', textAlign: 'left' }}>
            Todos os posts
          </button>
          {options.map((post) => (
            <button key={post.id} type="button" onClick={() => { onChange(post.id); setOpen(false); }}
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 10px', border: 'none', background: value === post.id ? '#eff6ff' : 'transparent', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
              <PostMiniThumb post={post} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ display: 'block', fontSize: 12.5, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(post.hook).slice(0, 60)}</strong>
                <small style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#94a3b8' }}>
                  {post.owner ? post.owner.split(' ')[0] : '—'}
                  <PostAnalysisTag count={counts[post.id]} />
                </small>
              </span>
            </button>
          ))}
          {!options.length && <div style={{ padding: 12, fontSize: 12.5, color: '#94a3b8' }}>Nenhum post com lead ainda.</div>}
        </div>
      )}
    </div>
  );
}

function LeadsSection({ data, client, onNotice, onReload }) {
  const [filter, setFilter] = useState('qualified');
  const [postFilter, setPostFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, qualified, status: 'running'|'done'|'error', message }
  const [analyzingIds, setAnalyzingIds] = useState(() => new Set()); // leads no lote em análise agora
  const [sortConfig, setSortConfig] = useState({ key: 'score', direction: 'desc' });
  const stopEnrichRef = React.useRef(false);
  const [busyLead, setBusyLead] = useState('');
  const [modal, setModal] = useState(null); // { lead, message }
  const [showIcpModal, setShowIcpModal] = useState(false);
  const [outreachOverrides, setOutreachOverrides] = useState({});

  const leads = data?.leads || [];
  const outreachByLead = useMemo(() => {
    const map = {};
    (data?.leadOutreach || []).forEach((o) => { map[o.lead_id] = o; });
    return { ...map, ...outreachOverrides };
  }, [data?.leadOutreach, outreachOverrides]);

  const postsById = useMemo(() => {
    const map = {};
    (data?.linkedin || []).forEach((post) => {
      if (post.id) map[post.id] = { hook: post.hook || post.content?.slice(0, 60) || '', owner: post.owner_name || '', media_url: post.media_url, media_type: post.media_type, format: post.format };
    });
    return map;
  }, [data?.linkedin]);
  const postHookById = useMemo(() => {
    const map = {};
    Object.entries(postsById).forEach(([id, post]) => { map[id] = post.hook; });
    return map;
  }, [postsById]);

  const counts = useMemo(() => ({
    qualified: leads.filter((l) => leadStatusSets.qualified.includes(l.qualification_status)).length,
    pending: leads.filter((l) => l.qualification_status === 'pending').length,
    disqualified: leads.filter((l) => l.qualification_status === 'disqualified').length,
    all: leads.length,
  }), [leads]);

  // Comentário mais recente de cada lead (o "comentário feito" da lista do escopo).
  const commentByLead = useMemo(() => {
    const map = {};
    (data?.leadComments || [])
      .slice()
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .forEach((c) => { map[c.lead_id] = c; });
    return map;
  }, [data?.leadComments]);

  // Post de origem de um lead: o comentário mais recente ganha do first_seen.
  const leadPostId = (lead) => commentByLead[lead.id]?.post_id || lead.first_seen_post_id;

  // Quantos leads cada post tem e quantos ainda faltam analisar (enrichment
  // pendente). "analisado" = já passou pelo enriquecimento (enriched/skipped/error).
  const postCounts = useMemo(() => {
    const map = {};
    leads.forEach((lead) => {
      const postId = leadPostId(lead);
      if (!postId) return;
      if (!map[postId]) map[postId] = { total: 0, pending: 0 };
      map[postId].total += 1;
      if (lead.enrichment_status === 'pending') map[postId].pending += 1;
    });
    return map;
  }, [leads, commentByLead]);

  // Opções do filtro por post: só posts que têm lead.
  const postOptions = useMemo(() => {
    const seen = new Map();
    leads.forEach((lead) => {
      const postId = leadPostId(lead);
      if (postId && postsById[postId] && !seen.has(postId)) seen.set(postId, postsById[postId]);
    });
    return [...seen.entries()].map(([id, post]) => ({ id, ...post }));
  }, [leads, commentByLead, postsById]);

  // Valor de ordenação por coluna (o nome do lead, empresa etc. são texto; score e
  // porte são número). Comentário/post usam o texto correspondente.
  const sortValue = (lead, key) => {
    switch (key) {
      case 'full_name': return (lead.full_name || lead.public_identifier || '').toLowerCase();
      case 'score': return lead.score == null ? -1 : lead.score;
      case 'job_title': return (lead.job_title || lead.headline || '').toLowerCase();
      case 'company_name': return (lead.company_name || '').toLowerCase();
      case 'company_size': return lead.company_size == null ? -1 : lead.company_size;
      case 'comment': return (commentByLead[lead.id]?.comment_text || '').toLowerCase();
      case 'post': return (postHookById[leadPostId(lead)] || '').toLowerCase();
      default: return '';
    }
  };

  const visible = useMemo(() => {
    let list = filter === 'all' ? leads : leads.filter((l) => (leadStatusSets[filter] || []).includes(l.qualification_status));
    if (postFilter) list = list.filter((l) => leadPostId(l) === postFilter);
    if (creatorFilter) list = list.filter((l) => postsById[leadPostId(l)]?.owner === creatorFilter);
    const sorted = [...list].sort((a, b) => {
      const av = sortValue(a, sortConfig.key);
      const bv = sortValue(b, sortConfig.key);
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [leads, filter, postFilter, creatorFilter, commentByLead, postsById, sortConfig]);

  const requestSort = (key) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };
  const sortArrow = (key) => (sortConfig.key !== key ? ' ↕' : sortConfig.direction === 'asc' ? ' ▲' : ' ▼');

  // Fila pendente na ordem que o backend processa (mais antigos primeiro).
  const pendingQueue = useMemo(() => (
    leads
      .filter((l) => l.enrichment_status === 'pending')
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  ), [leads]);
  // Se há filtro de post/criador ativo, a fila a analisar é só a daquele recorte —
  // o botão "Analisar fila" processa exatamente o que está filtrado na tela. Sem
  // filtro, é a fila inteira (comportamento de antes).
  const hasQueueFilter = Boolean(postFilter || creatorFilter);
  const filteredPendingQueue = useMemo(() => {
    if (!hasQueueFilter) return pendingQueue;
    return pendingQueue.filter((l) => {
      if (postFilter && leadPostId(l) !== postFilter) return false;
      if (creatorFilter && postsById[leadPostId(l)]?.owner !== creatorFilter) return false;
      return true;
    });
  }, [pendingQueue, hasQueueFilter, postFilter, creatorFilter, commentByLead, postsById]);
  const pendingEnrichment = filteredPendingQueue.length;
  const analysisPlan = useMemo(() => buildLeadAnalysisPlan({ pending: pendingEnrichment }), [pendingEnrichment]);

  // Analisa a fila INTEIRA em lotes até zerar. O backend processa os mais antigos
  // primeiro, então a ordem do snapshot inicial da fila = ordem de processamento:
  // usamos isso pra destacar na tabela exatamente quais leads estão sendo analisados
  // agora. Lotes pequenos evitam o timeout de gateway que travava o clique.
  const runEnrich = async () => {
    if (!client?.functions?.invoke) { onNotice('Enriquecimento indisponível no modo offline.'); return; }
    stopEnrichRef.current = false;
    setEnriching(true);
    setFilter('pending'); // mostra os que vão ser analisados
    const queue = filteredPendingQueue; // snapshot estável na ordem de processamento (respeita o filtro de post)
    const total = queue.length;
    // Quando há filtro ativo, restringe a análise aos leads daquele post. Snapshot
    // dos ids no início: o backend processa esse subconjunto lote a lote.
    const scopedLeadIds = hasQueueFilter ? queue.map((l) => l.id) : null;
    const plan = buildLeadAnalysisPlan({ pending: total });
    let done = 0;
    let qualifiedTotal = 0;
    let rateLimitStreak = 0;
    setProgress({ status: 'running', done, total, qualified: qualifiedTotal, etaLabel: plan.etaLabel, retryAfterSeconds: plan.retryAfterSeconds });
    setAnalyzingIds(new Set(queue.slice(0, plan.batchSize).map((l) => l.id)));
    try {
      // Sem teto de tentativas: a fila roda até zerar ou até o "Parar". Se o Google
      // limitar/erra, a espera só cresce (computeRateLimitBackoff). O cap alto do
      // for é só uma trava de segurança contra loop patológico.
      for (let batch = 0; batch < 5000; batch += 1) {
        const { data: res, error } = await client.functions.invoke('enrich-leads', { body: { manual: true, limit: plan.batchSize, ...(scopedLeadIds ? { leadIds: scopedLeadIds } : {}) } });
        if (error) throw error;
        if (res?.busy) throw new Error(res.error || 'Já existe uma análise em andamento.');
        if (!res?.success) throw new Error(res?.error || 'Falha no enriquecimento');
        done += (res.processed || 0) + (res.prefiltered || 0);
        qualifiedTotal += res.qualified || 0;
        const remaining = res.remaining ?? 0;
        const nextPlan = buildLeadAnalysisPlan({
          pending: remaining,
          batchSize: res.recommendedBatchSize || plan.batchSize,
          secondsPerLead: res.estimatedSecondsPerLead || plan.secondsPerLead,
          retryAfterSeconds: res.retryAfterSeconds || plan.retryAfterSeconds,
        });
        setProgress({ status: 'running', done, total: Math.max(total, done + remaining), qualified: qualifiedTotal, etaLabel: nextPlan.etaLabel, retryAfterSeconds: nextPlan.retryAfterSeconds });
        setAnalyzingIds(new Set(queue.slice(done, done + nextPlan.batchSize).map((l) => l.id)));
        // Recarrega a cada lote: os leads analisados já aparecem na lista.
        await onReload?.().catch(() => {});
        if (remaining <= 0) break;
        if (stopEnrichRef.current) break;
        if ((res.errors || []).length && !res.processed && !res.rateLimited) throw new Error(res.errors[0]?.error || 'Lote falhou por completo');
        // Google limitou/erra (429/503/cota): NÃO aborta a fila. A cada erro
        // consecutivo a espera cresce (computeRateLimitBackoff) — "colocar um tempo
        // maior pra continuar; o importante é terminar a lista". Só o "Parar" corta.
        if (res.rateLimited) {
          rateLimitStreak += 1;
          const waitSeconds = computeRateLimitBackoff(rateLimitStreak, nextPlan.retryAfterSeconds);
          setProgress({ status: 'running', done, total: Math.max(total, done + remaining), qualified: qualifiedTotal, note: `Google limitou o ritmo (${rateLimitStreak}ª vez seguida) — aguardando ${waitSeconds}s antes de continuar. A lista não para, só desacelera. Clique em "Parar" se quiser interromper.` });
          // waitForLeadAnalysisRetry checa stopEnrichRef a cada segundo, então
          // "Parar após este lote" interrompe a espera na hora em vez de travar
          // até o timer acabar (bug reportado em 05/07).
          const outcome = await waitForLeadAnalysisRetry(waitSeconds, stopEnrichRef);
          if (outcome === 'stopped') break;
        } else {
          rateLimitStreak = 0;
        }
      }
      setProgress({ status: 'done', done, total: done, qualified: qualifiedTotal });
      setFilter('qualified'); // volta pros aprovados no fim
    } catch (e) {
      setProgress({ status: 'error', done, total, qualified: qualifiedTotal, message: String(e?.message || e) });
    } finally {
      setEnriching(false);
      setAnalyzingIds(new Set());
      await onReload?.().catch(() => {});
    }
  };

  const generateMessage = async (lead) => {
    if (!client?.functions?.invoke) { onNotice('Geração de mensagem indisponível no modo offline.'); return; }
    const existing = outreachByLead[lead.id];
    if (existing?.generated_message) { setModal({ lead, message: existing.generated_message }); return; }
    setBusyLead(lead.id);
    try {
      const { data: res, error } = await client.functions.invoke('lead-outreach', { body: { manual: true, action: 'generate_message', leadId: lead.id } });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || 'Falha ao gerar mensagem');
      setOutreachOverrides((prev) => ({ ...prev, [lead.id]: { ...(outreachByLead[lead.id] || {}), lead_id: lead.id, generated_message: res.message, status: res.status || 'new' } }));
      setModal({ lead, message: res.message });
    } catch (e) {
      onNotice(`Falha ao gerar mensagem: ${e?.message || e}`);
    } finally {
      setBusyLead('');
    }
  };

  // Marca prospectado/ignorado (toggle: repetir volta pra "new"). Otimista na tela,
  // desfaz se a API falhar.
  const setOutreachStatus = async (lead, targetStatus) => {
    if (!client?.functions?.invoke) { onNotice('Indisponível no modo offline.'); return; }
    const current = outreachByLead[lead.id]?.status || 'new';
    const nextStatus = current === targetStatus ? 'new' : targetStatus;
    setOutreachOverrides((prev) => ({ ...prev, [lead.id]: { ...(outreachByLead[lead.id] || {}), lead_id: lead.id, status: nextStatus } }));
    try {
      const { data: res, error } = await client.functions.invoke('lead-outreach', { body: { manual: true, action: 'set_status', leadId: lead.id, status: nextStatus } });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || 'Falha ao atualizar status');
    } catch (e) {
      setOutreachOverrides((prev) => ({ ...prev, [lead.id]: { ...(outreachByLead[lead.id] || {}), lead_id: lead.id, status: current } }));
      onNotice(`Falha ao atualizar status: ${e?.message || e}`);
    }
  };

  return (
    <section className="cm-table-section">
      {/* ── Toolbar: heading + criador + ações agrupadas ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 18px 0' }}>
        <div>
          <span className="cm-eyebrow">Banco de leads</span>
          <h2 style={{ fontSize: 14, letterSpacing: '-.015em', marginTop: 3 }}>Quem comentou e virou lead</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="cm-creator-toggle compact" aria-label="Filtrar por criador" style={{ margin: 0 }}>
            {[{ owner: '', label: 'Ambos', photo: null }, { owner: 'Victor Baggio', label: 'Victor', photo: victorPhoto }, { owner: 'Fernando Tedesco', label: 'Fernando', photo: fernandoPhoto }].map((c) => (
              <button key={c.label} type="button" className={creatorFilter === c.owner ? 'active' : ''} onClick={() => { setCreatorFilter(c.owner); setPostFilter(''); }} aria-pressed={creatorFilter === c.owner}>
                {c.photo ? <img src={c.photo} alt={c.label} /> : <span className="cm-avatar-stack"><img src={victorPhoto} alt="" /><img src={fernandoPhoto} alt="" /></span>}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <span style={{ width: 1, height: 28, background: '#e2e8f0', flexShrink: 0 }} />
          <button type="button" onClick={() => setShowIcpModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'border-color .15s, background .15s' }}
            title="Ver e editar os critérios que o agente usa pra qualificar + a mensagem padrão"
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0a66c2'; e.currentTarget.style.background = '#f0f7fd'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}>
            <Settings size={13} /> Ver/editar ICP
          </button>
          {pendingEnrichment > 0 && !enriching && (
            <button type="button" onClick={runEnrich}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0a66c2', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(10,102,194,.18)', transition: 'background .15s, box-shadow .15s' }}
              title={hasQueueFilter
                ? `Roda profile + empresa + agente de qualificação só nos leads pendentes do filtro atual (post/criador), em lotes. Estimativa: ~${analysisPlan.etaLabel}.`
                : `Roda profile + empresa + agente de qualificação em todos os leads pendentes, em lotes. Estimativa: ~${analysisPlan.etaLabel}.`}
              onMouseEnter={e => { e.currentTarget.style.background = '#084e96'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0a66c2'; }}>
              <RefreshCw size={13} />
              {`${hasQueueFilter ? 'Analisar filtro' : 'Analisar fila'} (${integer.format(pendingEnrichment)}) · ~${analysisPlan.etaLabel}`}
            </button>
          )}
          {enriching && (
            <button type="button" onClick={() => { stopEnrichRef.current = true; }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              title="Termina o lote atual e para">
              Parar após este lote
            </button>
          )}
          {/* Filtro ativo, nada pendente: o post/criador já foi todo analisado. */}
          {pendingEnrichment === 0 && !enriching && hasQueueFilter && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e7f6ee', color: '#057642', border: '1px solid #a3d9b1', borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <Check size={13} /> {postFilter ? 'Post já analisado' : 'Filtro já analisado'}
            </span>
          )}
          <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', paddingLeft: 2 }}>{integer.format(visible.length)} leads</span>
        </div>
      </div>

      {/* ── Progress banner ── */}
      {progress && (
        <div style={{
          background: progress.status === 'error' ? '#fef2f2' : progress.status === 'done' ? '#f0fdf4' : '#eff6ff',
          border: `1px solid ${progress.status === 'error' ? '#fecaca' : progress.status === 'done' ? '#bbf7d0' : '#bfdbfe'}`,
          borderRadius: 10, padding: '12px 16px', margin: '14px 18px 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: progress.status === 'error' ? '#b91c1c' : progress.status === 'done' ? '#065f46' : '#1e3a8a' }}>
            {progress.status === 'running' && <RefreshCw size={15} className="spin" />}
            {progress.status === 'running' && `Analisando leads… ${integer.format(progress.done)} de ${integer.format(progress.total)} concluídos · ${integer.format(progress.qualified)} aprovados até agora${progress.etaLabel ? ` · faltam ~${progress.etaLabel}` : ''}`}
            {progress.status === 'done' && `Análise concluída: ${integer.format(progress.done)} leads analisados, ${integer.format(progress.qualified)} aprovados no ICP.`}
            {progress.status === 'error' && `Análise parou com erro após ${integer.format(progress.done)} leads: ${progress.message}`}
            <button type="button" onClick={() => setProgress(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
              {progress.status === 'running' ? 'Ocultar' : 'Fechar'}
            </button>
          </div>
          {progress.status === 'running' && (
            <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: '#dbeafe', overflow: 'hidden' }}>
              <div className="cm-progress-fill" style={{ width: `${progress.total ? Math.max(4, Math.round((progress.done / progress.total) * 100)) : 4}%`, height: '100%', borderRadius: 999 }} />
            </div>
          )}
          {progress.status === 'running' && progress.note && (
            <small style={{ display: 'block', marginTop: 6, color: '#b45309', fontWeight: 600 }}>{progress.note}</small>
          )}
          {progress.status === 'running' && (
            <small style={{ display: 'block', marginTop: 6, color: '#3b5a90' }}>
              Ritmo seguro: {analysisPlan.batchSize} lead(s) por lote, com pausa automática quando o Gemini devolve limite de taxa. Os leads em análise agora estão destacados na lista abaixo — pode continuar navegando.
            </small>
          )}
        </div>
      )}

      {/* ── Filtros: post + status chips ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 18px 4px' }}>
        {/* Post filter + limpar */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <PostPhotoFilter
            options={postOptions.filter((p) => !creatorFilter || p.owner === creatorFilter)}
            value={postFilter}
            onChange={setPostFilter}
            counts={postCounts}
          />
          {(postFilter || creatorFilter) && (
            <button type="button" onClick={() => { setPostFilter(''); setCreatorFilter(''); }}
              style={{ background: 'transparent', border: 'none', color: '#0a66c2', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
              Limpar filtros
            </button>
          )}
        </div>
        {/* Linha 2: chips de status */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {leadFilterChips.map((chip) => {
            const isActive = filter === chip.id;
            const chipColors = {
              qualified: { bg: '#e7f6ee', border: '#a3d9b1', color: '#057642', activeBg: '#057642', activeColor: '#fff' },
              pending: { bg: '#fff9e6', border: '#fde4ad', color: '#92650e', activeBg: '#b47d11', activeColor: '#fff' },
              disqualified: { bg: '#fef2f2', border: '#fecaca', color: '#b42318', activeBg: '#b42318', activeColor: '#fff' },
              all: { bg: '#f8fafc', border: '#e2e8f0', color: '#475569', activeBg: '#334155', activeColor: '#fff' },
            };
            const c = chipColors[chip.id] || chipColors.all;
            return (
              <button key={chip.id} type="button" onClick={() => setFilter(chip.id)}
                style={{
                  border: `1px solid ${isActive ? c.activeBg : c.border}`,
                  background: isActive ? c.activeBg : c.bg,
                  color: isActive ? c.activeColor : c.color,
                  borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all .15s ease',
                  boxShadow: isActive ? `0 2px 8px ${c.activeBg}33` : 'none',
                }}>
                {chip.label} · {integer.format(counts[chip.id])}
              </button>
            );
          })}
        </div>
      </div>
      {!visible.length ? (
        <div className="cm-empty">
          {counts.all === 0
            ? 'Nenhum lead ainda. Rode "Prospectar" num post acima para raspar quem comentou.'
            : 'Nenhum lead neste filtro.'}
        </div>
      ) : (
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead><tr>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('full_name')}>Lead{sortArrow('full_name')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} title="Score 0-100 do agente de qualificação" onClick={() => requestSort('score')}>Score{sortArrow('score')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('job_title')}>Cargo{sortArrow('job_title')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('company_name')}>Empresa{sortArrow('company_name')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('company_size')}>Porte{sortArrow('company_size')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('comment')}>Comentário feito{sortArrow('comment')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('post')}>Post de origem{sortArrow('post')}</th>
              <th title="Motivo da decisão + ângulo sugerido de abordagem">Motivo / ângulo</th><th>Mensagem</th><th style={{ textAlign: 'center' }}>Prospectado</th><th style={{ textAlign: 'center' }}>Ignorar</th>
            </tr></thead>
            <tbody>
              {visible.map((lead) => {
                const outreach = outreachByLead[lead.id];
                const prospected = outreach?.status === 'prospected';
                const ignored = outreach?.status === 'ignored';
                const comment = commentByLead[lead.id];
                const analyzing = analyzingIds.has(lead.id);
                return (
                  <tr key={lead.id} className={analyzing ? 'cm-prospect-running-row' : undefined} style={(prospected || ignored) ? { opacity: 0.55 } : undefined}>
                    <td>
                      <strong>{lead.full_name || lead.public_identifier || '—'}</strong>
                      {lead.profile_url && <a className="cm-open" href={lead.profile_url} target="_blank" rel="noreferrer" aria-label={`Abrir perfil de ${lead.full_name || 'lead'}`} style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}><ExternalLink size={13} /></a>}
                      {analyzing && <small style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, color: '#1d4ed8', fontWeight: 600 }}><RefreshCw size={11} className="spin" /> analisando…</small>}
                      {ignored && <small style={{ display: 'block', color: '#94a3b8' }}>Ignorado</small>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {lead.score != null
                        ? <strong style={{ color: lead.score >= 70 ? '#059669' : lead.score >= 40 ? '#d97706' : '#94a3b8' }}>{lead.score}</strong>
                        : '—'}
                    </td>
                    <td style={{ maxWidth: 200 }}><span title={lead.headline || ''}>{lead.job_title || lead.headline || '—'}</span>{lead.area && lead.area !== 'desconhecido' && <small style={{ display: 'block', color: '#94a3b8' }}>{lead.area}{seniorityLabels[lead.seniority] && seniorityLabels[lead.seniority] !== '—' ? ` · ${seniorityLabels[lead.seniority]}` : ''}</small>}</td>
                    <td>{lead.company_name || (lead.enrichment_status === 'enriched' ? 'Sem emprego atual' : '—')}</td>
                    <td>{lead.company_size ? integer.format(lead.company_size) : '—'}</td>
                    <td style={{ maxWidth: 220 }}><small style={{ color: '#475569' }} title={comment?.comment_text || ''}>{comment?.comment_text ? `“${String(comment.comment_text).slice(0, 90)}${String(comment.comment_text).length > 90 ? '…' : ''}”` : '—'}</small></td>
                    <td style={{ maxWidth: 180 }}><small>{postHookById[comment?.post_id || lead.first_seen_post_id] || '—'}</small></td>
                    <td style={{ maxWidth: 260 }}>
                      <small style={{ color: '#64748b' }}>{lead.qualification_reason || (lead.enrichment_status === 'pending' ? 'Aguardando análise' : '—')}</small>
                      {lead.suggested_angle && <small style={{ display: 'block', color: '#0a66c2', fontStyle: 'italic', marginTop: 3 }} title="Ângulo sugerido de abordagem">→ {lead.suggested_angle}</small>}
                    </td>
                    <td>
                      <button type="button" onClick={() => generateMessage(lead)} disabled={busyLead === lead.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: outreach?.generated_message ? '#f1f5f9' : '#0a66c2', color: outreach?.generated_message ? '#334155' : '#fff', border: 'none', borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {busyLead === lead.id ? <RefreshCw size={12} className="spin" /> : <MessageSquare size={12} />}
                        {busyLead === lead.id ? 'Gerando…' : outreach?.generated_message ? 'Ver mensagem' : 'Gerar mensagem'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={prospected} onChange={() => setOutreachStatus(lead, 'prospected')} aria-label={`Marcar ${lead.full_name || 'lead'} como prospectado`} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#059669' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => setOutreachStatus(lead, 'ignored')} aria-label={`${ignored ? 'Reativar' : 'Ignorar'} ${lead.full_name || 'lead'}`} title={ignored ? 'Reativar lead' : 'Ignorar lead (não prospectar)'}
                        style={{ background: ignored ? '#fee2e2' : '#f1f5f9', color: ignored ? '#b91c1c' : '#64748b', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                        {ignored ? 'Reativar' : 'Ignorar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal && <MessageModal lead={modal.lead} message={modal.message} onClose={() => setModal(null)} />}
      {showIcpModal && <IcpSettingsModal settings={data?.prospectSettings} client={client} onClose={() => setShowIcpModal(false)} onNotice={onNotice} onReload={onReload} />}
    </section>
  );
}

function PostsSection({ filtered, allPosts, filters, setFilters, onAction, prospecting, runningIds, onProspect, showProspecting = false }) {
  return <><div className="cm-executive-toolbar compact"><CreatorToggle selectedOwner={filters.owner || ''} onChange={(owner) => setFilters({ ...filters, owner })} /></div><ContentFilters filters={filters} onChange={setFilters} posts={allPosts} compact advanced hideOwner /><OperationalPostsTable rows={rankContent(filtered, 'engagement_score', 250)} onAction={onAction} prospecting={prospecting} runningIds={runningIds} onProspect={onProspect} showProspecting={showProspecting} /></>;
}

function VideosSection({ data, onSettings }) {
  if (!data.youtube.length) return <EmptyCollector platform="YouTube" onSettings={onSettings} />;
  return <YoutubeVideosTable rows={data.youtube} />;
}

// ─── Metas / Objetivos de crescimento ──────────────────────────────────────
// As metas ficam na tabela `content_goals` do Supabase (não no navegador): assim
// tanto o Felipe quanto o Victor conseguem abrir o app e editar a mesma meta.
const GOAL_PLATFORMS = [
  { id: 'linkedin', label: 'LinkedIn', metric: 'followers', unit: 'seguidores', Icon: LinkedInIcon, color: '#0a66c2', emoji: '🔵' },
  { id: 'youtube', label: 'YouTube', metric: 'subscribers', unit: 'inscritos', Icon: YouTubeIcon, color: '#e52d27', emoji: '🔴' },
  { id: 'instagram', label: 'Instagram', metric: 'followers', unit: 'seguidores', Icon: InstagramGlyph, color: '#c13584', emoji: '🟣' },
];

// Soma seguidores/inscritos de todas as pessoas por rede e por dia (total da
// marca, não de uma pessoa só), depois converte pra QUANTO CRESCEU de um ponto
// pro outro — não o total acumulado, que ia parecer um número absurdo (a soma
// de Victor + Fernando) e crescente sem parar. 'weekly' primeiro reduz a 1
// ponto por semana ISO (última coleta da semana) e só depois calcula a
// variação semana a semana.
function buildNetworkGrowthSeries(growth, period = 'daily') {
  const byDate = new Map();
  (growth || []).forEach((g) => {
    const platform = GOAL_PLATFORMS.find((p) => p.id === g.platform);
    if (!platform) return;
    const value = Number(g[platform.metric]);
    if (!Number.isFinite(value) || value <= 0) return;
    const date = String(g.metric_date);
    const row = byDate.get(date) || { metric_date: date };
    row[platform.label] = (row[platform.label] || 0) + value;
    byDate.set(date, row);
  });
  const daily = [...byDate.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const networkKeys = GOAL_PLATFORMS.map((p) => p.label);

  const toDeltas = (rows) => rows.map((row, index) => {
    const prev = rows[index - 1];
    const out = { metric_date: row.metric_date, week: row.week, label: row.label };
    networkKeys.forEach((key) => {
      if (row[key] == null || !prev || prev[key] == null) return;
      out[key] = row[key] - prev[key];
    });
    return out;
  }).slice(1); // o primeiro ponto não tem "anterior" pra comparar

  // `label` usa o mesmo formato de WeeklyCadenceChart/WeeklyEngagementChart (dd/mm
  // da segunda-feira da semana), pra alinhar com o eixo X delas via syncId.
  if (period !== 'weekly') return toDeltas(daily.map((row) => ({ ...row, label: shortDay(row.metric_date) })));

  const byWeek = new Map();
  daily.forEach((row) => {
    const week = isoWeekKey(new Date(`${row.metric_date}T00:00:00Z`));
    byWeek.set(week, { ...row, week, label: weekLabel(week) }); // `daily` está em ordem crescente, então a última coleta da semana sobrescreve
  });
  return toDeltas([...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)));
}

// Converte as linhas de `content_goals` (platform, owner_name, month_key, target)
// num mapa { "linkedin:Victor Baggio:2026-07": 22000 } fácil de consultar na UI.
function goalsMapFromRows(rows) {
  const map = {};
  (rows || []).forEach((g) => {
    map[goalKey(g.platform, g.owner_name, g.month_key)] = g.target;
  });
  return map;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || String(name || '');
}

// Metas são por mês: a chave guarda plataforma + pessoa + mês (YYYY-MM), então
// cada mês tem seu próprio alvo e o histórico não se perde ao virar o mês.
function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date = new Date()) {
  return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
}

function goalKey(platformId, owner, mKey = monthKey()) {
  return `${platformId}:${owner}:${mKey}`;
}

// '2026-06-26' -> '26/06'. Data tratada como UTC pra não escorregar um dia.
function shortDay(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return m && d ? `${d}/${m}` : String(iso);
}

// Consolida o crescimento de uma rede: por pessoa (última medição + variação em
// relação à coleta anterior) e o total da rede. Usa data.growth, que só traz
// coletas automáticas (o histórico importado é excluído no repository).
//
// `mKey` (YYYY-MM) define o mês da meta. Para medir progresso é preciso saber o
// número que a pessoa já tinha quando o mês começou — senão 20.965 seguidores
// numa meta de 22.000 apareceriam como "95% da meta" no dia 1º, mesmo sem ter
// crescido nada. A base é a última coleta ANTES do dia 1º (o número que a pessoa
// levou para dentro do mês); se não houver, cai na coleta mais antiga do mês.
export function summarizeGrowth(growth, platform, metric, mKey = monthKey()) {
  const monthStartIso = `${mKey}-01`;
  const rows = (growth || []).filter((g) => g.platform === platform && g[metric] != null && Number(g[metric]) > 0);
  const byOwner = new Map();
  rows.forEach((g) => {
    const list = byOwner.get(g.owner_name) || [];
    list.push(g);
    byOwner.set(g.owner_name, list);
  });
  const owners = [...byOwner.entries()].map(([owner, list]) => {
    const sorted = list.slice().sort((a, b) => String(b.metric_date).localeCompare(String(a.metric_date)));
    const seen = new Set();
    const distinct = [];
    for (const g of sorted) {
      const d = String(g.metric_date);
      if (!seen.has(d)) { seen.add(d); distinct.push(g); }
    }
    const latest = distinct[0];
    const prev = distinct[1];
    const current = Number(latest[metric]);
    const dailyDelta = prev ? current - Number(prev[metric]) : null;
    // Variação semanal: compara com a coleta mais recente que já tenha 7+ dias.
    const latestTime = Date.parse(`${latest.metric_date}T00:00:00Z`);
    const weekAgo = latestTime - 7 * 86400000;
    const weekRef = distinct.find((g) => Date.parse(`${g.metric_date}T00:00:00Z`) <= weekAgo);
    const weeklyDelta = weekRef ? current - Number(weekRef[metric]) : null;

    // Base do mês: `distinct` está em ordem decrescente, então o primeiro registro
    // anterior ao dia 1º é justamente a última coleta antes do mês virar.
    const beforeMonth = distinct.find((g) => String(g.metric_date) < monthStartIso);
    const inMonth = distinct.filter((g) => String(g.metric_date) >= monthStartIso);
    const baseRow = beforeMonth || inMonth[inMonth.length - 1] || null;
    const monthStart = baseRow ? Number(baseRow[metric]) : null;

    return {
      owner,
      short: firstName(owner),
      current,
      currentDate: latest.metric_date,
      dailyDelta,
      weeklyDelta,
      weeklyRefDate: weekRef ? weekRef.metric_date : null,
      monthStart,
      monthStartDate: baseRow ? baseRow.metric_date : null,
      // 'before' = número real levado para dentro do mês. 'first-in-month' = não
      // havia coleta antes do dia 1º, então usamos a primeira do próprio mês (o
      // crescimento anterior a ela fica de fora da conta).
      monthStartSource: baseRow ? (beforeMonth ? 'before' : 'first-in-month') : null,
      monthGain: monthStart == null ? null : current - monthStart,
    };
  }).sort((a, b) => b.current - a.current);
  const latestDate = owners.reduce((max, o) => (!max || String(o.currentDate) > max ? String(o.currentDate) : max), null);
  return { owners, latestDate, hasData: owners.length > 0 };
}

function formatDeltaSuffix(delta) {
  if (delta == null) return '';
  if (delta > 0) return ` (+${integer.format(delta)})`;
  if (delta < 0) return ` (${integer.format(delta)})`;
  return ' (0)';
}

function deltaClass(delta) {
  if (delta == null) return 'neutral';
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'neutral';
}

// Barra de progresso desenhada com blocos, já que o WhatsApp não formata gráfico.
// Ex.: 10% -> '█░░░░░░░░░'. Arredonda pra baixo pra não mostrar bloco cheio antes
// da hora, mas garante ao menos 1 bloco quando já houve qualquer crescimento.
export function progressBar(pct, size = 10) {
  const safe = Math.max(0, Math.min(100, Number(pct) || 0));
  let filled = Math.floor((safe / 100) * size);
  if (filled === 0 && safe > 0) filled = 1;
  if (filled === size && safe < 100) filled = size - 1;
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

// Monta a mensagem pronta pro grupo do WhatsApp: crescimento por rede, com o
// número de cada pessoa (Victor e Fernando), a variação do período escolhido
// (diária ou semanal) e o progresso rumo à meta do mês. É só copiar e colar.
export function buildGoalsWhatsappMessage(platformSummaries, goals, period = 'daily', mKey = monthKey(), mLabel = monthLabel()) {
  const today = new Date().toLocaleDateString('pt-BR');
  const periodLabel = period === 'weekly' ? 'Semanal (últimos 7 dias)' : 'Diário';
  const lines = [`📊 *Crescimento das redes* — ${periodLabel} (${today})`, ''];
  platformSummaries.forEach(({ platform, summary }) => {
    if (!summary.hasData) return;
    lines.push(`${platform.emoji} *${platform.label}*`);
    summary.owners.forEach((o) => {
      const delta = period === 'weekly' ? o.weeklyDelta : o.dailyDelta;
      const goal = Number(goals[goalKey(platform.id, o.owner, mKey)]) || 0;
      lines.push(`• ${o.short}: ${integer.format(o.current)} ${platform.unit}${formatDeltaSuffix(delta)}`);
      if (goal > 0) {
        // Progresso do mês: cresceu X do que precisa crescer (não o total absoluto).
        const needed = o.monthStart == null ? null : goal - o.monthStart;
        if (o.current >= goal) {
          lines.push(`   ${progressBar(100)} 100%`);
          lines.push(`   🎉 meta de ${integer.format(goal)} batida!`);
        } else if (needed > 0) {
          const pct = Math.max(0, Math.min(100, Math.floor((o.monthGain / needed) * 100)));
          lines.push(`   ${progressBar(pct)} ${pct}%`);
          lines.push(`   +${integer.format(o.monthGain)} de ${integer.format(needed)} · meta ${integer.format(goal)}`);
        } else {
          // Sem base do mês, ou meta abaixo do número que a pessoa já tinha.
          lines.push(`   Meta ${mLabel}: ${integer.format(goal)}`);
        }
      }
    });
    lines.push('');
  });
  return lines.join('\n').trim();
}

function MetasSection({ data, client }) {
  // Metas vêm do Supabase (data.goals). O que você digita fica só na tela
  // (goalOverrides) até clicar em "Salvar metas" — nada é gravado sozinho.
  const baseGoals = useMemo(() => goalsMapFromRows(data.goals), [data.goals]);
  const [goalOverrides, setGoalOverrides] = useState({});
  const goals = useMemo(() => ({ ...baseGoals, ...goalOverrides }), [baseGoals, goalOverrides]);
  // O que já foi gravado nesta sessão. `data.goals` não é recarregado após salvar,
  // então sem isso o "está alterado?" compararia com o valor do load inicial —
  // e voltar ao número antigo pareceria "sem alteração" sem nunca gravar.
  const [persistedOverrides, setPersistedOverrides] = useState({});
  const persistedGoals = useMemo(() => ({ ...baseGoals, ...persistedOverrides }), [baseGoals, persistedOverrides]);
  // Metas editadas e ainda não gravadas: key -> { platformId, owner, target }
  const [pendingGoals, setPendingGoals] = useState({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [copied, setCopied] = useState(false);
  const pendingCount = Object.keys(pendingGoals).length;

  const [period, setPeriod] = useState('daily');
  const mKey = monthKey();
  const mLabel = monthLabel();

  const summaries = useMemo(
    () => GOAL_PLATFORMS.map((platform) => ({ platform, summary: summarizeGrowth(data.growth, platform.id, platform.metric, mKey) })),
    [data.growth, mKey],
  );
  const hasAnyData = summaries.some((s) => s.summary.hasData);

  const message = useMemo(() => buildGoalsWhatsappMessage(summaries, goals, period, mKey, mLabel), [summaries, goals, period, mKey, mLabel]);
  const [draft, setDraft] = useState(message);
  useEffect(() => { setDraft(message); }, [message]);

  const persistGoal = async (platformId, owner, target) => (
    target == null
      ? client.from('content_goals').delete().eq('platform', platformId).eq('owner_name', owner).eq('month_key', mKey)
      : client.from('content_goals').upsert(
          { platform: platformId, owner_name: owner, month_key: mKey, target },
          { onConflict: 'platform,owner_name,month_key' },
        )
  );

  // Só mexe no estado local: a gravação acontece no botão "Salvar metas".
  const updateGoal = (platformId, owner, value) => {
    const key = goalKey(platformId, owner, mKey);
    const target = value === '' ? null : Math.max(0, Math.trunc(Number(value) || 0));
    setGoalOverrides((prev) => ({ ...prev, [key]: target === null ? '' : target }));
    setJustSaved(false);
    setSaveError('');
    setPendingGoals((prev) => {
      const next = { ...prev };
      // Se voltou ao valor que já está no banco, deixa de ser uma alteração pendente.
      const savedTarget = persistedGoals[key] == null || persistedGoals[key] === '' ? null : Number(persistedGoals[key]);
      if (savedTarget === target) delete next[key];
      else next[key] = { platformId, owner, target };
      return next;
    });
  };

  const saveGoals = async () => {
    if (!client?.from) { setSaveError('Conecte o Supabase para salvar metas.'); return; }
    if (!pendingCount || saving) return;
    setSaving(true);
    setSaveError('');
    const entries = Object.entries(pendingGoals);
    const results = await Promise.all(entries.map(([, g]) => persistGoal(g.platformId, g.owner, g.target)));
    const okEntries = entries.filter((_, i) => !results[i]?.error);

    // Tudo que gravou vira o novo "valor no banco" pra comparação de alterações.
    setPersistedOverrides((prev) => {
      const next = { ...prev };
      okEntries.forEach(([key, g]) => { next[key] = g.target === null ? '' : g.target; });
      return next;
    });
    setPendingGoals((prev) => {
      const next = { ...prev };
      okEntries.forEach(([key]) => delete next[key]);
      return next;
    });
    setSaving(false);

    // Mantém pendentes só as que não gravaram, pra um novo clique tentar de novo.
    const failedAt = results.findIndex((r) => r?.error);
    if (failedAt !== -1) {
      setSaveError(`Falha ao salvar meta: ${results[failedAt].error.message}`);
      return;
    }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!hasAnyData) {
    return (
      <div className="cm-empty">
        Ainda não há dados de seguidores/inscritos coletados para acompanhar metas. A coleta diária de perfil roda automaticamente e o painel se preenche a cada dia. Defina as metas assim que os primeiros números chegarem.
      </div>
    );
  }

  const deltaOf = (o) => (period === 'weekly' ? o.weeklyDelta : o.dailyDelta);
  const weeklyHasNoData = summaries.every((s) => s.summary.owners.every((o) => o.weeklyDelta == null));

  const periodToggle = (
    <div className="cm-period-toggle" role="tablist" aria-label="Período do resumo">
      <button type="button" role="tab" aria-selected={period === 'daily'} className={period === 'daily' ? 'active' : ''} onClick={() => setPeriod('daily')}>Diário</button>
      <button type="button" role="tab" aria-selected={period === 'weekly'} className={period === 'weekly' ? 'active' : ''} onClick={() => setPeriod('weekly')}>Semanal</button>
    </div>
  );

  return (
    <div className="cm-metas">
      <div className="cm-metas-toolbar">
        <div>
          <span className="cm-eyebrow">Metas do mês · {mLabel}</span>
          <p>Meta de cada pessoa por rede (chegar ao número até o fim do mês). O progresso mede <strong>o que cresceu no mês</strong> sobre o que falta crescer, partindo do número que a pessoa tinha no início de {mLabel} — não o total absoluto. A variação exibida é {period === 'weekly' ? 'dos últimos 7 dias' : 'desde a coleta anterior'}. Depois de alterar, clique em <strong>Salvar metas</strong> — fica no banco, então Felipe, Victor e Fernando veem a mesma meta.</p>
          {saveError && <p className="cm-goal-error">{saveError}</p>}
        </div>
        {periodToggle}
      </div>

      <div className="cm-goal-savebar">
        <button
          type="button"
          className="cm-goal-save-btn"
          onClick={saveGoals}
          disabled={!pendingCount || saving}
        >
          {saving ? 'Salvando…' : 'Salvar metas'}
        </button>
        <span className="cm-goal-save-status">
          {saving
            ? 'Gravando no Supabase…'
            : pendingCount
              ? `${pendingCount} ${pendingCount === 1 ? 'meta alterada' : 'metas alteradas'} — ainda não salva${pendingCount === 1 ? '' : 's'}`
              : justSaved
                ? 'Salvo ✓'
                : 'Nenhuma alteração pendente'}
        </span>
      </div>

      <div className="cm-goal-grid">
        {summaries.map(({ platform, summary }) => {
          const Icon = platform.Icon;
          return (
            <section className="cm-goal-card" key={platform.id}>
              <header className="cm-goal-head" style={{ color: platform.color }}>
                <Icon size={18} />
                <h3>{platform.label}</h3>
              </header>
              {summary.owners.map((o) => {
                const key = goalKey(platform.id, o.owner, mKey);
                const rawGoal = goals[key];
                const goal = Number(rawGoal) || 0;
                const hasBase = o.monthStart != null;
                // Progresso = o que cresceu no mês / o que precisa crescer no mês.
                // Sem isso, quem já começa perto da meta apareceria com 95% no dia 1º.
                const needed = hasBase && goal > 0 ? goal - o.monthStart : 0;
                const gained = hasBase ? o.monthGain : 0;
                const reached = goal > 0 && o.current >= goal;
                const goalBelowBase = hasBase && goal > 0 && needed <= 0;
                const pct = goal <= 0
                  ? 0
                  : !hasBase
                    // Sem base do início do mês só dá pra medir o número absoluto.
                    ? Math.min(100, Math.floor((o.current / goal) * 100))
                    : needed > 0
                      ? Math.max(0, Math.min(100, Math.floor((gained / needed) * 100)))
                      : (reached ? 100 : 0);
                const remaining = goal > 0 ? Math.max(0, goal - o.current) : 0;
                const delta = deltaOf(o);
                return (
                  <div className="cm-goal-person" key={o.owner}>
                    <div className="cm-goal-person-head">
                      <span className="cm-goal-person-name">{o.short}</span>
                      <strong>{integer.format(o.current)}</strong>
                      <small>{platform.unit}</small>
                      {delta != null && <em className={`cm-delta ${deltaClass(delta)}`}>{formatDeltaSuffix(delta).trim()}</em>}
                    </div>
                    <label className="cm-goal-input">
                      <span>Meta {mLabel}{pendingGoals[key] && <em className="cm-goal-dirty">Não salvo</em>}</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={rawGoal ?? ''}
                        onChange={(e) => updateGoal(platform.id, o.owner, e.target.value)}
                        placeholder="Defina a meta"
                      />
                    </label>
                    {hasBase && (
                      <div className="cm-goal-base">
                        <span>Início de {mLabel}: <strong>{integer.format(o.monthStart)}</strong></span>
                        <small>
                          {o.monthStartSource === 'before'
                            ? `medido em ${shortDay(o.monthStartDate)}`
                            : `1ª coleta do mês (${shortDay(o.monthStartDate)})`}
                        </small>
                      </div>
                    )}
                    {goal > 0 ? (
                      <>
                        <div className="cm-goal-bar"><span style={{ width: `${pct}%`, background: platform.color }} /></div>
                        {hasBase ? (
                          <div className="cm-goal-meta">
                            <span>{goalBelowBase ? '—' : `${pct}% da meta`}</span>
                            <span>
                              {reached
                                ? '🎉 meta batida!'
                                : goalBelowBase
                                  ? 'meta abaixo do início do mês'
                                  : `+${integer.format(gained)} de ${integer.format(needed)} no mês`}
                            </span>
                          </div>
                        ) : (
                          <div className="cm-goal-meta">
                            <span>{reached ? '🎉 meta batida!' : `faltam ${integer.format(remaining)}`}</span>
                            <span>sem base do início do mês</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="cm-goal-hint">Defina a meta de {mLabel} para acompanhar.</p>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <section className="cm-panel">
        <div className="cm-section-heading">
          <div>
            <span className="cm-eyebrow">Resumo {period === 'weekly' ? 'semanal' : 'diário'}</span>
            <h2>O que aconteceu em cada rede</h2>
          </div>
          {periodToggle}
        </div>
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr><th>Rede</th><th>Pessoa</th><th>Atual</th><th>Variação ({period === 'weekly' ? '7 dias' : 'dia'})</th><th>{period === 'weekly' ? 'Comparado com' : 'Última coleta'}</th></tr>
            </thead>
            <tbody>
              {summaries.filter((s) => s.summary.hasData).flatMap(({ platform, summary }) =>
                summary.owners.map((o) => {
                  const delta = deltaOf(o);
                  const refDate = period === 'weekly' ? o.weeklyRefDate : o.currentDate;
                  return (
                    <tr key={`${platform.id}-${o.owner}`}>
                      <td><strong>{platform.label}</strong></td>
                      <td>{o.short}</td>
                      <td>{integer.format(o.current)} {platform.unit}</td>
                      <td><span className={`cm-delta ${deltaClass(delta)}`}>{delta == null ? '—' : formatDeltaSuffix(delta).trim()}</span></td>
                      <td>{refDate ? new Date(String(refDate)).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        {period === 'weekly' && weeklyHasNoData && (
          <p className="cm-table-note">A variação semanal aparece quando houver pelo menos 7 dias de coleta acumulados.</p>
        )}
      </section>

      <section className="cm-panel">
        <div className="cm-section-heading">
          <div>
            <span className="cm-eyebrow">WhatsApp</span>
            <h2>Mensagem pronta para o grupo</h2>
          </div>
          <button type="button" className="cm-copy-btn" onClick={copyMessage}>
            {copied ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar mensagem</>}
          </button>
        </div>
        <textarea
          className="cm-whatsapp-box"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(20, draft.split('\n').length + 1)}
          spellCheck={false}
        />
        <p className="cm-table-note">
          A mensagem segue o período selecionado ({period === 'weekly' ? 'semanal' : 'diário'}) e traz o número de cada pessoa (Victor e Fernando) com o progresso da meta do mês. Edite se quiser, copie e cole no grupo do WhatsApp. Quando você me mandar o grupo, dá pra automatizar o envio.
        </p>
      </section>
    </div>
  );
}

function AccountsSection({ data }) {
  const accounts = data.accounts.length ? data.accounts : fallbackAccounts;

  const latestGrowth = useMemo(() => {
    if (!data.growth) return {};
    const map = {};
    data.growth.forEach(g => {
      const current = map[g.account_id];
      if (!current || g.metric_date > current.metric_date) {
        map[g.account_id] = g;
      }
    });
    return map;
  }, [data.growth]);

  return <section className="cm-table-section"><div className="cm-section-heading"><div><span className="cm-eyebrow">Monitoramento</span><h2>Contas</h2></div><small>{accounts.length} contas</small></div><div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>Pessoa</th><th>Plataforma</th><th>Conta</th><th>Audiência</th><th>Handle</th><th>ID externo</th><th>Status</th><th>Última coleta</th><th>Último erro</th><th /></tr></thead><tbody>{accounts.map((account) => {
    const growth = latestGrowth[account.id];
    const audience = account.platform === 'youtube'
      ? (growth?.subscribers ? `${Number(growth.subscribers).toLocaleString('pt-BR')} inscritos` : '—')
      : (growth?.followers ? `${Number(growth.followers).toLocaleString('pt-BR')} seguidores` : '—');
    return <tr key={account.id}><td><strong>{account.owner_name}</strong></td><td>{account.platform}</td><td>{account.account_name}</td><td>{audience}</td><td>{account.handle || '—'}</td><td>{account.external_id || '—'}</td><td><StatusPill status={account.status} /></td><td>{account.last_collected_at || 'Ainda não coletada'}</td><td>{account.last_error || '—'}</td><td><a className="cm-open" href={account.account_url} target="_blank" rel="noreferrer" aria-label={`Abrir conta de ${account.owner_name}`}><ExternalLink size={15} /></a></td></tr>;
  })}</tbody></table></div>{data.source !== 'supabase' && <p className="cm-table-note">Contas previstas na configuração. Publique o schema para editar status e acompanhar erros.</p>}</section>;
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
    ['Apify token', 'APIFY_TOKEN'], ['Apify LinkedIn actor', 'APIFY_LINKEDIN_ACTOR_ID'], ['Apify YouTube actor', 'APIFY_YOUTUBE_ACTOR_ID'], ['Apify Instagram actor', 'APIFY_INSTAGRAM_ACTOR_ID'], ['Classificação', 'CLASSIFICATION_API_KEY'],
  ];
  return <div className="cm-settings-grid"><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Secrets</span><h2>Integrações sem chave no front</h2></div></div><div className="cm-secret-list">{secrets.map(([label, name]) => <div key={name}><span>{label}</span><code>{name}</code><StatusPill status={data.source === 'supabase' ? 'pending' : 'paused'} /></div>)}</div><p className="cm-table-note">Tokens reais nunca são exibidos no frontend. O token da Apify deve ficar só nos Edge Function Secrets.</p></section><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Agenda</span><h2>Coletas automáticas</h2></div></div><div className="cm-schedule"><div><span>YouTube via Apify</span><strong>Todos os dias · 06:00</strong><button onClick={() => run('collect-youtube')} disabled={Boolean(running)}><RefreshCw size={14} className={running === 'collect-youtube' ? 'spin' : ''} /> Executar agora</button></div><div><span>LinkedIn via Apify</span><strong>Todos os dias · 06:30</strong><button onClick={() => run('collect-linkedin')} disabled={Boolean(running)}><RefreshCw size={14} className={running === 'collect-linkedin' ? 'spin' : ''} /> Executar agora</button></div></div>{message && <div className="cm-settings-message">{message}</div>}</section><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Incremental</span><h2>Onde parou e o que entra novo</h2></div></div><div className="cm-config-summary"><div><span>LinkedIn histórico importado</span><strong>12/05/2026</strong></div><div><span>Deduplicação</span><strong>external_post_id / video_id</strong></div><div><span>Novas coletas</span><strong>Upsert + snapshot diário</strong></div><div><span>Classificação</span><strong>Formato, tema, CTA, funil e intenção</strong></div></div><p className="cm-table-note">A coleta consulta os perfis/canais ativos, salva só registros novos ou métricas novas e marca erro por conta quando algum scraper falha.</p></section></div>;
}

export default function ContentMetricsWorkspace({ client, initialData, initialSection = 'overview', onSectionChange, mode = 'full' }) {
  const [section, setSection] = useState(initialSection);
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [filters, setFilters] = useState(() => defaultContentFilters(initialData));
  const [youtubeFilters, setYoutubeFilters] = useState(() => defaultYoutubeFilters(initialData));
  const [instagramFilters, setInstagramFilters] = useState(() => defaultDateFilters(initialData?.instagram || []));
  const [operationMessage, setOperationMessage] = useState('');
  const [prospectOverrides, setProspectOverrides] = useState({});
  const [prospectingRunning, setProspectingRunning] = useState(() => new Set());

  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    if (initialData) return;
    let active = true;
    loadContentMetrics({ supabase: client }).then((result) => { if (active) { setFilters(defaultContentFilters(result)); setYoutubeFilters(defaultYoutubeFilters(result)); setInstagramFilters(defaultDateFilters(result.instagram || [])); setData(result); setLoading(false); } });
    return () => { active = false; };
  }, [client, initialData]);

  const filtered = useMemo(() => filterContent(data?.linkedin || [], filters), [data, filters]);
  const filteredYoutube = useMemo(() => filterYoutube(data?.youtube || [], youtubeFilters), [data, youtubeFilters]);
  const filteredInstagram = useMemo(() => filterContent(data?.instagram || [], instagramFilters), [data, instagramFilters]);

  // Combine LinkedIn posts and YouTube videos for the consolidated Overview
  const filteredYoutubeForOverview = useMemo(() => {
    return filterYoutube(data?.youtube || [], filters);
  }, [data?.youtube, filters]);

  const normalizedYoutubeForOverview = useMemo(() => {
    return filteredYoutubeForOverview.map(video => ({
      ...video,
      platform: 'youtube',
      content: video.description || video.title || '',
      hook: video.title || '',
      format: 'video',
      cta_keyword: 'Sem CTA',
      engagement_score: Number(video.likes || 0) + Number(video.comments || 0) * 3,
      shares: 0,
    }));
  }, [filteredYoutubeForOverview]);

  const filteredInstagramForOverview = useMemo(() => {
    return filterContent(data?.instagram || [], filters);
  }, [data?.instagram, filters]);

  const normalizedInstagramForOverview = useMemo(() => {
    return filteredInstagramForOverview.map(post => ({
      ...post,
      platform: 'instagram',
      content: post.caption || post.hook || '',
    }));
  }, [filteredInstagramForOverview]);

  const normalizedLinkedinForOverview = useMemo(() => {
    return filtered.map(post => ({ ...post, platform: 'linkedin' }));
  }, [filtered]);

  const combinedOverviewData = useMemo(() => {
    return [...normalizedLinkedinForOverview, ...normalizedYoutubeForOverview, ...normalizedInstagramForOverview];
  }, [normalizedLinkedinForOverview, normalizedYoutubeForOverview, normalizedInstagramForOverview]);

  const allPostsForOverview = useMemo(() => {
    if (!data) return [];
    const linkedin = (data.linkedin || []).map(post => ({ ...post, platform: 'linkedin' }));
    const youtube = (data.youtube || []).map(video => ({
      ...video,
      platform: 'youtube',
      content: video.description || video.title || '',
      hook: video.title || '',
      format: 'video',
      cta_keyword: 'Sem CTA',
      engagement_score: Number(video.likes || 0) + Number(video.comments || 0) * 3,
      shares: 0,
    }));
    const instagram = (data.instagram || []).map(post => ({
      ...post,
      platform: 'instagram',
      content: post.caption || post.hook || '',
    }));
    return [...linkedin, ...youtube, ...instagram];
  }, [data]);

  // Recarrega tudo do Supabase sem resetar filtros — usado depois de prospectar/
  // enriquecer pra trazer leads e contagens novas sem F5.
  const reloadData = async () => {
    const result = await loadContentMetrics({ supabase: client });
    setData(result);
  };

  // Números de prospecção por post: parte do que veio do banco (última execução de
  // cada post) e sobrepõe o resultado das execuções feitas nesta sessão.
  const prospectingByPost = useMemo(() => {
    const map = {};
    (data?.prospecting || []).forEach((stat) => { if (stat?.post_id) map[stat.post_id] = stat; });
    return { ...map, ...prospectOverrides };
  }, [data?.prospecting, prospectOverrides]);

  const runLeadAnalysisFromProspecting = async (initialPending = 0) => {
    const plan = buildLeadAnalysisPlan({ pending: Math.max(1, initialPending) });
    let done = 0;
    let qualified = 0;
    for (let batch = 0; batch < 500; batch += 1) {
      const { data: res, error } = await client.functions.invoke('enrich-leads', { body: { manual: true, limit: plan.batchSize } });
      if (error) throw error;
      if (res?.busy) { setOperationMessage(res.error || 'Ja existe uma analise de leads em andamento.'); return; }
      if (!res?.success) throw new Error(res?.error || 'Falha na analise de leads');
      done += (res.processed || 0) + (res.prefiltered || 0);
      qualified += res.qualified || 0;
      const remaining = res.remaining ?? 0;
      const nextPlan = buildLeadAnalysisPlan({
        pending: remaining,
        batchSize: res.recommendedBatchSize || plan.batchSize,
        secondsPerLead: res.estimatedSecondsPerLead || plan.secondsPerLead,
        retryAfterSeconds: res.retryAfterSeconds || plan.retryAfterSeconds,
      });
      setOperationMessage(`Analisando leads automaticamente: ${integer.format(done)} concluidos, ${integer.format(qualified)} aprovados. Restam ${integer.format(remaining)} - ETA ~${nextPlan.etaLabel}.`);
      await reloadData().catch(() => {});
      if (remaining <= 0) break;
      if ((res.errors || []).length && !res.processed && !res.rateLimited) throw new Error(res.errors[0]?.error || 'Lote falhou por completo');
      if (res.rateLimited) {
        setOperationMessage(`IA em espera por limite de taxa. Retomando em cerca de ${formatDuration(nextPlan.retryAfterSeconds)}. Restam ${integer.format(remaining)} leads.`);
        await waitForLeadAnalysisRetry(nextPlan.retryAfterSeconds, { current: false });
      }
    }
    setOperationMessage(`Analise automatica concluida: ${integer.format(done)} leads analisados, ${integer.format(qualified)} aprovados no ICP.`);
  };

  const handleProspect = async (post) => {
    if (!client?.functions?.invoke) { setOperationMessage('Prospecção indisponível no modo offline. Publique as Edge Functions e conecte o Supabase.'); return; }
    setProspectingRunning((prev) => new Set(prev).add(post.id));
    setOperationMessage('');
    try {
      const { data: res, error } = await client.functions.invoke('prospect-post', { body: { manual: true, postId: post.id } });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || 'Falha desconhecida na prospecção');
      setProspectOverrides((prev) => ({
        ...prev,
        [post.id]: {
          post_id: post.id,
          status: res.status,
          total_comments: res.totalComments,
          total_leads: res.totalLeads,
          opportunities: res.opportunities,
          new_qualified: null,
        },
      }));
      setOperationMessage(`Prospecção concluída: ${integer.format(res.totalLeads || 0)} leads, ${integer.format(res.opportunities || 0)} oportunidade(s) nova(s). Iniciando análise ICP automaticamente.`);
      await reloadData().catch(() => {});
      await runLeadAnalysisFromProspecting(res.opportunities || res.totalLeads || 0);
    } catch (e) {
      setOperationMessage(`Falha na prospecção: ${e?.message || e}`);
    } finally {
      setProspectingRunning((prev) => { const next = new Set(prev); next.delete(post.id); return next; });
    }
  };

  const navigate = (next) => { setSection(next); onSectionChange?.(next); };
  const title = METRICS_SECTIONS.find((item) => item.id === section)?.label || 'Visão geral';

  if (loading || !data) return <div className="cm-loading"><RefreshCw className="spin" size={20} /> Carregando…</div>;

  // Página de Prospecção (Tela 1 do escopo): a lista de posts com o botão
  // Prospectar e os números. A lista de leads fica na página própria "Leads ICP".
  if (mode === 'prospecting') {
    return <div className="content-metrics-workspace">
      <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Comercial</span><h1>Prospecção</h1><p>Rode um post para raspar quem comentou, cruzar com o banco de leads e ver as oportunidades novas. Os qualificados aparecem na página Leads ICP.</p></div><div className="cm-header-meta"><span>{data.linkedin.length} posts</span><Users size={16} /></div></header>
      <SourceNotice data={data} />
      {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
      <PostsSection filtered={filtered} allPosts={data.linkedin} filters={filters} setFilters={setFilters} prospecting={prospectingByPost} runningIds={prospectingRunning} onProspect={handleProspect} onAction={() => {}} showProspecting />
    </div>;
  }

  // Página Metas (acesso enxuto, sem o restante do dashboard): usada tanto pelo
  // Felipe quanto pelo Victor/Fernando pra definir e acompanhar a meta do mês.
  if (mode === 'goals') {
    return <div className="content-metrics-workspace">
      <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Crescimento</span><h1>Metas</h1><p>Defina a meta do mês para cada rede e acompanhe se está no caminho certo.</p></div><div className="cm-header-meta"><Target size={16} /></div></header>
      {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
      <MetasSection data={data} client={client} />
    </div>;
  }

  // Página Leads ICP (Tela 2 do escopo): o banco de leads qualificados, com
  // mensagem, prospectado/ignorado e os antigos pelos filtros.
  if (mode === 'leads') {
    return <div className="content-metrics-workspace">
      <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Comercial</span><h1>Leads ICP</h1><p>Quem comentou nos posts e passou (ou está esperando) o filtro de qualificação. Gere a mensagem, copie, mande no LinkedIn e marque como prospectado.</p></div><div className="cm-header-meta"><span>{(data.leads || []).length} leads no banco</span><Users size={16} /></div></header>
      {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
      <LeadsSection data={data} client={client} onNotice={setOperationMessage} onReload={reloadData} />
    </div>;
  }

  return <div className="content-metrics-workspace">
    <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Performance publicada</span><h1>Métricas de conteúdo</h1><p>Leitura histórica e operation diária de LinkedIn, YouTube e Instagram.</p></div><div className="cm-header-meta"><span>{data.linkedin.length} posts carregados</span><SlidersHorizontal size={16} /></div></header>
    <SourceNotice data={data} />
    {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
    <nav className="cm-tabs" aria-label="Seções de métricas">{METRICS_SECTIONS.map((item) => { const Icon = sectionIcons[item.id]; return <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-label={item.label}><Icon size={14} />{item.label}</button>; })}</nav>
    <AnimatePresence mode="wait"><motion.div key={section} className="cm-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
      {section !== 'overview' && <div className="cm-view-title"><span className="cm-eyebrow">Content Dashboard</span><h1>{title}</h1></div>}
      {section === 'overview' && <Overview filtered={combinedOverviewData} allPosts={allPostsForOverview} data={data} filters={filters} setFilters={setFilters} />}
      {section === 'linkedin' && <LinkedinAnalysis filtered={filtered} allPosts={data.linkedin} data={data} filters={filters} setFilters={setFilters} />}
      {section === 'youtube' && <YoutubeSection data={data} videos={filteredYoutube} filters={youtubeFilters} setFilters={setYoutubeFilters} onSettings={() => navigate('settings')} />}
      {section === 'instagram' && <InstagramSection data={data} filtered={filteredInstagram} allPosts={data.instagram} filters={instagramFilters} setFilters={setInstagramFilters} onSettings={() => navigate('settings')} client={client} />}
      {section === 'posts' && <PostsSection filtered={filtered} allPosts={data.linkedin} filters={filters} setFilters={setFilters} onAction={(action) => setOperationMessage(action === 'history' ? 'O histórico completo ficará disponível assim que os snapshots diários forem publicados no Supabase.' : 'Essa ação usa a API administrativa protegida. Publique o schema e autentique o operador antes de alterar dados.')} />}
      {section === 'videos' && <VideosSection data={data} onSettings={() => navigate('settings')} />}
      {section === 'accounts' && <AccountsSection data={data} />}
      {section === 'imports' && <ImportsSection data={data} />}
      {section === 'settings' && <SettingsSection data={data} client={client} />}
    </motion.div></AnimatePresence>
  </div>;
}

