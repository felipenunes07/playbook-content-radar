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

function ExecutiveCards({ summary }) {
  const trendLabel = summary.cadenceTrend === 'up' ? 'Subiu' : summary.cadenceTrend === 'down' ? 'Caiu' : 'Estável';
  const cards = [
    ['Conteúdos últimos 30 dias', integer.format(summary.postsLast30Days)],
    ['Média conteúdos/semana', decimal.format(summary.averagePostsPerWeek)],
    ['Engagement total', integer.format(summary.totalEngagement)],
    ['Comentários', integer.format(summary.totalComments)],
    ['Dias desde último conteúdo', summary.daysSinceLastPost == null ? '—' : integer.format(summary.daysSinceLastPost)],
    ['Tendência de cadência', trendLabel],
  ];
  return <div className="cm-executive-cards">{cards.map(([label, value]) => <div className="cm-executive-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
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

  const platformFiltered = useMemo(() => {
    if (selectedPlatform === 'all') return filtered;
    return filtered.filter(item => item.platform === selectedPlatform);
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
    <div className="cm-executive-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
        <div><span className="cm-eyebrow">Filtro principal</span><h2>Victor, Fernando ou Playbook total</h2></div>
        <CreatorToggle selectedOwner={filters.owner || ''} onChange={(owner) => setFilters({ ...filters, owner })} />
      </div>
      
      <div className="cm-platform-toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '16px', width: '100%', justifyContent: 'flex-end' }}>
        <span className="cm-eyebrow" style={{ margin: 0 }}>Plataforma</span>
        <div className="cm-creator-toggle cm-platform-toggle" style={{ margin: 0 }}>
          <button type="button" className={`platform-all ${selectedPlatform === 'all' ? 'active' : ''}`} onClick={() => { setSelectedPlatform('all'); setSelectedDate(null); setSelectedWeek(null); }} aria-label="Todas">
            <AllIcon size={15} />
          </button>
          <button type="button" className={`platform-linkedin ${selectedPlatform === 'linkedin' ? 'active' : ''}`} onClick={() => { setSelectedPlatform('linkedin'); setSelectedDate(null); setSelectedWeek(null); }} aria-label="LinkedIn">
            <LinkedInIcon size={15} />
          </button>
          <button type="button" className={`platform-youtube ${selectedPlatform === 'youtube' ? 'active' : ''}`} onClick={() => { setSelectedPlatform('youtube'); setSelectedDate(null); setSelectedWeek(null); }} aria-label="YouTube">
            <YouTubeIcon size={15} />
          </button>
          <button type="button" className={`platform-instagram ${selectedPlatform === 'instagram' ? 'active' : ''}`} onClick={() => { setSelectedPlatform('instagram'); setSelectedDate(null); setSelectedWeek(null); }} aria-label="Instagram">
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

    <ExecutiveCards summary={summary} />
    <section className="cm-panel cm-hero-chart"><div className="cm-section-heading"><div><span className="cm-eyebrow">Cadência</span><h2>Conteúdos por semana</h2><p>Victor vs Fernando vs Total Playbook. Este é o gráfico central para saber se a frequência aumentou ou caiu.</p></div><small>{weekly.length} semanas</small></div><WeeklyCadenceChart data={weekly} onWeekClick={handleWeekClick} selectedWeek={selectedWeek?.week} /></section>
    <div className="cm-primary-grid">
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Distribuição</span><h2>Frequência diária</h2><p>Consistência de conteúdos dia a dia ao longo do ano.</p></div><small>{heatmap.days.length} dias</small></div><CalendarHeatmapChart data={heatmap} onDateClick={handleDateClick} selectedDate={selectedDate?.date} /></section>
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

function InstagramSection({ data, filtered, allPosts, filters, setFilters, onSettings }) {
  if (!data.instagram.length) return <EmptyCollector platform="Instagram" onSettings={onSettings} />;
  const metrics = aggregateContentMetrics(filtered);
  const weekly = buildWeeklyContentTypeCadence(filtered);
  return <>
    <ContentFilters filters={filters} onChange={setFilters} posts={allPosts} advanced hideOwner />
    <MetricStrip metrics={metrics} />
    <section className="cm-panel cm-hero-chart">
      <div className="cm-section-heading"><div><span className="cm-eyebrow">Cadência</span><h2>Publicações por semana</h2><p>Stories separados de Reels + Publicações (feed permanente).</p></div><small>{weekly.length} semanas</small></div>
      <WeeklyContentTypeChart data={weekly} />
    </section>
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
      <AccountGrowthChart data={filteredGrowth} />
    </section>
  ) : null;

  if (!data.youtube.length) return <>{growthSection}<EmptyCollector platform="YouTube" onSettings={onSettings} /></>;
  const totals = aggregateYoutubeMetrics(videos);
  const trend = buildMonthlyTrend(videos.map((video) => ({ ...video, engagement_total: video.engagement_total || 0, shares: 0 })));
  return <><YoutubeFilters filters={filters} onChange={setFilters} videos={data.youtube} /><div className="cm-metric-strip"><div className="cm-metric"><span>Vídeos</span><strong>{totals.videos}</strong></div><div className="cm-metric"><span>Views</span><strong>{integer.format(totals.views)}</strong></div><div className="cm-metric"><span>Likes</span><strong>{integer.format(totals.likes)}</strong></div><div className="cm-metric"><span>Comentários</span><strong>{integer.format(totals.comments)}</strong></div><div className="cm-metric"><span>Engagement</span><strong>{integer.format(totals.engagement)}</strong></div><div className="cm-metric"><span>Taxa média</span><strong>{totals.engagementRate.toLocaleString('pt-BR')}%</strong></div></div><section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Publicação</span><h2>Vídeos publicados por mês</h2></div><small>{trend.length} períodos</small></div><ContentTrendChart data={trend} metric="posts" /></section>{growthSection}<YoutubeVideosTable rows={[...videos].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 50)} title="Top vídeos por views" /></>;
}

function PostsSection({ filtered, allPosts, filters, setFilters, onAction }) {
  return <><div className="cm-executive-toolbar compact"><CreatorToggle selectedOwner={filters.owner || ''} onChange={(owner) => setFilters({ ...filters, owner })} /></div><ContentFilters filters={filters} onChange={setFilters} posts={allPosts} compact advanced hideOwner /><OperationalPostsTable rows={rankContent(filtered, 'engagement_score', 250)} onAction={onAction} /></>;
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

export default function ContentMetricsWorkspace({ client, initialData, initialSection = 'overview', onSectionChange }) {
  const [section, setSection] = useState(initialSection);
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [filters, setFilters] = useState(() => defaultContentFilters(initialData));
  const [youtubeFilters, setYoutubeFilters] = useState(() => defaultYoutubeFilters(initialData));
  const [instagramFilters, setInstagramFilters] = useState(() => defaultDateFilters(initialData?.instagram || []));
  const [operationMessage, setOperationMessage] = useState('');

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

  const navigate = (next) => { setSection(next); onSectionChange?.(next); };
  const title = METRICS_SECTIONS.find((item) => item.id === section)?.label || 'Visão geral';

  if (loading || !data) return <div className="cm-loading"><RefreshCw className="spin" size={20} /> Carregando métricas…</div>;

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
      {section === 'instagram' && <InstagramSection data={data} filtered={filteredInstagram} allPosts={data.instagram} filters={instagramFilters} setFilters={setInstagramFilters} onSettings={() => navigate('settings')} />}
      {section === 'posts' && <PostsSection filtered={filtered} allPosts={data.linkedin} filters={filters} setFilters={setFilters} onAction={(action) => setOperationMessage(action === 'history' ? 'O histórico completo ficará disponível assim que os snapshots diários forem publicados no Supabase.' : 'Essa ação usa a API administrativa protegida. Publique o schema e autentique o operador antes de alterar dados.')} />}
      {section === 'videos' && <VideosSection data={data} onSettings={() => navigate('settings')} />}
      {section === 'accounts' && <AccountsSection data={data} />}
      {section === 'imports' && <ImportsSection data={data} />}
      {section === 'settings' && <SettingsSection data={data} client={client} />}
    </motion.div></AnimatePresence>
  </div>;
}

