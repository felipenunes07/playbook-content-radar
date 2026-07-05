import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, BarChart3, Database, ExternalLink, FileClock, MessageSquare,
  Play, RefreshCw, Settings, SlidersHorizontal, Users, Video,
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
  buildWeeklyCadence,
  buildWeeklyContentTypeCadence,
  filterContent,
  filterYoutube,
  groupPerformance,
  rankContent,
  isoWeekKey,
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
  return (
    <div className="cm-growth-strip">
      {chips.map((g) => (
        <div className="cm-growth-chip" key={g.owner_name}>
          <span>{g.owner_name}</span>
          <strong>{Number(g[metric]).toLocaleString('pt-BR')}</strong>
          <small>{label} · {new Date(String(g.metric_date)).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</small>
        </div>
      ))}
      {collectedDays < 8 && firstDate && (
        <small className="cm-growth-note">
          Coleta diária ativa desde {new Date(firstDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} — o histórico do gráfico se forma a cada dia.
        </small>
      )}
    </div>
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
  const heatmap = buildCalendarHeatmap(platformFiltered);
  const comparison = buildCreatorComparison(interactiveFiltered);
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
    <section className="cm-panel cm-hero-chart"><div className="cm-section-heading"><div><span className="cm-eyebrow">Cadência</span><h2>Conteúdos por semana</h2><p>Victor vs Fernando vs Total Playbook. Este é o gráfico central para saber se a frequência aumentou ou caiu.</p></div><small>{weekly.length} semanas</small></div><WeeklyCadenceChart data={weekly} onWeekClick={handleWeekClick} selectedWeek={selectedWeek?.week} /></section>
    <div className="cm-primary-grid">
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Distribuição</span><h2>Frequência diária</h2><p>Consistência de conteúdos dia a dia ao longo do ano.</p></div><small>{heatmap.days.length} dias</small></div><CalendarHeatmapChart data={heatmap} onDateClick={handleDateClick} selectedDate={selectedDate?.date} platform={selectedPlatform} /></section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Resultado</span><h2>Engagement por semana</h2></div></div><WeeklyEngagementChart data={weekly} onWeekClick={handleWeekClick} selectedWeek={selectedWeek?.week} /></section>
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

function LeadsSection({ data, client, onNotice, onReload }) {
  const [filter, setFilter] = useState('qualified');
  const [postFilter, setPostFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, qualified, status: 'running'|'done'|'error', message }
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
      if (post.id) map[post.id] = { hook: post.hook || post.content?.slice(0, 60) || '', owner: post.owner_name || '' };
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

  // Opções do filtro por post: só posts que têm lead.
  const postOptions = useMemo(() => {
    const seen = new Map();
    leads.forEach((lead) => {
      const postId = leadPostId(lead);
      if (postId && postsById[postId] && !seen.has(postId)) seen.set(postId, postsById[postId]);
    });
    return [...seen.entries()].map(([id, post]) => ({ id, ...post }));
  }, [leads, commentByLead, postsById]);

  const visible = useMemo(() => {
    let list = filter === 'all' ? leads : leads.filter((l) => (leadStatusSets[filter] || []).includes(l.qualification_status));
    if (postFilter) list = list.filter((l) => leadPostId(l) === postFilter);
    if (creatorFilter) list = list.filter((l) => postsById[leadPostId(l)]?.owner === creatorFilter);
    return list;
  }, [leads, filter, postFilter, creatorFilter, commentByLead, postsById]);

  const pendingEnrichment = leads.filter((l) => l.enrichment_status === 'pending').length;

  // Analisa a fila INTEIRA: roda lotes de 5 (cada lote ~1min: scrape + IA com
  // rate limit) até zerar, atualizando o painel de progresso a cada lote. Lotes
  // pequenos evitam o timeout de gateway que fazia o clique "não terminar nunca".
  const runEnrich = async () => {
    if (!client?.functions?.invoke) { onNotice('Enriquecimento indisponível no modo offline.'); return; }
    stopEnrichRef.current = false;
    setEnriching(true);
    const total = pendingEnrichment;
    let done = 0;
    let qualifiedTotal = 0;
    setProgress({ status: 'running', done, total, qualified: qualifiedTotal });
    try {
      for (let batch = 0; batch < 60; batch += 1) {
        const { data: res, error } = await client.functions.invoke('enrich-leads', { body: { manual: true, limit: 5 } });
        if (error) throw error;
        if (res?.busy) throw new Error(res.error || 'Já existe uma análise em andamento.');
        if (!res?.success) throw new Error(res?.error || 'Falha no enriquecimento');
        done += (res.processed || 0) + (res.prefiltered || 0);
        qualifiedTotal += res.qualified || 0;
        const remaining = res.remaining ?? 0;
        setProgress({ status: 'running', done, total: Math.max(total, done + remaining), qualified: qualifiedTotal });
        // Recarrega a cada lote: os leads analisados já aparecem na lista.
        await onReload?.().catch(() => {});
        if (remaining <= 0) break;
        if (stopEnrichRef.current) break;
        if ((res.errors || []).length && !res.processed && !res.rateLimited) throw new Error(res.errors[0]?.error || 'Lote falhou por completo');
        // Rate limit da IA: espera a janela virar antes do próximo lote.
        if (res.rateLimited) await new Promise((resolve) => setTimeout(resolve, 45000));
      }
      setProgress({ status: 'done', done, total: done, qualified: qualifiedTotal });
    } catch (e) {
      setProgress({ status: 'error', done, total, qualified: qualifiedTotal, message: String(e?.message || e) });
    } finally {
      setEnriching(false);
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
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Banco de leads</span>
          <h2>Quem comentou e virou lead</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setShowIcpModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            title="Ver e editar os critérios que o agente usa pra qualificar + a mensagem padrão">
            <Settings size={13} /> Ver/editar ICP
          </button>
          {pendingEnrichment > 0 && !enriching && (
            <button type="button" onClick={runEnrich}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0a66c2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              title="Roda profile + empresa + agente de qualificação em todos os leads pendentes, em lotes">
              <RefreshCw size={13} />
              {`Analisar fila (${integer.format(pendingEnrichment)} pendentes)`}
            </button>
          )}
          {enriching && (
            <button type="button" onClick={() => { stopEnrichRef.current = true; }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              title="Termina o lote atual e para">
              Parar após este lote
            </button>
          )}
          <small>{integer.format(visible.length)} leads</small>
        </div>
      </div>
      {progress && (
        <div style={{
          background: progress.status === 'error' ? '#fef2f2' : progress.status === 'done' ? '#f0fdf4' : '#eff6ff',
          border: `1px solid ${progress.status === 'error' ? '#fecaca' : progress.status === 'done' ? '#bbf7d0' : '#bfdbfe'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: progress.status === 'error' ? '#b91c1c' : progress.status === 'done' ? '#065f46' : '#1e3a8a' }}>
            {progress.status === 'running' && <RefreshCw size={15} className="spin" />}
            {progress.status === 'running' && `Analisando leads… ${integer.format(progress.done)} de ${integer.format(progress.total)} concluídos · ${integer.format(progress.qualified)} aprovados até agora`}
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
          {progress.status === 'running' && (
            <small style={{ display: 'block', marginTop: 6, color: '#3b5a90' }}>
              Cada lead leva ~10s (scrape do perfil + empresa + análise da IA). A lista atualiza a cada lote de 5 — pode continuar navegando.
            </small>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} aria-label="Filtrar por criador"
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: '#334155', background: '#fff' }}>
          <option value="">Criador: todos</option>
          <option value="Victor Baggio">Victor</option>
          <option value="Fernando Tedesco">Fernando</option>
        </select>
        <select value={postFilter} onChange={(e) => setPostFilter(e.target.value)} aria-label="Filtrar por post"
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: '#334155', background: '#fff', maxWidth: 380 }}>
          <option value="">Post: todos</option>
          {postOptions.map((post) => (
            <option key={post.id} value={post.id}>{post.owner ? `${post.owner.split(' ')[0]} · ` : ''}{String(post.hook).slice(0, 70)}</option>
          ))}
        </select>
        {(postFilter || creatorFilter) && (
          <button type="button" onClick={() => { setPostFilter(''); setCreatorFilter(''); }}
            style={{ background: 'transparent', border: 'none', color: '#0a66c2', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
            Limpar filtros
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {leadFilterChips.map((chip) => (
          <button key={chip.id} type="button" onClick={() => setFilter(chip.id)}
            style={{ border: '1px solid', borderColor: filter === chip.id ? '#0a66c2' : '#e2e8f0', background: filter === chip.id ? '#eff6ff' : '#fff', color: filter === chip.id ? '#0a66c2' : '#475569', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            {chip.label} · {integer.format(counts[chip.id])}
          </button>
        ))}
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
              <th>Lead</th><th title="Score 0-100 do agente de qualificação">Score</th><th>Cargo</th><th>Empresa</th><th>Porte</th><th>Comentário feito</th><th>Post de origem</th><th title="Motivo da decisão + ângulo sugerido de abordagem">Motivo / ângulo</th><th>Mensagem</th><th style={{ textAlign: 'center' }}>Prospectado</th><th style={{ textAlign: 'center' }}>Ignorar</th>
            </tr></thead>
            <tbody>
              {visible.map((lead) => {
                const outreach = outreachByLead[lead.id];
                const prospected = outreach?.status === 'prospected';
                const ignored = outreach?.status === 'ignored';
                const comment = commentByLead[lead.id];
                return (
                  <tr key={lead.id} style={(prospected || ignored) ? { opacity: 0.55 } : undefined}>
                    <td>
                      <strong>{lead.full_name || lead.public_identifier || '—'}</strong>
                      {lead.profile_url && <a className="cm-open" href={lead.profile_url} target="_blank" rel="noreferrer" aria-label={`Abrir perfil de ${lead.full_name || 'lead'}`} style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}><ExternalLink size={13} /></a>}
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
      setOperationMessage(`Prospecção concluída: ${integer.format(res.totalLeads || 0)} leads, ${integer.format(res.opportunities || 0)} oportunidade(s) nova(s).`);
      await reloadData().catch(() => {});
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

