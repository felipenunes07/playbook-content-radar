import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, BarChart3, Database, ExternalLink, FileClock, FileText, Image as ImageIcon, MessageSquare,
  Play, RefreshCw, Settings, SlidersHorizontal, Users, Video, Target, Copy, Check, Globe, Download, FileSpreadsheet,
  Phone, AlertTriangle, X, MessageCircle, Info, Sparkles,
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
  summarizeBookingsByMaterial,
} from './analytics.js';
import { loadContentMetrics } from './repository.js';
import { buildLeadExportFilename, buildLeadExportRows, downloadLeadCsv, downloadLeadExcel, leadExportColumns, selectLeadsForExport } from './leadExport.js';
import {
  PHONE_FILTERS, countByPhoneFilter, downloadedMagnet, evidenceLabel, indexPhonesByLead, isAutoMatch, matchesPhoneFilter,
  phoneDisplay, phoneStatusMeta, phoneStatusOf, reviewCandidates, reviewReason, whatsappLink,
} from './leadPhones.js';
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
  const safeBatch = Math.max(1, Math.min(30, Math.trunc(Number(batchSize) || LEAD_ANALYSIS_DEFAULT_BATCH)));
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
  const dates = rows.map((row) => validUtcDate(row?.published_at || row?.metric_date)).filter(Boolean).sort((a, b) => b - a);
  const latest = dates[0] || new Date();
  return { from: isoDate(shiftUtcMonths(latest, -12)), to: isoDate(latest) };
}

function defaultContentFilters(data) {
  return defaultDateFilters([
    ...(data?.linkedin || []),
    ...(data?.youtube || []),
    ...(data?.instagram || []),
    ...(data?.growth || [])
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      {collectedDays < 8 && firstDate && (
        <p className="cm-growth-note" style={{ margin: 0, fontSize: '10.5px', color: '#64748b' }}>
          Coleta diária ativa desde {new Date(firstDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
        </p>
      )}
      <div className="cm-growth-strip" style={{ marginBottom: 0 }}>
        {chips.map((g) => (
          <div className="cm-growth-chip" key={g.owner_name}>
            <span>{g.owner_name}</span>
            <strong>{Number(g[metric]).toLocaleString('pt-BR')}</strong>
            <small>{label} · {shortDay(g.metric_date)}</small>
          </div>
        ))}
      </div>
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

function formatBookingDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Resumo de reuniões (Cal.com) agrupadas por material/lead magnet. Lê data.bookings
// carregado direto do Supabase (tabela lead_magnet_bookings) — sem tagging manual:
// a atribuição vem do campo lead_magnet do link usado no agendamento.
function MeetingsByMaterial({ bookings }) {
  const rows = Array.isArray(bookings) ? bookings : [];
  const summary = useMemo(() => summarizeBookingsByMaterial(rows), [rows]);
  const totals = summary.reduce(
    (acc, row) => ({ active: acc.active + row.active, upcoming: acc.upcoming + row.upcoming }),
    { active: 0, upcoming: 0 },
  );
  const recent = rows.slice(0, 8);
  const bookingStatus = (status) => {
    const cancelled = String(status || '').toUpperCase() === 'CANCELLED';
    return <span style={{ color: cancelled ? 'var(--cm-danger, #dc2626)' : 'var(--cm-success, #16a34a)', fontWeight: 600 }}>{cancelled ? 'Cancelada' : 'Agendada'}</span>;
  };
  return (
    <section className="cm-panel">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Atribuição</span>
          <h2>Reuniões por material</h2>
        </div>
        <small>{totals.active} reuni{totals.active === 1 ? 'ão' : 'ões'} · {totals.upcoming} futura{totals.upcoming === 1 ? '' : 's'}</small>
      </div>
      {!summary.length ? (
        <div className="cm-empty">Nenhuma reunião agendada ainda. Assim que alguém marcar pelo link de um material (Cal.com), a reunião aparece aqui automaticamente.</div>
      ) : (
        <>
          <div className="cm-table-wrap">
            <table className="cm-table">
              <thead><tr><th>Material (lead magnet)</th><th style={{ textAlign: 'center' }}>Reuniões</th><th style={{ textAlign: 'center' }}>Futuras</th><th style={{ textAlign: 'center' }}>Canceladas</th><th>Última reserva</th></tr></thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.lead_magnet}>
                    <td><strong>{row.lead_magnet}</strong></td>
                    <td style={{ textAlign: 'center' }}>{row.active}</td>
                    <td style={{ textAlign: 'center' }}>{row.upcoming}</td>
                    <td style={{ textAlign: 'center' }}>{row.cancelled || '—'}</td>
                    <td>{formatBookingDate(row.lastBookingAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cm-table-note">Atribuição pelo campo <code>lead_magnet</code> do link do Cal.com. Uma reunião = uma reserva; canceladas não entram na contagem de reuniões.</p>
          {recent.length > 0 && (
            <div className="cm-table-wrap" style={{ marginTop: 12 }}>
              <table className="cm-table">
                <thead><tr><th>Reservas recentes</th><th>Material</th><th>Data da reunião</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
                <tbody>
                  {recent.map((booking) => (
                    <tr key={booking.booking_uid}>
                      <td>{booking.lead_name || '—'}</td>
                      <td>{booking.lead_magnet || '—'}</td>
                      <td>{formatBookingDate(booking.start_time)}</td>
                      <td style={{ textAlign: 'center' }}>{bookingStatus(booking.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Overview({ filtered, allPosts, data, filters, setFilters }) {
  const [selectedPlatform, setSelectedPlatform] = useState('all'); // 'all', 'linkedin', 'youtube', 'instagram'
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [distributionView, setDistributionView] = useState('frequency'); // 'frequency' | 'followers'
  const [followersPeriod, setFollowersPeriod] = useState('weekly'); // 'daily' | 'weekly'
  const [cadenceGroup, setCadenceGroup] = useState('creator'); // 'creator' | 'platform'

  const handleDateClick = (dayInfo) => {
    if (selectedDate && selectedDate.date === dayInfo.date) {
      setSelectedDate(null);
    } else {
      setSelectedDate(dayInfo);
      setSelectedWeek(null);
    }
  };

  const handleWeekClick = (clickedInfo) => {
    if (followersPeriod === 'daily' && clickedInfo.date) {
      if (selectedDate && selectedDate.date === clickedInfo.date) {
        setSelectedDate(null);
      } else {
        setSelectedDate({ date: clickedInfo.date, label: clickedInfo.label });
        setSelectedWeek(null);
      }
    } else {
      if (selectedWeek && selectedWeek.week === clickedInfo.week) {
        setSelectedWeek(null);
      } else {
        setSelectedWeek({ week: clickedInfo.week, label: clickedInfo.label });
        setSelectedDate(null);
      }
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
  const daily = buildDailyCadence(platformFiltered).slice(-30);
  const weekly = buildWeeklyCadence(platformFiltered);

  const cadenceData = useMemo(() => {
    if (cadenceGroup === 'creator') {
      return followersPeriod === 'daily' ? daily : weekly;
    }

    const isDaily = followersPeriod === 'daily';
    const groups = new Map();

    platformFiltered.forEach((item) => {
      const published = item.published_at ? new Date(item.published_at) : null;
      if (!published || Number.isNaN(published.getTime())) return;

      let key, label;
      if (isDaily) {
        const utcDate = new Date(Date.UTC(published.getUTCFullYear(), published.getUTCMonth(), published.getUTCDate()));
        key = utcDate.toISOString().slice(0, 10);
        const [, m, d] = key.split('-');
        label = `${d}/${m}`;
      } else {
        key = isoWeekKey(published);
        label = weekLabel(key);
      }

      const current = groups.get(key) || {
        week: isDaily ? undefined : key,
        date: isDaily ? key : undefined,
        label,
        LinkedIn: 0,
        YouTube: 0,
        Instagram: 0,
        Total: 0,
        engagement: 0,
        comments: 0,
        averageEngagement: 0,
      };

      const plat = item.platform;
      if (plat === 'linkedin') current.LinkedIn += 1;
      else if (plat === 'youtube') current.YouTube += 1;
      else if (plat === 'instagram') current.Instagram += 1;

      current.Total += 1;
      current.engagement += Number(item.engagement_total || 0);
      current.comments += Number(item.comments || 0);
      current.averageEngagement = Math.round(current.engagement / current.Total);
      groups.set(key, current);
    });

    const sorted = [...groups.values()].sort((a, b) => {
      const keyA = isDaily ? a.date : a.week;
      const keyB = isDaily ? b.date : b.week;
      return keyA.localeCompare(keyB);
    });

    if (sorted.length < 2) return sorted;

    const filled = [];
    if (isDaily) {
      const first = new Date(`${sorted[0].date}T00:00:00Z`);
      const last = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`);
      for (let cursor = first; cursor <= last; cursor = new Date(cursor.getTime() + 86400000)) {
        const day = cursor.toISOString().slice(0, 10);
        const [, m, d] = day.split('-');
        const existing = groups.get(day);
        filled.push(existing || {
          date: day,
          label: `${d}/${m}`,
          LinkedIn: 0,
          YouTube: 0,
          Instagram: 0,
          Total: 0,
          engagement: 0,
          comments: 0,
          averageEngagement: 0,
        });
      }
    } else {
      const weekKeyToMonday = (weekKey) => {
        const parts = weekKey.split('-W');
        const year = parseInt(parts[0], 10);
        const week = parseInt(parts[1], 10);
        const simple = new Date(Date.UTC(year, 0, 4));
        const day = simple.getUTCDay() || 7;
        const monday = new Date(simple.getTime());
        monday.setUTCDate(simple.getUTCDate() - day + 1 + (week - 1) * 7);
        return monday;
      };
      const firstMonday = weekKeyToMonday(sorted[0].week);
      const lastMonday = weekKeyToMonday(sorted[sorted.length - 1].week);
      const cursor = new Date(firstMonday);
      while (cursor <= lastMonday) {
        const wk = isoWeekKey(cursor);
        const existing = groups.get(wk);
        filled.push(existing || {
          week: wk,
          label: weekLabel(wk),
          LinkedIn: 0,
          YouTube: 0,
          Instagram: 0,
          Total: 0,
          engagement: 0,
          comments: 0,
          averageEngagement: 0,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }

    return isDaily ? filled.slice(-30) : filled;
  }, [platformFiltered, cadenceGroup, followersPeriod, daily, weekly]);
  const heatmap = buildCalendarHeatmap(platformFiltered);
  const comparison = buildCreatorComparison(interactiveFiltered);
  const networkGrowth = useMemo(
    () => buildNetworkGrowthSeries(data.growth, followersPeriod, filters, selectedPlatform),
    [data.growth, followersPeriod, filters, selectedPlatform],
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button 
            type="button" 
            onClick={() => setCadenceGroup(prev => prev === 'creator' ? 'platform' : 'creator')}
            title={cadenceGroup === 'platform' ? "Agrupado por Rede (clique para agrupar por Criador)" : "Agrupar por Rede"}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: `1px solid ${cadenceGroup === 'platform' ? '#cbd5e1' : '#e2e8f0'}`,
              backgroundColor: cadenceGroup === 'platform' ? '#e2e8f0' : '#ffffff',
              color: cadenceGroup === 'platform' ? '#0f172a' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Globe size={16} />
          </button>
          <div className="cm-period-toggle" role="tablist" aria-label="Período do gráfico de seguidores por rede">
            <button type="button" role="tab" aria-selected={followersPeriod === 'daily'} className={followersPeriod === 'daily' ? 'active' : ''} onClick={() => setFollowersPeriod('daily')}>Diário</button>
            <button type="button" role="tab" aria-selected={followersPeriod === 'weekly'} className={followersPeriod === 'weekly' ? 'active' : ''} onClick={() => setFollowersPeriod('weekly')}>Semanal</button>
          </div>
          <small>{followersPeriod === 'daily' ? `${daily.length} dias` : `${weekly.length} semanas`}</small>
        </div>
      </div>
      <WeeklyCadenceChart
        data={cadenceData}
        onWeekClick={followersPeriod === 'daily' ? handleDateClick : handleWeekClick}
        selectedWeek={followersPeriod === 'daily' ? selectedDate?.date : selectedWeek?.week}
        periodLabel={followersPeriod === 'daily' ? 'dias' : 'semanas'}
        keys={cadenceGroup === 'creator' ? ['Victor', 'Fernando'] : ['LinkedIn', 'YouTube', 'Instagram']}
        colors={
          cadenceGroup === 'creator'
            ? { Victor: '#0a66c2', Fernando: '#93c5fd' }
            : { LinkedIn: '#0a66c2', YouTube: '#e52d27', Instagram: '#c13584' }
        }
      />
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
            ? <NetworkFollowersChart
                data={networkGrowth}
                onWeekClick={handleWeekClick}
                selectedWeek={selectedWeek?.week}
                selectedDate={selectedDate?.date}
                period={followersPeriod}
              />
            : <div className="cm-empty-chart">Ainda não há coletas de seguidores suficientes para este período.</div>)
          : <CalendarHeatmapChart data={heatmap} onDateClick={handleDateClick} selectedDate={selectedDate?.date} platform={selectedPlatform} />}
      </section>
      <section className="cm-panel"><div className="cm-section-heading"><div><span className="cm-eyebrow">Resultado</span><h2>{followersPeriod === 'daily' ? 'Engagement e Visualizações por dia' : 'Engagement e Visualizações por semana'}</h2></div></div><WeeklyEngagementChart data={followersPeriod === 'daily' ? daily : weekly} onWeekClick={handleWeekClick} selectedWeek={selectedWeek?.week} /></section>
    </div>
    
    <section className="cm-panel">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">Desempenho</span>
          <h2>{activeFilterLabel ? `Conteúdos em destaque (${activeFilterLabel})` : 'Top conteúdos por score'}</h2>
        </div>
      </div>
      <TopContentTable rows={rankContent(interactiveFiltered, 'engagement_score', activeFilterLabel ? 100 : 10)} showViews={selectedPlatform !== 'linkedin' && selectedPlatform !== 'instagram'} />
    </section>

    <MeetingsByMaterial bookings={data.bookings} />

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
        <GrowthCurrentStrip growth={data.growth} platform="linkedin" />
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
    <TopContentTable rows={rankContent(interactiveFiltered, 'comments', activeFilterLabel ? 100 : 10)} metric="comments" title={activeFilterLabel ? `Top posts por comentários (${activeFilterLabel})` : "Top posts por comentários"} showViews={false} />
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

function InstagramSection({ data, filtered, allPosts, filters, setFilters, onSettings, client, onReload }) {
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
        <GrowthCurrentStrip growth={data.growth} platform="instagram" />
      </div>
      <AccountGrowthChart data={filteredGrowth} />
    </section>
  ) : null;

  const pullNow = async () => {
    if (!client?.functions?.invoke) { setPullMsg('Coleta manual indisponível no modo offline.'); return; }
    setPulling(true); setPullMsg('');
    try {
      const { data: res, error } = await client.functions.invoke('collect-instagram', { body: { manual: true } });
      if (error) throw error;
      setPullMsg(`Sincronização concluída com sucesso!`);
      if (onReload) {
        await onReload();
      }
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
    <TopContentTable rows={rankContent(filtered, 'engagement_score', 20)} title="Top conteúdos do Instagram" showViews={false} />
  </>;
}

function YoutubeSection({ data, videos, filters, setFilters, onSettings }) {
  const [selectedMonth, setSelectedMonth] = useState(null);

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
        <GrowthCurrentStrip growth={data.growth} platform="youtube" metric="subscribers" label="inscritos" />
      </div>
      <AccountGrowthChart data={filteredGrowth} />
    </section>
  ) : null;

  const filteredVideos = useMemo(() => {
    if (!selectedMonth) return videos;
    return videos.filter((video) => {
      if (!video.published_at) return false;
      const date = new Date(video.published_at);
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      return period === selectedMonth.period;
    });
  }, [videos, selectedMonth]);

  if (!data.youtube.length) return <>{growthSection}<EmptyCollector platform="YouTube" onSettings={onSettings} /></>;
  const totals = aggregateYoutubeMetrics(videos);
  const trend = buildMonthlyTrend(videos.map((video) => ({ ...video, engagement_total: video.engagement_total || 0, shares: 0 })));

  return (
    <>
      <YoutubeFilters filters={filters} onChange={setFilters} videos={data.youtube} />
      <div className="cm-metric-strip">
        <div className="cm-metric"><span>Vídeos</span><strong>{totals.videos}</strong></div>
        <div className="cm-metric"><span>Views</span><strong>{integer.format(totals.views)}</strong></div>
        <div className="cm-metric"><span>Likes</span><strong>{integer.format(totals.likes)}</strong></div>
        <div className="cm-metric"><span>Comentários</span><strong>{integer.format(totals.comments)}</strong></div>
        <div className="cm-metric"><span>Engagement</span><strong>{integer.format(totals.engagement)}</strong></div>
        <div className="cm-metric"><span>Taxa média</span><strong>{totals.engagementRate.toLocaleString('pt-BR')}%</strong></div>
      </div>

      {selectedMonth && (
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
          }}
        >
          <SlidersHorizontal size={14} style={{ marginRight: 8 }} />
          <span>Filtrado por período: <strong>{selectedMonth.label}</strong></span>
          <button 
            onClick={() => setSelectedMonth(null)}
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

      <section className="cm-panel">
        <div className="cm-section-heading">
          <div>
            <span className="cm-eyebrow">Publicação</span>
            <h2>Vídeos publicados por mês</h2>
          </div>
          <small>{trend.length} períodos</small>
        </div>
        <ContentTrendChart data={trend} metric="posts" color="#e52d27" onPointClick={setSelectedMonth} />
      </section>

      {growthSection}

      <YoutubeVideosTable 
        rows={[...filteredVideos].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 50)} 
        title={selectedMonth ? `Top vídeos por views (${selectedMonth.label})` : "Top vídeos por views"} 
      />
    </>
  );
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

// Como cada veredito aparece na coluna do seu ICP. 'review' é legado (o terceiro
// status foi extinto em 05/07) e conta como aprovado, igual em leadStatusSets.
const ICP_VERDICT_STYLES = {
  qualified: { label: 'Aprovado', bg: '#e7f6ee', color: '#057642', border: '#a3d9b1' },
  review: { label: 'Aprovado', bg: '#e7f6ee', color: '#057642', border: '#a3d9b1' },
  disqualified: { label: 'Descartado', bg: '#fef2f2', color: '#b42318', border: '#fecaca' },
  pending: { label: 'Analisando', bg: '#fff9e6', color: '#92650e', border: '#fde4ad' },
};

/** Veredito de UM lead em UM ICP. Sem linha em lead_qualifications significa que
 *  aquele ICP nunca olhou esta pessoa — diferente de "olhou e descartou", e a coluna
 *  precisa mostrar essa diferença: é ela que diz se vale rodar o ICP no post. */
function IcpVerdictCell({ qualification }) {
  if (!qualification) {
    return (
      <span title="Este ICP ainda não avaliou este lead. Prospecte o post com ele para avaliar."
        style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 600 }}>—</span>
    );
  }
  const style = ICP_VERDICT_STYLES[qualification.status] || ICP_VERDICT_STYLES.pending;
  const porRegra = qualification.decided_by === 'hard_rule';
  const porPrefiltro = qualification.decided_by === 'prefilter' || qualification.decided_by === 'enrichment_error';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span title={qualification.reason || ''}
        style={{ display: 'inline-block', background: style.bg, color: style.color, border: `1px solid ${style.border}`, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {style.label}
      </span>
      {qualification.score != null && (
        <small style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: 700 }}>{qualification.score}</small>
      )}
      {porRegra && <small style={{ color: '#94a3b8', fontSize: 9.5 }} title="Veredito da regra dura deste ICP, não do modelo">regra</small>}
      {porPrefiltro && <small style={{ color: '#94a3b8', fontSize: 9.5 }} title="Fechado sem gastar IA (pré-filtro ou falha de enriquecimento)">auto</small>}
    </span>
  );
}

/** Quanto tempo passou desde o comentário, em linguagem de gente. O time trabalha a
 *  lista por recência ("comentou hoje de tarde ainda está quente"), então a tabela
 *  mostra isto ao lado da data em vez de obrigar a fazer a conta de cabeça. */
function tempoDesde(value) {
  if (!value) return '';
  const minutos = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutos) || minutos < 0) return '';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias}d`;
  const meses = Math.floor(dias / 30);
  return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

/** Data + hora do comentário, curto o bastante pra caber na coluna. */
const dataHoraCurta = (value) => (value
  ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—');

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

// Vocabulário de área que o agente de qualificação devolve. A regra dura por ICP
// filtra por estes valores exatos — uma área digitada fora desta lista viraria um
// filtro que nunca casa, então o formulário só oferece estes.
const ICP_AREAS = [
  ['vendas', 'Vendas / comercial'],
  ['marketing', 'Marketing'],
  ['operacoes', 'Operações'],
  ['growth', 'Growth'],
  ['tecnologia', 'Tecnologia / produto'],
  ['financeiro', 'Financeiro'],
  ['rh', 'RH'],
  ['outro', 'Outro'],
  ['desconhecido', 'Desconhecido'],
];

const EMPTY_ICP_FORM = {
  id: null, name: '', icp_rules: '', message_template: '',
  is_default: false, active: true,
  hard_rules_enabled: false, min_company_size: '', approved_areas: [], blocked_areas: [],
};

// Chip de seleção de área (aprova/barra) da regra dura.
function AreaChips({ label, hint, selected, onToggle }) {
  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>{label}</span>
      {hint && <small style={{ display: 'block', color: '#94a3b8', fontSize: 11 }}>{hint}</small>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
        {ICP_AREAS.map(([value, text]) => {
          const on = selected.includes(value);
          return (
            <button key={value} type="button" onClick={() => onToggle(value)}
              style={{ border: `1px solid ${on ? '#0a66c2' : '#e2e8f0'}`, background: on ? '#eff6ff' : '#fff', color: on ? '#0a66c2' : '#64748b', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Cadastro dos ICPs. Cada ICP é um público: o texto de "Critérios" é usado
// LITERALMENTE pelo agente ao julgar quem comentou num post prospectado com ele, e a
// mensagem de 1º contato também é dele. A regra dura é o corte objetivo que
// sobrescreve o modelo (liderança + área + porte) — nasce desligada num ICP novo,
// porque público fora do corte comercial tem que ficar na mão do texto, não de um if
// herdado de outro ICP.
function IcpSettingsModal({ icps = [], client, onClose, onNotice, onReload }) {
  const [selectedId, setSelectedId] = useState(() => icps.find((icp) => icp.is_default)?.id || icps[0]?.id || 'new');
  const [form, setForm] = useState(EMPTY_ICP_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Trocar de ICP na lista recarrega o formulário (e descarta edição não salva —
  // comportamento esperado de um seletor de cadastro).
  useEffect(() => {
    setConfirmingDelete(false);
    if (selectedId === 'new') { setForm({ ...EMPTY_ICP_FORM }); return; }
    const icp = icps.find((item) => item.id === selectedId);
    if (!icp) { setForm({ ...EMPTY_ICP_FORM }); return; }
    setForm({
      id: icp.id,
      name: icp.name || '',
      icp_rules: icp.icp_rules || '',
      message_template: icp.message_template || '',
      is_default: Boolean(icp.is_default),
      active: icp.active !== false,
      hard_rules_enabled: Boolean(icp.hard_rules_enabled),
      min_company_size: icp.min_company_size == null ? '' : String(icp.min_company_size),
      approved_areas: icp.approved_areas || [],
      blocked_areas: icp.blocked_areas || [],
    });
  }, [selectedId, icps]);

  const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));
  const toggleArea = (field, value) => setForm((prev) => ({
    ...prev,
    [field]: prev[field].includes(value) ? prev[field].filter((item) => item !== value) : [...prev[field], value],
  }));

  const save = async () => {
    if (!client?.functions?.invoke) { onNotice('Indisponível no modo offline.'); return; }
    if (!form.name.trim()) { onNotice('Dê um nome ao ICP (ex.: "Second Brain").'); return; }
    setSaving(true);
    try {
      const { data: res, error } = await client.functions.invoke('lead-outreach', {
        body: {
          manual: true,
          action: 'save_icp',
          icpId: form.id || undefined,
          name: form.name,
          icpRules: form.icp_rules,
          messageTemplate: form.message_template,
          hardRulesEnabled: form.hard_rules_enabled,
          minCompanySize: form.min_company_size === '' ? null : Number(form.min_company_size),
          approvedAreas: form.approved_areas,
          blockedAreas: form.blocked_areas,
          isDefault: form.is_default,
          active: form.active,
        },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || 'Falha ao salvar');
      onNotice(`ICP "${res.name || form.name}" salvo. Vale já na próxima prospecção e na próxima análise.`);
      await onReload?.();
      if (res.icpId) setSelectedId(res.icpId);
    } catch (e) {
      onNotice(`Falha ao salvar o ICP: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!client?.functions?.invoke || !form.id) return;
    setSaving(true);
    try {
      const { data: res, error } = await client.functions.invoke('lead-outreach', {
        body: { manual: true, action: 'delete_icp', icpId: form.id },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || 'Falha ao apagar');
      onNotice(res.message || `ICP "${form.name}" apagado.`);
      await onReload?.();
      setSelectedId('new');
    } catch (e) {
      onNotice(`Não foi possível apagar: ${e?.message || e}`);
    } finally {
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  const fieldStyle = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', color: '#0f172a' };
  const inputStyle = { ...fieldStyle, padding: '9px 12px' };
  const isNew = !form.id;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(820px, 100%)', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }} onClick={(e) => e.stopPropagation()}>
        <span className="cm-eyebrow">Configuração da prospecção</span>
        <h2 style={{ margin: '4px 0 4px', fontSize: 17 }}>ICPs — quem é lead pra cada tipo de post</h2>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#64748b' }}>
          Cada ICP tem os próprios critérios e a própria mensagem. Na hora de prospectar um post você escolhe qual usar,
          e o "aprovado" sai do ICP escolhido — o mesmo comentarista pode ser aprovado num e rejeitado no outro.
        </p>

        {/* Seletor de ICP + criar novo */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {icps.map((icp) => {
            const on = icp.id === selectedId;
            return (
              <button key={icp.id} type="button" onClick={() => setSelectedId(icp.id)}
                style={{ border: `1px solid ${on ? '#0a66c2' : '#e2e8f0'}`, background: on ? '#0a66c2' : '#fff', color: on ? '#fff' : '#334155', borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: icp.active === false ? 0.55 : 1 }}
                title={icp.active === false ? 'ICP desativado — não aparece na hora de prospectar' : ''}>
                {icp.name}{icp.is_default ? ' · padrão' : ''}{icp.active === false ? ' · desativado' : ''}
              </button>
            );
          })}
          <button type="button" onClick={() => setSelectedId('new')}
            style={{ border: `1px dashed ${selectedId === 'new' ? '#0a66c2' : '#cbd5e1'}`, background: selectedId === 'new' ? '#eff6ff' : '#fff', color: '#0a66c2', borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + Novo ICP
          </button>
        </div>

        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Nome do ICP</label>
        <input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder='Ex.: Second Brain — construtores de sistema pessoal' style={inputStyle} />

        <h3 style={{ margin: '18px 0 4px', fontSize: 15 }}>Critérios de qualificação</h3>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#64748b' }}>É este texto, literalmente, que o agente de IA usa pra aprovar ou rejeitar cada lead deste ICP. Vale na próxima análise, sem deploy.</p>
        <textarea value={form.icp_rules} onChange={(e) => patch({ icp_rules: e.target.value })} rows={10} style={fieldStyle}
          placeholder="1. Cargo/perfil que aprova… 2. Quem rejeita… 3. Porte/contexto… Score 0-100…" />

        <h3 style={{ margin: '18px 0 4px', fontSize: 15 }}>Mensagem de 1º contato deste ICP</h3>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#64748b' }}>Preenche <code>{'{nome}'}</code>, <code>{'{company}'}</code> e <code>{'{tema_post}'}</code>. Vazia: usa a mensagem do ICP padrão e, se ela também estiver vazia, a IA improvisa.</p>
        <textarea value={form.message_template} onChange={(e) => patch({ message_template: e.target.value })} rows={7} style={fieldStyle} />

        {/* Regra dura */}
        <div style={{ marginTop: 18, border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#f8fafc' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.hard_rules_enabled} onChange={(e) => patch({ hard_rules_enabled: e.target.checked })} style={{ width: 15, height: 15, accentColor: '#0a66c2' }} />
            Regra dura (sobrescreve o modelo)
          </label>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
            Cargo de liderança + área aprovada + porte mínimo = aprovado, sem discussão. Cargo operacional
            (estagiário, analista, SDR…) sem marcador de liderança, ou área barrada = rejeitado. Existe porque o
            modelo já contradisse os critérios escritos e inventou corte próprio. Deixe DESLIGADA num público que
            não tem corte de porte/área — aí quem decide é só o texto acima.
          </p>
          {form.hard_rules_enabled && (
            <>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Porte mínimo da empresa (colaboradores)</label>
                <input type="number" min="0" value={form.min_company_size} onChange={(e) => patch({ min_company_size: e.target.value })}
                  placeholder="Vazio = sem corte de porte" style={{ ...inputStyle, maxWidth: 220 }} />
              </div>
              <AreaChips label="Áreas que a regra APROVA (com liderança + porte)" selected={form.approved_areas} onToggle={(value) => toggleArea('approved_areas', value)} />
              <AreaChips label="Áreas que a regra REJEITA direto" hint="Deixe vazio para não rejeitar ninguém por área." selected={form.blocked_areas} onToggle={(value) => toggleArea('blocked_areas', value)} />
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => patch({ is_default: e.target.checked })} disabled={form.is_default && !isNew}
              style={{ width: 14, height: 14, accentColor: '#0a66c2' }} />
            ICP padrão (pré-selecionado ao prospectar)
          </label>
          {!isNew && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} disabled={form.is_default}
                style={{ width: 14, height: 14, accentColor: '#0a66c2' }} />
              Ativo
            </label>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <div>
            {!isNew && !form.is_default && (
              confirmingDelete ? (
                <button type="button" onClick={remove} disabled={saving}
                  style={{ background: '#b42318', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Confirmar exclusão de "{form.name}"
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={saving}
                  style={{ background: '#fff', color: '#b42318', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Apagar ICP
                </button>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
            <button type="button" onClick={save} disabled={saving} style={{ background: '#0a66c2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando…' : isNew ? 'Criar ICP' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const LAST_ICP_STORAGE_KEY = 'cm.prospect.lastIcpIds';

function rememberIcps(icpIds) {
  try { window.localStorage.setItem(LAST_ICP_STORAGE_KEY, JSON.stringify(icpIds)); } catch { /* modo privado: sem memória, sem drama */ }
}

// Lê a última escolha. Aceita o formato antigo (uma string com um id só) porque a
// chave mudou de nome mas navegador de quem já usou a tela ainda pode ter a antiga.
function lastUsedIcps() {
  try {
    const bruto = window.localStorage.getItem(LAST_ICP_STORAGE_KEY);
    if (!bruto) return [];
    const lido = JSON.parse(bruto);
    if (Array.isArray(lido)) return lido.filter((id) => typeof id === 'string');
    return typeof lido === 'string' && lido ? [lido] : [];
  } catch { return []; }
}

// As três coisas que fazem sentido pedir num post que já foi prospectado antes. A
// do meio é a que o Felipe pediu em 27/08: voltar semanas depois e pegar só quem
// comentou desde então, sem pagar o post inteiro de novo na Apify.
const PROSPECT_MODES = [
  {
    id: 'novos',
    label: 'Só os comentários novos',
    hint: 'Lê do mais recente para trás e para assim que alcança os que já estão no banco. Gasta Apify só pelos novos.',
  },
  {
    id: 'somente_fila',
    label: 'Nenhum — só analisar quem já está no banco',
    hint: 'Zero Apify. Serve para rodar um ICP novo sobre os comentaristas que já temos.',
  },
  {
    id: 'tudo',
    label: 'Raspar o post inteiro de novo',
    hint: 'Paga todos os comentários outra vez. Só vale se desconfiar que a raspagem anterior ficou incompleta.',
  },
];

// Diálogo do botão Prospectar: QUAIS ICPs vão julgar os comentaristas deste post.
// Marca mais de um de propósito (pedido do Felipe em 27/08): um post atrai gente que
// serve para o público comercial e gente que serve para o outro, e clicar duas vezes
// no mesmo post para testar cada ICP era o contorno. Todos os ativos vêm marcados —
// o caso comum é querer os dois; desmarcar é a exceção.
//
// Custo: a raspagem da Apify é a mesma (um dataset por post, não por ICP), mas cada
// ICP marcado é uma chamada de LLM a mais por lead na fase de análise.
function ProspectIcpModal({ post, icps = [], alreadyProspected, onConfirm, onClose, onManage }) {
  const available = icps.filter((icp) => icp.active !== false);
  const [icpIds, setIcpIds] = useState(() => {
    const remembered = lastUsedIcps().filter((id) => available.some((icp) => icp.id === id));
    if (remembered.length) return remembered;
    return available.map((icp) => icp.id);
  });
  // O que fazer com um post que já foi prospectado. 'somente_fila' não toca na
  // Apify; 'novos' raspa só o que entrou depois da última vez; 'tudo' raspa o post
  // inteiro outra vez. Post novo não usa isto — não há o que reaproveitar.
  const [mode, setMode] = useState('novos');
  const chosen = available.filter((icp) => icpIds.includes(icp.id));

  const toggle = (id) => setIcpIds((prev) => (
    prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
  ));

  const confirm = () => {
    if (!chosen.length) return;
    // Grava na ordem em que estão na lista, não na ordem dos cliques: o primeiro ICP
    // é o que nomeia o job na tela de prospecção.
    const ordenados = available.filter((icp) => icpIds.includes(icp.id)).map((icp) => icp.id);
    rememberIcps(ordenados);
    onConfirm({ icpIds: ordenados, mode: alreadyProspected ? mode : 'novos' });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(600px, 100%)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }} onClick={(e) => e.stopPropagation()}>
        <span className="cm-eyebrow">Prospectar post</span>
        <h2 style={{ margin: '4px 0 2px', fontSize: 17 }}>Quais ICPs usar neste post?</h2>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#64748b' }}>
          {post?.hook ? `“${String(post.hook).slice(0, 110)}${String(post.hook).length > 110 ? '…' : ''}”` : 'Post selecionado'}
        </p>

        {!available.length ? (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 10, padding: 12, fontSize: 13 }}>
            Nenhum ICP ativo cadastrado. Crie um em <strong>Gerenciar ICPs</strong> antes de prospectar.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {available.map((icp) => {
              const on = icpIds.includes(icp.id);
              return (
                <button key={icp.id} type="button" onClick={() => toggle(icp.id)}
                  aria-pressed={on}
                  style={{ textAlign: 'left', border: `1px solid ${on ? '#0a66c2' : '#e2e8f0'}`, background: on ? '#eff6ff' : '#fff', borderRadius: 10, padding: '11px 13px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={on} readOnly tabIndex={-1}
                    style={{ width: 15, height: 15, marginTop: 2, accentColor: '#0a66c2', pointerEvents: 'none', flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5, color: '#0f172a' }}>
                    {icp.name}
                    {icp.is_default && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#0a66c2', fontWeight: 700 }}>PADRÃO</span>}
                  </strong>
                  <small style={{ display: 'block', color: '#64748b', marginTop: 3, lineHeight: 1.45 }}>
                    {icp.hard_rules_enabled
                      ? `Regra dura ligada${icp.min_company_size ? ` · ${icp.min_company_size}+ colaboradores` : ''}${(icp.approved_areas || []).length ? ` · ${(icp.approved_areas || []).join(', ')}` : ''}`
                      : 'Sem regra dura — quem decide é o texto de critérios'}
                  </small>
                  <small style={{ display: 'block', color: '#94a3b8', marginTop: 3 }}>
                    {String(icp.icp_rules || 'Sem critérios escritos — o agente cai no padrão do código.').slice(0, 130)}
                    {String(icp.icp_rules || '').length > 130 ? '…' : ''}
                  </small>
                  </span>
                </button>
              );
            })}
            {available.length > 1 && (
              <small style={{ color: '#64748b', fontSize: 11.5, marginTop: 2 }}>
                {chosen.length > 1
                  ? `Cada comentarista vai ser lido e julgado pelos ${chosen.length} ICPs marcados — o mesmo perfil pode ser aprovado num e rejeitado no outro. A raspagem é uma só; a análise custa uma passada de IA por ICP.`
                  : 'Marque mais de um para julgar o mesmo post pelos dois públicos numa tacada.'}
              </small>
            )}
          </div>
        )}

        {alreadyProspected && (
          <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
            <strong style={{ fontSize: 12.5, color: '#0f172a' }}>Este post já foi prospectado. O que buscar?</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
              {PROSPECT_MODES.map((opcao) => {
                const on = mode === opcao.id;
                return (
                  <label key={opcao.id}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', border: `1px solid ${on ? '#0a66c2' : '#e2e8f0'}`, background: on ? '#eff6ff' : '#fff', borderRadius: 9, padding: '9px 11px' }}>
                    <input type="radio" name="prospect-mode" checked={on} onChange={() => setMode(opcao.id)}
                      style={{ width: 14, height: 14, marginTop: 2, accentColor: '#0a66c2', flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: 12.5, color: '#0f172a', display: 'block' }}>{opcao.label}</strong>
                      <small style={{ color: '#64748b', fontSize: 11.5, lineHeight: 1.45 }}>{opcao.hint}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={onManage} style={{ background: '#fff', color: '#0a66c2', border: '1px solid #cfe0f5', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Gerenciar ICPs
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="button" onClick={confirm} disabled={!chosen.length}
              style={{ background: chosen.length ? '#0a66c2' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: chosen.length ? 'pointer' : 'not-allowed' }}>
              {chosen.length > 1 ? `Prospectar com ${chosen.length} ICPs` : 'Prospectar com este ICP'}
            </button>
          </div>
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

const modalBackdrop = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 20 };
const modalCard = { background: '#fff', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(15,23,42,.25)' };
const modalHead = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid #eef1f5' };
const closeButton = { background: 'transparent', border: 'none', color: '#64748b', fontSize: 20, lineHeight: 1, cursor: 'pointer', fontWeight: 700 };

const dataHora = (value) => (value
  ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—');

/** Detalhe de um telefone MATCHED: de onde veio e com que confiança. */
function PhoneDetailModal({ lead, row, onClose }) {
  const numero = phoneDisplay(row);
  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div style={modalCard} onMouseDown={(event) => event.stopPropagation()}>
        <header style={modalHead}>
          <div>
            <span className="cm-eyebrow">Telefone encontrado</span>
            <h2 style={{ margin: '2px 0 0', fontSize: 18 }}>{lead.full_name}</h2>
          </div>
          <button type="button" onClick={onClose} style={closeButton} aria-label="Fechar">×</button>
        </header>
        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #a7d7bd', background: '#eafaf1', borderRadius: 9, padding: '11px 13px' }}>
            <Phone size={16} style={{ color: '#067647' }} />
            <strong style={{ fontSize: 17, color: '#067647', letterSpacing: '.01em' }}>{numero}</strong>
            {whatsappLink(row) && (
              <a href={whatsappLink(row)} target="_blank" rel="noopener noreferrer"
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 7, background: '#067647', color: '#fff', padding: '6px 11px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                <MessageCircle size={13} /> WhatsApp
              </a>
            )}
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 14px', margin: 0, fontSize: 12.5 }}>
            <dt style={{ color: '#64748b', fontWeight: 700 }}>Formulário</dt>
            <dd style={{ margin: 0 }}>{row.phone_form_name || '—'}</dd>
            <dt style={{ color: '#64748b', fontWeight: 700 }}>Data da submission</dt>
            <dd style={{ margin: 0 }}>{dataHora(row.phone_submitted_at)}</dd>
            <dt style={{ color: '#64748b', fontWeight: 700 }}>Confiança</dt>
            <dd style={{ margin: 0 }}>{row.confidence == null ? '—' : `${Math.round(Number(row.confidence) * 100)}%`}</dd>
            <dt style={{ color: '#64748b', fontWeight: 700 }}>Método</dt>
            <dd style={{ margin: 0 }}><code style={{ fontSize: 11.5 }}>{row.match_method || '—'}</code></dd>
            <dt style={{ color: '#64748b', fontWeight: 700 }}>Evidências</dt>
            <dd style={{ margin: 0 }}>
              {(Array.isArray(row.evidence) ? row.evidence : []).length
                ? <ul style={{ margin: 0, paddingLeft: 16 }}>{row.evidence.map((item) => <li key={item}>{evidenceLabel(item)}</li>)}</ul>
                : '—'}
            </dd>
            {row.reviewed_by && <>
              <dt style={{ color: '#64748b', fontWeight: 700 }}>Confirmado por</dt>
              <dd style={{ margin: 0 }}>{row.reviewed_by} · {dataHora(row.reviewed_at)}</dd>
            </>}
          </dl>
          <small style={{ color: '#94a3b8' }}>
            O telefone vem exclusivamente das nossas submissions do Tally — nunca de fonte externa.
          </small>
        </div>
      </div>
    </div>
  );
}

/** Fila de REVIEW. Regra desta tela: o número NUNCA aparece antes da decisão. Só
 *  mostramos se o candidato tem telefone, para o revisor saber se vale confirmar. */
function ReviewMatchModal({ lead, row, postHook, reviewer, busy, onDecide, onClose }) {
  const candidatos = reviewCandidates(row);
  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div style={modalCard} onMouseDown={(event) => event.stopPropagation()}>
        <header style={modalHead}>
          <div>
            <span className="cm-eyebrow">Revisar match · decisão humana</span>
            <h2 style={{ margin: '2px 0 0', fontSize: 18 }}>{lead.full_name}</h2>
          </div>
          <button type="button" onClick={onClose} style={closeButton} aria-label="Fechar">×</button>
        </header>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef1f5' }}>
          <strong style={{ fontSize: 12, color: '#475569' }}>Lead ICP</strong>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 14px', margin: '7px 0 0', fontSize: 12.5 }}>
            <dt style={{ color: '#64748b' }}>Cargo</dt><dd style={{ margin: 0 }}>{lead.job_title || lead.headline || '—'}</dd>
            <dt style={{ color: '#64748b' }}>Empresa</dt><dd style={{ margin: 0 }}>{lead.company_name || '—'}</dd>
            <dt style={{ color: '#64748b' }}>LinkedIn</dt>
            <dd style={{ margin: 0 }}>{lead.profile_url
              ? <a href={lead.profile_url} target="_blank" rel="noreferrer">{lead.profile_url.replace(/^https?:\/\/(www\.)?/, '')}</a>
              : '—'}</dd>
            <dt style={{ color: '#64748b' }}>Comentou em</dt><dd style={{ margin: 0 }}>{postHook ? `“${postHook}”` : '—'}</dd>
          </dl>
        </div>

        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 12, color: '#475569' }}>
              {candidatos.length === 1 ? 'Candidato no Tally' : `${candidatos.length} candidatos no Tally`}
            </strong>
            <small style={{ color: '#b42318', fontWeight: 700 }}>{reviewReason(row)}</small>
          </div>

          {!candidatos.length && (
            <div className="cm-empty" style={{ marginTop: 10 }}>
              Todos os candidatos deste lead já foram rejeitados. A próxima sincronização pode trazer novos.
            </div>
          )}

          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {candidatos.map((candidato) => (
              <div key={candidato.submissionId} style={{ border: '1px solid #e2e8f0', borderRadius: 9, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 13.5 }}>{candidato.fullName}</strong>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{candidato.email || 'sem e-mail'}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: candidato.hasPhone ? '#067647' : '#8a6100', background: candidato.hasPhone ? '#eafaf1' : '#fff8e6', border: `1px solid ${candidato.hasPhone ? '#a7d7bd' : '#f0d69a'}`, borderRadius: 999, padding: '3px 9px', height: 'fit-content' }}>
                    {candidato.hasPhone ? 'tem telefone' : 'sem telefone'}
                  </span>
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '9px 0 0', fontSize: 12 }}>
                  <dt style={{ color: '#64748b' }}>Formulário</dt><dd style={{ margin: 0 }}>{candidato.formName || '—'}</dd>
                  <dt style={{ color: '#64748b' }}>Submission</dt><dd style={{ margin: 0 }}>{dataHora(candidato.submittedAt)}</dd>
                  <dt style={{ color: '#64748b' }}>Evidências</dt>
                  <dd style={{ margin: 0 }}>{candidato.evidence.length
                    ? <ul style={{ margin: 0, paddingLeft: 16 }}>{candidato.evidence.map((item) => <li key={item}>{evidenceLabel(item)}</li>)}</ul>
                    : 'nenhuma além do nome'}</dd>
                </dl>
                <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                  <button type="button" disabled={busy} onClick={() => onDecide(candidato.submissionId, 'confirmed')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #a7d7bd', background: '#eafaf1', color: '#067647', borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                    <Check size={12} /> É a mesma pessoa
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDecide(candidato.submissionId, 'rejected')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                    <X size={12} /> Não é a mesma pessoa
                  </button>
                </div>
              </div>
            ))}
          </div>

          <small style={{ display: 'block', marginTop: 13, color: '#94a3b8' }}>
            O telefone não é exibido enquanto o match está em revisão. Confirmando, ele é liberado
            só se a submission escolhida tiver número. A decisão fica registrada como <strong>{reviewer}</strong>.
          </small>
        </div>
      </div>
    </div>
  );
}

/** Administração dos vínculos Post ↔ Formulário do Tally. */
function LeadMagnetsModal({ client, reviewer, onClose, onNotice }) {
  const [rows, setRows] = useState(null);
  const [forms, setForms] = useState([]);
  const [saving, setSaving] = useState('');
  const [erro, setErro] = useState('');

  const load = React.useCallback(async () => {
    setErro('');
    // O LinkedIn cortou o alcance de post com CTA de comentário (jul/2026), então os
    // lead magnets novos entram SEM cta_keyword — e o coletor sobrescreve cta_keyword
    // todo dia, então não dá pra "marcar" o post por ali. Por isso a lista não pode
    // mais se limitar a "tem CTA": mostra também os posts recentes (últimos 60 dias) e
    // os que já têm vínculo, pra QUALQUER post poder ser ligado a um formulário aqui.
    const recentSince = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    try {
      const [posts, links] = await Promise.all([
        client.from('content_posts').select('id, hook, cta_keyword, published_at, author_name')
          .or(`cta_keyword.not.is.null,published_at.gte.${recentSince}`)
          .order('published_at', { ascending: false }).limit(400),
        client.from('post_lead_magnets').select('post_id, tally_form_id, tally_form_name, source'),
      ]);
      if (posts.error) throw posts.error;
      if (links.error) throw links.error;
      const byPost = new Map((links.data || []).map((link) => [link.post_id, link]));
      // 'Sem CTA' é o valor de post sem chamada nenhuma; escondemos SÓ quando o post é
      // antigo (fora da janela recente) e não tem vínculo — senão o lead magnet novo
      // (que hoje entra sem CTA) sumiria de novo, que é o bug que estamos consertando.
      const list = (posts.data || []).filter((post) => {
        const cta = String(post.cta_keyword || '').trim();
        const recente = String(post.published_at || '').slice(0, 10) >= recentSince;
        return recente || byPost.has(post.id) || (cta && cta !== 'Sem CTA');
      });
      // Garante que todo post já vinculado apareça, mesmo se caiu fora do limit/janela.
      const carregados = new Set(list.map((post) => post.id));
      const faltando = [...byPost.keys()].filter((id) => !carregados.has(id));
      if (faltando.length) {
        const extra = await client.from('content_posts')
          .select('id, hook, cta_keyword, published_at, author_name').in('id', faltando);
        if (!extra.error) list.push(...(extra.data || []));
      }
      list.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
      setRows(list.map((post) => ({ post, link: byPost.get(post.id) || null })));
    } catch (error) {
      setErro(`Não consegui carregar os posts: ${error instanceof Error ? error.message : String(error)}`);
      setRows([]);
      return;
    }

    // Os formulários saem das submissions que já ingerimos (v_tally_forms) — são
    // exatamente os que interessam, e não depende da API do Tally estar de pé.
    const { data: formList, error } = await client.from('v_tally_forms').select('*').order('submissions', { ascending: false });
    if (error) {
      setForms([]);
      setErro(`Vínculos carregados, mas não consegui listar os formulários (${error.message}). O dropdown fica indisponível.`);
      return;
    }
    setForms((formList || []).map((form) => ({ id: form.form_id, name: form.form_name, submissions: form.submissions })));
  }, [client]);

  useEffect(() => { load(); }, [load]);

  async function salvar(postId, tallyFormId) {
    setSaving(postId);
    try {
      const form = forms.find((item) => item.id === tallyFormId);
      const { error } = await client.rpc('set_post_lead_magnet', {
        p_post_id: postId, p_tally_form_id: tallyFormId || null,
        p_tally_form_name: form?.name || null, p_reviewer: reviewer,
      });
      if (error) throw new Error(error.message);
      onNotice?.(tallyFormId ? `Vínculo salvo: ${form?.name || tallyFormId}` : 'Vínculo removido.');
      await load();
    } catch (error) {
      onNotice?.(`Não consegui salvar o vínculo: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving('');
    }
  }

  const vinculados = (rows || []).filter((row) => row.link).length;

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div style={{ ...modalCard, maxWidth: 900 }} onMouseDown={(event) => event.stopPropagation()}>
        <header style={modalHead}>
          <div>
            <span className="cm-eyebrow">Configuração</span>
            <h2 style={{ margin: '2px 0 0', fontSize: 18 }}>Post ↔ Formulário do Tally</h2>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 12, maxWidth: 620 }}>
              Quem preencheu o formulário do próprio post em que comentou ganha confiança máxima no
              cruzamento. Vínculo errado viraria telefone na pessoa errada — por isso os casos ambíguos
              ficaram sem vínculo automático e são resolvidos aqui. Posts recentes sem CTA (o LinkedIn
              cortou o formato de comentário) também aparecem, para você vinculá-los à mão.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeButton} aria-label="Fechar">×</button>
        </header>

        <div style={{ padding: 18 }}>
          {erro && <div className="cm-empty" style={{ marginBottom: 12 }}>{erro}</div>}
          {rows === null ? (
            <div className="cm-empty">Carregando posts e formulários…</div>
          ) : !rows.length ? (
            <div className="cm-empty">Nenhum post recente ou vinculado para configurar.</div>
          ) : (
            <>
              <small style={{ display: 'block', marginBottom: 9, color: '#64748b', fontWeight: 600 }}>
                {vinculados} de {rows.length} posts vinculados
              </small>
              <div className="cm-table-wrap">
                <table className="cm-table">
                  <thead><tr><th>Post</th><th>CTA</th><th>Formulário do Tally</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
                  <tbody>
                    {rows.map(({ post, link }) => (
                      <tr key={post.id}>
                        <td style={{ maxWidth: 240 }}>
                          <small title={post.hook}>{String(post.hook || '').slice(0, 70) || '—'}</small>
                          <small style={{ display: 'block', color: '#94a3b8' }}>{String(post.published_at || '').slice(0, 10)} · {post.author_name || '—'}</small>
                        </td>
                        <td><code style={{ fontSize: 11.5 }}>{post.cta_keyword || '— sem CTA —'}</code></td>
                        <td>
                          <select
                            value={link?.tally_form_id || ''}
                            disabled={saving === post.id || !forms.length}
                            title={forms.length ? undefined : 'Lista de formulários indisponível'}
                            onChange={(event) => salvar(post.id, event.target.value)}
                            style={{ maxWidth: 300, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                            <option value="">— sem vínculo —</option>
                            {forms.map((form) => (
                              <option key={form.id} value={form.id}>{form.name} ({form.submissions})</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {saving === post.id ? <RefreshCw size={12} className="spin" /> : link ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#067647' }}>
                              Vinculado
                              <small style={{ display: 'block', color: '#94a3b8', fontWeight: 600 }}>
                                {link.source === 'manual' ? 'manual' : 'automático'}
                              </small>
                            </span>
                          ) : <span style={{ fontSize: 11, fontWeight: 700, color: '#8a6100' }}>Configurar</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const PHONE_TONES = {
  ok: { bg: '#eafaf1', border: '#a7d7bd', color: '#067647' },
  wait: { bg: '#fff8e6', border: '#f0d69a', color: '#8a6100' },
  review: { bg: '#fff1f2', border: '#fbc4c9', color: '#b42318' },
  none: { bg: '#f8fafc', border: '#e2e8f0', color: '#64748b' },
};

/** Célula "Telefone / Tally". O número só aparece via phoneDisplay(), que devolve
 *  vazio fora de MATCHED — REVIEW e MATCHED_NO_PHONE não têm como exibir telefone. */
function PhoneCell({ row, onDetail, onReview }) {
  if (!row) return <small style={{ color: '#94a3b8' }}>—</small>;
  const status = phoneStatusOf(row);
  const meta = phoneStatusMeta(row);
  const tone = PHONE_TONES[meta.tone];
  const numero = phoneDisplay(row);

  if (status === 'MATCHED' && numero) {
    // Clicar no número abre a conversa no WhatsApp: é o que o comercial faz com ele.
    // A origem do telefone continua a um clique de distância, no ícone ao lado.
    const whatsapp = whatsappLink(row);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" title={`Abrir conversa no WhatsApp com ${numero}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 7, padding: '4px 8px', fontSize: 11.5, fontWeight: 700, textDecoration: 'none' }}>
            <MessageCircle size={11} /> {numero}
          </a>
        ) : (
          <span title="Número fora do padrão para abrir no WhatsApp"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 7, padding: '4px 8px', fontSize: 11.5, fontWeight: 700 }}>
            <Phone size={11} /> {numero}
          </span>
        )}
        <button type="button" onClick={() => onDetail(row)} title="Ver origem do telefone"
          aria-label={`Ver origem do telefone ${numero}`}
          style={{ display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', color: '#94a3b8', padding: 2, cursor: 'pointer' }}>
          <Info size={12} />
        </button>
        {/* Vinculado sozinho: marca discreta + caminho para corrigir. Não é fila —
            o número já está usável; isto existe para quem quiser conferir. */}
        {isAutoMatch(row) && (
          <button type="button" onClick={() => onReview(row)}
            title={`Vínculo automático. ${reviewReason(row)} Clique para conferir ou corrigir.`}
            aria-label={`Conferir o vínculo automático do telefone de ${row.full_name || 'lead'}`}
            style={{ display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', color: '#cbd5e1', padding: 2, cursor: 'pointer' }}>
            <Sparkles size={11} />
          </button>
        )}
      </span>
    );
  }

  // Linha antiga que ficou parada na fila humana. O matcher não produz mais REVIEW;
  // estas somem no próximo sync do Tally, que as reprocessa e decide sozinho.
  if (status === 'REVIEW') {
    return (
      <button type="button" onClick={() => onReview(row)} title="Revisar os candidatos encontrados (fila antiga — o próximo sync do Tally decide sozinho)"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 7, padding: '4px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
        <AlertTriangle size={11} /> Revisar match
      </button>
    );
  }

  // Achou a pessoa mas ela não deixou telefone. Em vez de dizer "aguardando" (não há
  // o que aguardar), mostra por qual material ela entrou: é o que dá para usar numa
  // abordagem pelo LinkedIn, o canal que sobra.
  if (status === 'MATCHED_NO_PHONE') {
    const material = downloadedMagnet(row);
    return (
      <span title={material
        ? `Esta pessoa baixou "${material}". O formulário não pedia telefone, então não há número — mas ela já é um contato morno. Se preencher outro formulário com telefone, aparece aqui sozinho.`
        : 'Pessoa identificada nas nossas submissions do Tally, mas nenhuma delas tem telefone.'}
        style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 700, maxWidth: 160 }}>
        <span>{meta.short}</span>
        {material && (
          <small style={{ fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {material}
          </small>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>
      {meta.short}
    </span>
  );
}

/** Botão de sincronizar + rótulo discreto de última sync. Não é dashboard: uma linha. */
function TallySyncControls({ syncing, result, stats, onSync, onDismiss, onOpenMagnets }) {
  const ultima = stats?.ultimaSync
    ? new Date(stats.ultimaSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 6 }}>
      {result && (
        <div role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${result.falha ? '#fbc4c9' : '#a7d7bd'}`, background: result.falha ? '#fff1f2' : '#eafaf1', color: result.falha ? '#b42318' : '#067647', borderRadius: 7, padding: '4px 9px', fontSize: 11, fontWeight: 600, maxWidth: 460 }}>
          {result.falha ? (
            <span>Falha na sincronização: {result.falha}</span>
          ) : (
            <span>
              {integer.format(result.submissions)} submissions · {integer.format(result.novas)} novas · {integer.format(result.comTelefone)} com telefone
              {result.telefonesNovos > 0 && <> · <strong>{integer.format(result.telefonesNovos)} telefone(s)</strong></>}
              {result.revisar > 0 && <> · {integer.format(result.revisar)} p/ revisar</>}
              {result.erros?.length > 0 && <> · <strong title={result.erros.join(' | ')}>{result.erros.length} formulário(s) com erro</strong></>}
            </span>
          )}
          <button type="button" onClick={onDismiss} aria-label="Fechar resumo" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 800 }}>×</button>
        </div>
      )}
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" onClick={onOpenMagnets} title="Vincular posts aos formulários do Tally"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            <SlidersHorizontal size={12} /> Lead Magnets
          </button>
          <button type="button" onClick={onSync} disabled={syncing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #9db8e8', background: syncing ? '#eef4fc' : '#0a66c2', color: syncing ? '#0a66c2' : '#fff', borderRadius: 7, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}>
            {syncing ? <><RefreshCw size={12} className="spin" /> Sincronizando Tally…</> : <><RefreshCw size={12} /> Sincronizar Tally</>}
          </button>
        </div>
        {(ultima || stats?.total) && (
          <small style={{ color: '#94a3b8', fontSize: 10 }}>
            {ultima && <>Última sync: {ultima}</>}
            {ultima && stats?.total ? ' · ' : ''}
            {stats?.total ? `${integer.format(stats.total)} submissions · ${integer.format(stats.comTelefone)} com telefone` : ''}
          </small>
        )}
      </div>
    </div>
  );
}

function LeadsSection({ data, client, currentUser = '', onNotice, onReload }) {
  // Perfil selecionado no Hub. Nao e identidade autenticada — o app nao tem login —
  // mas e o que da para registrar em reviewed_by, e o proxy valida contra a lista.
  const currentProfile = ['Felipe', 'Victor', 'Fernando', 'Junior'].includes(currentUser) ? currentUser : 'Felipe';
  const [filter, setFilter] = useState('qualified');
  const [postFilter, setPostFilter] = useState('');
  // '' = todos os ICPs (mostra o veredito espelhado, o mais recente de cada lead).
  // Com um ICP escolhido, a lista é só quem passou por ele, com o veredito DELE.
  const [icpFilter, setIcpFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, qualified, status: 'running'|'done'|'error', message }
  const [analyzingIds, setAnalyzingIds] = useState(() => new Set()); // leads no lote em análise agora
  const [sortConfig, setSortConfig] = useState({ key: 'score', direction: 'desc' });
  const stopEnrichRef = React.useRef(false);
  const [busyLead, setBusyLead] = useState('');
  const [modal, setModal] = useState(null); // { lead, message }
  const [showIcpModal, setShowIcpModal] = useState(false);
  // Telefone vindo da Base Tally. Nenhum destes estados guarda número: o telefone é
  // sempre lido da linha via phoneDisplay(), que bloqueia fora de MATCHED.
  const [phoneFilter, setPhoneFilter] = useState('todos');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);   // { lead, row }
  const [phoneDetail, setPhoneDetail] = useState(null);   // { lead, row }
  const [showMagnetsModal, setShowMagnetsModal] = useState(false);
  const [outreachOverrides, setOutreachOverrides] = useState({});
  const [exporting, setExporting] = useState('');
  const [excludedExportIds, setExcludedExportIds] = useState(() => new Set());
  const exportAllRef = React.useRef(null);

  const allLeads = data?.leads || [];
  const icps = data?.icpProfiles || [];
  const icpNameById = useMemo(() => {
    const map = {};
    icps.forEach((icp) => { if (icp.id) map[icp.id] = icp.name; });
    return map;
  }, [icps]);
  // Uma coluna por ICP na tabela — só faz sentido a partir de dois: com um ICP só,
  // "aprovado" já é inequívoco e a coluna seria ruído. ICP desativado continua tendo
  // coluna enquanto houver veredito dele para ler; o histórico não some da tela
  // porque alguém tirou o ICP de circulação.
  const colunasIcp = useMemo(() => {
    if (icps.length < 2) return [];
    const comVeredito = new Set((data?.leadQualifications || []).map((row) => row.icp_id));
    return icps.filter((icp) => icp.active !== false || comVeredito.has(icp.id));
  }, [icps, data?.leadQualifications]);
  // Veredito por (lead, ICP). É o que permite "aprovado" significar coisas
  // diferentes em ICPs diferentes para a mesma pessoa.
  const qualByLeadIcp = useMemo(() => {
    const map = new Map();
    (data?.leadQualifications || []).forEach((row) => { map.set(`${row.lead_id}|${row.icp_id}`, row); });
    return map;
  }, [data?.leadQualifications]);
  // Leads que ainda esperam veredito (do ICP filtrado, ou de qualquer um).
  const leadsWithPendingVerdict = useMemo(() => {
    const set = new Set();
    (data?.leadQualifications || []).forEach((row) => {
      if (row.status !== 'pending') return;
      if (icpFilter && row.icp_id !== icpFilter) return;
      set.add(row.lead_id);
    });
    return set;
  }, [data?.leadQualifications, icpFilter]);
  // Com um ICP selecionado, a lista inteira passa a falar a língua dele: quem nunca
  // foi avaliado por aquele ICP sai da tela, e status/score/motivo vêm da
  // qualificação daquele ICP em vez do espelho.
  const leads = useMemo(() => {
    if (!icpFilter) return allLeads;
    const projected = [];
    allLeads.forEach((lead) => {
      const qual = qualByLeadIcp.get(`${lead.id}|${icpFilter}`);
      if (!qual) return;
      projected.push({
        ...lead,
        qualification_status: qual.status,
        score: qual.score,
        qualification_reason: qual.reason,
        suggested_angle: qual.suggested_angle ?? lead.suggested_angle,
        qualification_icp_id: icpFilter,
      });
    });
    return projected;
  }, [allLeads, icpFilter, qualByLeadIcp]);
  const outreachByLead = useMemo(() => {
    const map = {};
    (data?.leadOutreach || []).forEach((o) => { map[o.lead_id] = o; });
    return { ...map, ...outreachOverrides };
  }, [data?.leadOutreach, outreachOverrides]);

  const postsById = useMemo(() => {
    const map = {};
    (data?.linkedin || []).forEach((post) => {
      if (post.id) map[post.id] = {
        hook: post.hook || post.content?.slice(0, 60) || '',
        owner: post.owner_name || '',
        media_url: post.media_url,
        media_type: post.media_type,
        format: post.format,
        external_post_id: post.external_post_id,
        published_at: post.published_at,
        post_url: post.post_url,
      };
    });
    return map;
  }, [data?.linkedin]);
  const postHookById = useMemo(() => {
    const map = {};
    Object.entries(postsById).forEach(([id, post]) => { map[id] = post.hook; });
    return map;
  }, [postsById]);

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

  // Leads filtrados apenas pelo post/criador (sem o filtro de status da aba ativa).
  // Usado para calcular a contagem de cada aba baseada no post filtrado.

  const filteredLeads = useMemo(() => {
    let list = leads;
    if (postFilter) list = list.filter((l) => leadPostId(l) === postFilter);
    if (creatorFilter) list = list.filter((l) => postsById[leadPostId(l)]?.owner === creatorFilter);
    return list;
  }, [leads, postFilter, creatorFilter, commentByLead, postsById]);

  const counts = useMemo(() => {
    let qualified = 0;
    let pending = 0;
    let disqualified = 0;
    filteredLeads.forEach((l) => {
      const status = outreachByLead[l.id]?.status === 'ignored' ? 'disqualified' : l.qualification_status;
      if (leadStatusSets.qualified.includes(status)) {
        qualified += 1;
      } else if (status === 'pending') {
        pending += 1;
      } else if (status === 'disqualified') {
        disqualified += 1;
      }
    });
    return {
      qualified,
      pending,
      disqualified,
      all: filteredLeads.length,
    };
  }, [filteredLeads, outreachByLead]);

  // Quantos leads cada post tem e quantos ainda faltam analisar (enrichment
  // pendente). "analisado" = já passou pelo enriquecimento (enriched/skipped/error).
  const postCounts = useMemo(() => {
    const map = {};
    leads.forEach((lead) => {
      const postId = leadPostId(lead);
      if (!postId) return;
      if (!map[postId]) map[postId] = { total: 0, pending: 0 };
      map[postId].total += 1;
      // "Falta analisar" é falta de veredito: depois de rodar outro ICP num post já
      // raspado, os leads estão enriquecidos e ainda assim faltam ser julgados.
      if (lead.enrichment_status === 'pending' || leadsWithPendingVerdict.has(lead.id)) map[postId].pending += 1;
    });
    return map;
  }, [leads, commentByLead, leadsWithPendingVerdict]);

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
      // String ISO ordena igual a data; '' joga quem não tem comentário pro fim.
      case 'commented_at': return commentByLead[lead.id]?.commented_at || '';
      case 'post': return (postHookById[leadPostId(lead)] || '').toLowerCase();
      default: return '';
    }
  };

  // Declarados depois de filteredLeads: os contadores contam sobre a mesma
  // população que a tabela exibe, e o filtro é aplicado dentro de `visible`.
  const phonesByLead = useMemo(() => indexPhonesByLead(data.leadPhones || []), [data.leadPhones]);
  const phonesForExport = useMemo(() => Object.fromEntries(phonesByLead), [phonesByLead]);
  const phoneCounts = useMemo(() => {
    const base = filter === 'all' ? filteredLeads : filteredLeads.filter((l) => {
      const status = outreachByLead[l.id]?.status === 'ignored' ? 'disqualified' : l.qualification_status;
      return (leadStatusSets[filter] || []).includes(status);
    });
    return countByPhoneFilter(base.map((l) => phonesByLead.get(l.id)).filter(Boolean));
  }, [filteredLeads, filter, outreachByLead, phonesByLead]);

  const visible = useMemo(() => {
    let list = filteredLeads;
    if (filter !== 'all') {
      list = filteredLeads.filter((l) => {
        const status = outreachByLead[l.id]?.status === 'ignored' ? 'disqualified' : l.qualification_status;
        return (leadStatusSets[filter] || []).includes(status);
      });
    }
    // O filtro de telefone entra DEPOIS do de status: um lead marcado como
    // "ignorado" no outreach conta como descartado nesta tela, então precisa sair da
    // conta antes, senão o chip prometeria um resultado que a tabela não mostra.
    if (phoneFilter !== 'todos') {
      list = list.filter((l) => {
        const row = phonesByLead.get(l.id);
        return row ? matchesPhoneFilter(row, phoneFilter) : false;
      });
    }
    const sorted = [...list].sort((a, b) => {
      const av = sortValue(a, sortConfig.key);
      const bv = sortValue(b, sortConfig.key);
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredLeads, filter, sortConfig, commentByLead, postHookById, outreachByLead, phoneFilter, phonesByLead]);

  const requestSort = (key) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };
  const sortArrow = (key) => (sortConfig.key !== key ? ' ↕' : sortConfig.direction === 'asc' ? ' ▲' : ' ▼');

  const eligibleExportLeads = useMemo(() => selectLeadsForExport({
    leads: visible,
    outreachByLead,
  }), [visible, outreachByLead]);
  const selectedExportLeads = useMemo(() => selectLeadsForExport({
    leads: visible,
    outreachByLead,
    excludedIds: excludedExportIds,
  }), [visible, outreachByLead, excludedExportIds]);
  // As operações privilegiadas são funções do Postgres (SECURITY DEFINER). O
  // navegador só conhece o NOME da função; o collector secret fica no Vault e o
  // privilégio dentro do banco — nada sensível trafega pelo bundle, que é público.
  async function callRpc(fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(error.message || 'Falha na chamada ao banco');
    return data;
  }

  async function handleSyncTally() {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Dispara a MESMA edge function que o cron usa. pg_net é assíncrono, então a
      // função devolve o id da requisição e nós perguntamos pelo resultado.
      const requestId = await callRpc('trigger_tally_sync', { perfil: currentProfile });
      let body = null;
      for (let tentativa = 0; tentativa < 40 && !body; tentativa++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        body = await callRpc('tally_sync_result', { p_request_id: requestId });
      }
      if (!body) throw new Error('A sincronização demorou mais que o esperado. Os dados podem chegar em instantes.');
      if (body.ok === false) throw new Error(body.error || 'A sincronização falhou');
      const ingest = body.ingestao || {};
      const match = body.matching || {};
      const comErro = (ingest.por_formulario || []).filter((form) => form.error);
      setSyncResult({
        submissions: ingest.submissions_recebidas || 0,
        novas: ingest.novas_inseridas || 0,
        comTelefone: ingest.com_telefone || 0,
        telefonesNovos: match.telefones_seguros || 0,
        revisar: match.REVIEW || 0,
        aguardando: match.MATCHED_NO_PHONE || 0,
        // Erro parcial não esconde o resto do resultado.
        erros: comErro.map((form) => `${form.formName}: ${form.error}`),
      });
      await onReload?.();
    } catch (error) {
      setSyncResult({ falha: error instanceof Error ? error.message : String(error) });
    } finally {
      setSyncing(false);
    }
  }

  async function handleReviewDecision(leadId, submissionId, decision) {
    setBusyLead(leadId);
    try {
      const body = await callRpc('resolve_lead_phone_review', {
        p_lead_id: leadId, p_submission_id: submissionId, p_decision: decision, p_reviewer: currentProfile,
      });
      onNotice?.(decision === 'confirmed'
        ? `Match confirmado — lead marcado como ${body.status === 'MATCHED' ? 'telefone encontrado' : 'aguardando telefone'}.`
        : 'Candidato rejeitado. Ele não será sugerido novamente para este lead.');
      setReviewModal(null);
      await onReload?.();
    } catch (error) {
      onNotice?.(`Não consegui registrar a decisão: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyLead('');
    }
  }


  // As colunas por ICP da planilha são as mesmas da tabela: quem exporta precisa
  // enxergar "aprovado pra qual público" fora do app.
  const exportColumns = useMemo(() => leadExportColumns(colunasIcp), [colunasIcp]);
  const exportRows = useMemo(() => buildLeadExportRows({
    leads: selectedExportLeads,
    postsById,
    commentByLead,
    outreachByLead,
    phonesByLead: phonesForExport,
    icps: colunasIcp,
    qualificationByLeadIcp: qualByLeadIcp,
  }), [selectedExportLeads, postsById, commentByLead, outreachByLead, phonesForExport, colunasIcp, qualByLeadIcp]);
  const allEligibleSelected = eligibleExportLeads.length > 0 && selectedExportLeads.length === eligibleExportLeads.length;

  useEffect(() => {
    if (exportAllRef.current) {
      exportAllRef.current.indeterminate = selectedExportLeads.length > 0 && !allEligibleSelected;
    }
  }, [selectedExportLeads.length, allEligibleSelected]);

  const toggleLeadForExport = (leadId) => {
    setExcludedExportIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleAllVisibleForExport = () => {
    setExcludedExportIds((current) => {
      const next = new Set(current);
      eligibleExportLeads.forEach((lead) => {
        if (allEligibleSelected) next.add(lead.id);
        else next.delete(lead.id);
      });
      return next;
    });
  };

  const exportVisibleLeads = async (format) => {
    if (!exportRows.length || exporting) return;
    const selectedPost = postsById[postFilter];
    const filterLabel = leadFilterChips.find((chip) => chip.id === filter)?.label || filter;
    const fileName = buildLeadExportFilename(format, {
      status: filterLabel,
      creator: creatorFilter,
      post: selectedPost?.hook,
    });
    setExporting(format);
    try {
      if (format === 'csv') downloadLeadCsv(exportRows, fileName, exportColumns);
      else await downloadLeadExcel(exportRows, fileName, exportColumns);
      onNotice(`${integer.format(exportRows.length)} lead(s) exportado(s) para ${format === 'csv' ? 'CSV' : 'Excel'}.`);
    } catch (error) {
      onNotice(`Falha ao exportar: ${error?.message || error}`);
    } finally {
      setExporting('');
    }
  };

  // Fila pendente na ordem que o backend processa (mais antigos primeiro).
  // "Pendente" é falta de VEREDITO, não só de enriquecimento: quem já estava no
  // banco e entrou na fila de um ICP novo já está enriquecido e ainda assim precisa
  // de análise (só LLM, sem raspar de novo).
  const pendingQueue = useMemo(() => (
    leads
      .filter((l) => l.enrichment_status === 'pending' || leadsWithPendingVerdict.has(l.id))
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  ), [leads, leadsWithPendingVerdict]);
  // Se há filtro de post/criador ativo, a fila a analisar é só a daquele recorte —
  // o botão "Analisar fila" processa exatamente o que está filtrado na tela. Sem
  // filtro, é a fila inteira (comportamento de antes).
  const hasQueueFilter = Boolean(postFilter || creatorFilter || icpFilter);
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
        done += (res.processed || 0) + (res.prefiltered || 0) + (res.requalified || 0);
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
      // O ICP em foco define a mensagem: cada público tem o próprio texto de 1º contato.
      const { data: res, error } = await client.functions.invoke('lead-outreach', { body: { manual: true, action: 'generate_message', leadId: lead.id, icpId: icpFilter || lead.qualification_icp_id || undefined } });
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
            title="Criar e editar os ICPs: critérios de qualificação, mensagem de 1º contato e regra dura de cada um"
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0a66c2'; e.currentTarget.style.background = '#f0f7fd'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}>
            <Settings size={13} /> Ver/editar ICPs
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
          {/* Filtro de ICP: com um ICP escolhido, a lista mostra o veredito DELE. */}
          {icps.length > 1 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#475569', letterSpacing: '.02em' }}>
              ICP
              <select value={icpFilter} onChange={(e) => setIcpFilter(e.target.value)}
                aria-label="Filtrar leads pelo ICP que os qualificou"
                style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontWeight: 600, color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
                <option value="">Todos · melhor veredito entre os ICPs</option>
                {icps.map((icp) => (
                  <option key={icp.id} value={icp.id}>
                    {icp.name}{icp.active === false ? ' (desativado)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(postFilter || creatorFilter || icpFilter) && (
            <button type="button" onClick={() => { setPostFilter(''); setCreatorFilter(''); setIcpFilter(''); }}
              style={{ background: 'transparent', border: 'none', color: '#0a66c2', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
              Limpar filtros
            </button>
          )}
          {icpFilter && (
            <small style={{ color: '#64748b', fontSize: 11.5 }}>
              Mostrando só quem foi avaliado por <strong>{icpNameById[icpFilter] || 'este ICP'}</strong> — status, score e motivo são os dele.
              {icps.find((icp) => icp.id === icpFilter)?.active === false && ' Este ICP está desativado: a lista é histórico, não recebe leads novos.'}
            </small>
          )}
        </div>
        {/* Linha 2: chips de status */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <TallySyncControls
              syncing={syncing}
              result={syncResult}
              stats={data.tallyStats}
              onSync={handleSyncTally}
              onDismiss={() => setSyncResult(null)}
              onOpenMagnets={() => setShowMagnetsModal(true)}
            />
            <span style={{ color: '#64748b', fontSize: 11.5, fontWeight: 600, marginRight: 2 }}><Download size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />Exportar {integer.format(exportRows.length)} selecionado(s):</span>
            <button type="button" onClick={() => exportVisibleLeads('xlsx')} disabled={!exportRows.length || Boolean(exporting)}
              aria-label="Exportar leads filtrados para Excel"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #a7d7bd', background: '#f0fdf4', color: '#067647', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: exportRows.length && !exporting ? 'pointer' : 'not-allowed', opacity: exportRows.length && !exporting ? 1 : 0.55 }}>
              {exporting === 'xlsx' ? <RefreshCw size={12} className="spin" /> : <FileSpreadsheet size={12} />} Excel
            </button>
            <button type="button" onClick={() => exportVisibleLeads('csv')} disabled={!exportRows.length || Boolean(exporting)}
              aria-label="Exportar leads filtrados para CSV"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: exportRows.length && !exporting ? 'pointer' : 'not-allowed', opacity: exportRows.length && !exporting ? 1 : 0.55 }}>
              {exporting === 'csv' ? <RefreshCw size={12} className="spin" /> : <FileText size={12} />} CSV
            </button>
          </div>
        </div>

        {/* Filtro por estado do telefone na Base Tally */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '.02em' }}>
            <Phone size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />TELEFONE / TALLY
          </span>
          {PHONE_FILTERS.map((chip) => {
            const isActive = phoneFilter === chip.id;
            // A fila de revisão acabou: o chip legado só existe enquanto sobrar linha
            // antiga em REVIEW (some sozinho depois do próximo sync do Tally).
            if (chip.legacy && !(phoneCounts[chip.id] || 0) && !isActive) return null;
            return (
              <button type="button" key={chip.id} onClick={() => setPhoneFilter(chip.id)}
                aria-pressed={isActive}
                style={{
                  border: `1px solid ${isActive ? '#0a66c2' : '#e2e8f0'}`,
                  background: isActive ? '#0a66c2' : '#fff',
                  color: isActive ? '#fff' : '#475569',
                  borderRadius: 999, padding: '4px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                }}>
                {chip.label} · {integer.format(phoneCounts[chip.id] || 0)}
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
              <th style={{ width: 38, textAlign: 'center' }} title="Selecionar os leads que irão para Excel/CSV">
                <input ref={exportAllRef} type="checkbox" checked={allEligibleSelected} disabled={!eligibleExportLeads.length}
                  onChange={toggleAllVisibleForExport} aria-label="Selecionar todos os leads para exportação"
                  style={{ width: 15, height: 15, cursor: eligibleExportLeads.length ? 'pointer' : 'not-allowed', accentColor: '#0a66c2' }} />
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('full_name')}>Lead{sortArrow('full_name')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} title="Score 0-100 do agente de qualificação" onClick={() => requestSort('score')}>Score{sortArrow('score')}</th>
              {/* Uma coluna por ICP: "aprovado" só quer dizer alguma coisa junto com
                  "aprovado PRA QUEM" quando existe mais de um público. */}
              {colunasIcp.map((icp) => (
                <th key={icp.id} style={{ textAlign: 'center', minWidth: 96 }}
                  title={`Veredito deste lead no ICP "${icp.name}"${icp.active === false ? ' (ICP desativado)' : ''}`}>
                  <span style={{ display: 'block', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {icp.name}
                  </span>
                </th>
              ))}
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('job_title')}>Cargo{sortArrow('job_title')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('company_name')}>Empresa{sortArrow('company_name')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('company_size')}>Porte{sortArrow('company_size')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('comment')}>Comentário feito{sortArrow('comment')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} title="Data e hora em que a pessoa comentou no post" onClick={() => requestSort('commented_at')}>Comentou em{sortArrow('commented_at')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('post')}>Post de origem{sortArrow('post')}</th>
              <th title="Telefone encontrado nas nossas submissions do Tally">Telefone / Tally</th>
              <th title="Motivo da decisão + ângulo sugerido de abordagem">Motivo / ângulo</th><th>Mensagem</th><th style={{ textAlign: 'center' }}>Prospectado</th><th style={{ textAlign: 'center' }}>Ignorar</th>
            </tr></thead>
            <tbody>
              {visible.map((lead) => {
                const outreach = outreachByLead[lead.id];
                const prospected = outreach?.status === 'prospected';
                const ignored = outreach?.status === 'ignored';
                const comment = commentByLead[lead.id];
                const analyzing = analyzingIds.has(lead.id);
                const eligibleForExport = outreach?.status !== 'prospected';
                const selectedForExport = eligibleForExport && !excludedExportIds.has(lead.id);
                return (
                  <tr key={lead.id}
                    className={`${analyzing ? 'cm-prospect-running-row' : ''} ${prospected ? 'cm-row-prospected' : ''}`}
                    style={(prospected || ignored) ? { opacity: 0.65 } : undefined}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedForExport} disabled={!eligibleForExport}
                        onChange={() => toggleLeadForExport(lead.id)}
                        aria-label={`${selectedForExport ? 'Desmarcar' : 'Selecionar'} ${lead.full_name || 'lead'} para exportação`}
                        title={eligibleForExport ? 'Incluir na exportação' : 'Já prospectado/enviado — não será exportado'}
                        style={{ width: 15, height: 15, cursor: eligibleForExport ? 'pointer' : 'not-allowed', accentColor: '#0a66c2' }} />
                    </td>
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
                    {colunasIcp.map((icp) => (
                      <td key={icp.id} style={{ textAlign: 'center' }}>
                        <IcpVerdictCell qualification={qualByLeadIcp.get(`${lead.id}|${icp.id}`)} />
                      </td>
                    ))}
                    <td style={{ maxWidth: 200 }}><span title={lead.headline || ''}>{lead.job_title || lead.headline || '—'}</span>{lead.area && lead.area !== 'desconhecido' && <small style={{ display: 'block', color: '#94a3b8' }}>{lead.area}{seniorityLabels[lead.seniority] && seniorityLabels[lead.seniority] !== '—' ? ` · ${seniorityLabels[lead.seniority]}` : ''}</small>}</td>
                    <td>{lead.company_name || (lead.enrichment_status === 'enriched' ? 'Sem emprego atual' : '—')}</td>
                    <td>{lead.company_size ? integer.format(lead.company_size) : '—'}</td>
                    <td style={{ maxWidth: 220 }}><small style={{ color: '#475569' }} title={comment?.comment_text || ''}>{comment?.comment_text ? `“${String(comment.comment_text).slice(0, 90)}${String(comment.comment_text).length > 90 ? '…' : ''}”` : '—'}</small></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {comment?.commented_at ? (
                        <>
                          <small style={{ color: '#475569', fontWeight: 600 }}>{dataHoraCurta(comment.commented_at)}</small>
                          <small style={{ display: 'block', color: '#94a3b8', fontSize: 10.5 }}>{tempoDesde(comment.commented_at)}</small>
                        </>
                      ) : <small style={{ color: '#cbd5e1' }}>—</small>}
                    </td>
                    <td style={{ maxWidth: 180 }}><small>{postHookById[comment?.post_id || lead.first_seen_post_id] || '—'}</small></td>
                    <td style={{ maxWidth: 170 }}>
                      <PhoneCell
                        row={phonesByLead.get(lead.id)}
                        onDetail={(row) => setPhoneDetail({ lead, row })}
                        onReview={(row) => setReviewModal({ lead, row })}
                      />
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      <small style={{ color: '#64748b' }}>{lead.qualification_reason || (lead.enrichment_status === 'pending' || leadsWithPendingVerdict.has(lead.id) ? 'Aguardando análise' : '—')}</small>
                      {lead.suggested_angle && <small style={{ display: 'block', color: '#0a66c2', fontStyle: 'italic', marginTop: 3 }} title="Ângulo sugerido de abordagem">→ {lead.suggested_angle}</small>}
                      {/* De qual ICP é este veredito. Com as colunas por ICP à mostra
                          isto seria repetição — só aparece quando elas não existem. */}
                      {!colunasIcp.length && lead.qualification_icp_id && icpNameById[lead.qualification_icp_id] && (
                        <small style={{ display: 'block', color: '#94a3b8', marginTop: 3, fontWeight: 600 }} title="ICP que produziu este veredito">
                          ICP: {icpNameById[lead.qualification_icp_id]}
                        </small>
                      )}
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
      {showIcpModal && <IcpSettingsModal icps={icps} client={client} onClose={() => setShowIcpModal(false)} onNotice={onNotice} onReload={onReload} />}
      {phoneDetail && <PhoneDetailModal lead={phoneDetail.lead} row={phoneDetail.row} onClose={() => setPhoneDetail(null)} />}
      {reviewModal && (
        <ReviewMatchModal
          lead={reviewModal.lead}
          row={reviewModal.row}
          postHook={postHookById[commentByLead[reviewModal.lead.id]?.post_id || reviewModal.lead.first_seen_post_id] || ''}
          reviewer={currentProfile}
          busy={busyLead === reviewModal.lead.id}
          onDecide={(submissionId, decision) => handleReviewDecision(reviewModal.lead.id, submissionId, decision)}
          onClose={() => setReviewModal(null)}
        />
      )}
      {showMagnetsModal && (
        <LeadMagnetsModal
          client={client}
          reviewer={currentProfile}
          onClose={() => setShowMagnetsModal(false)}
          onNotice={onNotice}
        />
      )}
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
// Calcula a segunda-feira correspondente à semana ISO ('2026-W28' -> '2026-07-06')
// para fazer comparativos de datas que coincidam com o início da semana.
function weekKeyToMondayDate(weekKey) {
  const parts = String(weekKey || '').split('-W');
  if (parts.length !== 2) return '';
  const year = parseInt(parts[0], 10);
  const week = parseInt(parts[1], 10);
  const simple = new Date(Date.UTC(year, 0, 4));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple.getTime());
  monday.setUTCDate(simple.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function buildNetworkGrowthSeries(growth, period = 'daily', filters = {}, selectedPlatform = 'all') {
  const byDate = new Map();
  (growth || []).forEach((g) => {
    // 1. Filtrar por Criador (Owner)
    if (filters.owner && g.owner_name !== filters.owner) return;

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
  const activePlatforms = selectedPlatform === 'all' ? null : selectedPlatform.split(',');
  const activeLabels = activePlatforms 
    ? GOAL_PLATFORMS.filter(p => activePlatforms.includes(p.id)).map(p => p.label)
    : null;

  const toDeltas = (rows) => rows.map((row, index) => {
    const prev = rows[index - 1];
    const out = { metric_date: row.metric_date, week: row.week, label: row.label };
    networkKeys.forEach((key) => {
      if (activeLabels && !activeLabels.includes(key)) return;
      if (row[key] == null || !prev || prev[key] == null) return;
      out[key] = row[key] - prev[key];
    });
    return out;
  }).slice(1); // o primeiro ponto não tem "anterior" pra comparar

  let deltas;
  // `label` usa o mesmo formato de WeeklyCadenceChart/WeeklyEngagementChart (dd/mm
  // da segunda-feira da semana), pra alinhar com o eixo X delas via syncId.
  if (period !== 'weekly') {
    deltas = toDeltas(daily.map((row) => ({ ...row, label: shortDay(row.metric_date) })));
  } else {
    const byWeek = new Map();
    daily.forEach((row) => {
      const week = isoWeekKey(new Date(`${row.metric_date}T00:00:00Z`));
      byWeek.set(week, { ...row, week, label: weekLabel(week) }); // `daily` está em ordem crescente, então a última coleta da semana sobrescreve
    });
    deltas = toDeltas([...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)));
  }

  // Filtrar deltas pelo intervalo de datas
  return deltas.filter((row) => {
    let compareDate = row.metric_date;
    if (period === 'weekly' && row.week) {
      compareDate = weekKeyToMondayDate(row.week);
    }
    if (filters.from && compareDate < filters.from) return false;
    if (filters.to && compareDate > filters.to) return false;
    return true;
  });
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

export default function ContentMetricsWorkspace({ client, initialData, initialSection = 'overview', onSectionChange, mode = 'full', currentUser = '' }) {
  const [section, setSection] = useState(initialSection);
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState('');
  const currentDataRef = React.useRef(initialData || null);
  const [filters, setFilters] = useState(() => defaultContentFilters(initialData));
  const [youtubeFilters, setYoutubeFilters] = useState(() => defaultYoutubeFilters(initialData));
  const [instagramFilters, setInstagramFilters] = useState(() => defaultDateFilters(initialData?.instagram || []));
  const [operationMessage, setOperationMessage] = useState('');
  const [prospectOverrides, setProspectOverrides] = useState({});
  const [prospectingRunning, setProspectingRunning] = useState(() => new Set());
  // { post } enquanto o diálogo "qual ICP usar" está aberto.
  const [prospectPicker, setProspectPicker] = useState(null);
  const [showProspectIcpManager, setShowProspectIcpManager] = useState(false);

  // A coleta roda no servidor diariamente, mas esta tela pode ficar aberta por dias.
  // Recarregar somente na montagem deixava "Seguidores por rede" congelado até F5,
  // mesmo com novas linhas em account_daily_metrics. As atualizações preservam os
  // filtros do operador; eles só são inicializados no primeiro carregamento.
  const refreshData = useCallback(async ({ initializeFilters = false, force = false } = {}) => {
    const result = await loadContentMetrics({ supabase: client, mode, force });
    if (result.loadError) {
      setLoadError(result.warning || 'Não foi possível atualizar os dados.');
      setLoading(false);
      // Uma falha transitória nunca pode trocar dados válidos por listas vazias.
      // No dashboard completo ainda temos o snapshot local; nas páginas comerciais
      // mostramos o erro e aguardamos uma tentativa bem-sucedida.
      if (!currentDataRef.current && mode === 'full') {
        currentDataRef.current = result;
        setData(result);
        if (initializeFilters) {
          setFilters(defaultContentFilters(result));
          setYoutubeFilters(defaultYoutubeFilters(result));
          setInstagramFilters(defaultDateFilters(result.instagram || []));
        }
      }
      return currentDataRef.current || result;
    }
    if (initializeFilters) {
      setFilters(defaultContentFilters(result));
      setYoutubeFilters(defaultYoutubeFilters(result));
      setInstagramFilters(defaultDateFilters(result.instagram || []));
    }
    currentDataRef.current = result;
    setData(result);
    setLoadError('');
    setLoading(false);
    return result;
  }, [client, mode]);

  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    if (initialData) return;
    refreshData({ initializeFilters: true }).catch(() => {});
    return undefined;
  }, [client, initialData, refreshData]);

  useEffect(() => {
    if (initialData || !client || typeof window === 'undefined') return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refreshData().catch(() => {});
    };
    // O cache compartilhado evita downloads repetidos ao navegar. A atualização
    // periódica é espaçada porque as coletas do servidor não mudam a cada minuto.
    const interval = window.setInterval(refreshIfVisible, 5 * 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [client, initialData, refreshData]);

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
    await refreshData({ force: true });
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
      done += (res.processed || 0) + (res.prefiltered || 0) + (res.requalified || 0);
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

  // O clique no Prospectar não dispara nada: abre o diálogo dos ICPs. Quais ICPs
  // julgam os comentaristas é decisão por post (o post comercial e o do Second Brain
  // atraem público diferente), então não tem default silencioso aqui.
  const handleProspect = (post) => {
    if (!client?.functions?.invoke) { setOperationMessage('Prospecção indisponível no modo offline. Publique as Edge Functions e conecte o Supabase.'); return; }
    setProspectPicker({ post });
  };

  const runProspect = async (post, { icpIds = [], mode = 'novos' } = {}) => {
    if (!client?.functions?.invoke) { setOperationMessage('Prospecção indisponível no modo offline. Publique as Edge Functions e conecte o Supabase.'); return; }
    setProspectPicker(null);
    setProspectingRunning((prev) => new Set(prev).add(post.id));
    setOperationMessage('Iniciando raspagem dos comentários…');
    try {
      // A function ingere o dataset da Apify em fatias pra caber no limite de tempo
      // da Edge Function (~150s no plano free) e grava o offset no job — cada chamada
      // continua de onde a anterior parou, até responder done. Um post viral leva
      // várias continuações; o teto é só freio de segurança contra loop infinito.
      let res = null;
      for (let call = 0; call < 200; call += 1) {
        const { data, error } = await client.functions.invoke('prospect-post', { body: { manual: true, postId: post.id, icpIds, mode } });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Falha desconhecida na prospecção');
        res = data;
        setProspectOverrides((prev) => ({
          ...prev,
          [post.id]: {
            post_id: post.id,
            status: data.status,
            total_comments: data.totalComments,
            total_leads: data.totalLeads,
            opportunities: data.opportunities,
            new_qualified: null,
          },
        }));
        if (data.done) break;
        const total = data.datasetTotal ? ` de ${integer.format(data.datasetTotal)}` : '';
        setOperationMessage(`Raspando comentários: ${integer.format(data.totalComments || 0)}${total} processados, ${integer.format(data.opportunities || 0)} oportunidade(s) nova(s). Continuando…`);
      }
      if (!res?.done) throw new Error('A prospecção não terminou dentro do limite de continuações. Clique em Prospectar novamente para retomar de onde parou.');
      const nomes = res.icpNames || (res.icpName ? [res.icpName] : []);
      const icpLabel = nomes.length > 1
        ? ` nos ICPs ${nomes.map((nome) => `"${nome}"`).join(' e ')}`
        : (nomes.length ? ` no ICP "${nomes[0]}"` : '');
      // O post tinha uma raspagem em andamento: a function manteve os ICPs com que o
      // job começou e ignorou o que foi marcado agora. Avisar, em vez de deixar o
      // usuário achar que o ICP novo entrou na fila.
      if (res.icpOverridden) {
        setOperationMessage(`Atenção: este post já tinha uma prospecção em andamento${icpLabel}, então ela continuou com os ICPs originais. Rode de novo depois que terminar para incluir os outros.`);
      }
      if (res.nadaNovo) {
        // O caso mais barato de todos: o contador de comentários do post não mudou
        // desde a última prospecção, então nem o actor foi disparado.
        const desde = res.ultimaProspeccaoEm
          ? ` desde a última prospecção (${dataHoraCurta(res.ultimaProspeccaoEm)})`
          : ' desde a última prospecção';
        const filaExtra = res.queuedQualifications
          ? ` ${integer.format(res.queuedQualifications)} comentarista(s) entraram na fila${icpLabel}.`
          : '';
        setOperationMessage(`Nenhum comentário novo${desde}: o post continua com ${integer.format(res.comentariosNoLinkedIn || 0)} comentários. Nada foi raspado e nada foi cobrado na Apify.${filaExtra}`);
      } else if (res.requalifyOnly) {
        // Nenhum crédito de Apify gasto: os comentários já estavam no banco.
        setOperationMessage(res.queuedQualifications
          ? `Post já estava raspado: ${integer.format(res.queuedQualifications)} comentarista(s) entraram na fila${icpLabel} (sem gastar Apify). Iniciando análise automaticamente.`
          : `Post já estava raspado e todos os ${integer.format(res.leadsInPost || 0)} comentarista(s) já tinham veredito${icpLabel} — nada novo pra analisar.`);
      } else if (res.alcancouOsAntigos && !res.opportunities) {
        // Raspou, alcançou os antigos e não trouxe ninguém novo: os comentários que
        // entraram eram de gente que já estava no banco.
        setOperationMessage(`Nenhum comentarista novo neste post${icpLabel}: li ${integer.format(res.totalComments || 0)} comentário(s) até alcançar os que já estavam no banco e parei — o resto não foi cobrado.`);
      } else {
        // "Alcançou os antigos" é a boa notícia do modo incremental: a raspagem parou
        // sozinha ao chegar no que já tínhamos, em vez de pagar o post inteiro.
        const parouSozinho = res.alcancouOsAntigos
          ? ' A raspagem parou ao alcançar os comentários que já estavam no banco — o resto não foi cobrado.'
          : '';
        setOperationMessage(`Prospecção concluída${icpLabel}: ${integer.format(res.totalComments || 0)} comentários lidos, ${integer.format(res.totalLeads || 0)} leads, ${integer.format(res.opportunities || 0)} oportunidade(s) nova(s).${parouSozinho} Iniciando análise automaticamente.`);
      }
      await reloadData().catch(() => {});
      // Quantos vereditos ficaram pendentes de verdade. queuedQualifications é a
      // medida exata (pares lead × ICP que entraram na fila); os outros dois são
      // fallback para respostas antigas da function, que não mandavam esse campo.
      //
      // Ler `opportunities || totalLeads` quando queuedQualifications veio 0 era o
      // bug: num post sem nada novo, a tela disparava uma análise dos leads todos e
      // reescrevia por cima o aviso de "nenhum comentário novo".
      const pendingAfter = res.queuedQualifications != null
        ? res.queuedQualifications
        : (res.requalifyOnly ? 0 : (res.opportunities || res.totalLeads || 0));
      if (pendingAfter > 0) await runLeadAnalysisFromProspecting(pendingAfter);
    } catch (e) {
      setOperationMessage(`Falha na prospecção: ${e?.message || e}`);
    } finally {
      setProspectingRunning((prev) => { const next = new Set(prev); next.delete(post.id); return next; });
    }
  };

  const navigate = (next) => { setSection(next); onSectionChange?.(next); };
  const title = METRICS_SECTIONS.find((item) => item.id === section)?.label || 'Visão geral';

  if (loading) return <div className="cm-loading"><RefreshCw className="spin" size={20} /> Carregando…</div>;
  if (!data) return <div className="cm-loading" style={{ flexDirection: 'column', gap: 10, textAlign: 'center' }}>
    <strong>Não foi possível carregar os dados.</strong>
    <span style={{ color: '#64748b', fontSize: 12 }}>{loadError}</span>
    <button type="button" onClick={() => refreshData({ initializeFilters: true, force: true })} style={{ border: 0, borderRadius: 8, background: '#0a66c2', color: '#fff', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>Tentar novamente</button>
  </div>;

  const refreshErrorNotice = loadError ? <div className="cm-operation-message" style={{ background: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' }}>
    A atualização falhou, mas os últimos dados válidos foram preservados. {loadError}
    <button type="button" onClick={() => refreshData({ force: true })}>Tentar novamente</button>
  </div> : null;

  // Página de Prospecção (Tela 1 do escopo): a lista de posts com o botão
  // Prospectar e os números. A lista de leads fica na página própria "Leads ICP".
  if (mode === 'prospecting') {
    return <div className="content-metrics-workspace">
      <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Comercial</span><h1>Prospecção</h1><p>Rode um post para raspar quem comentou, cruzar com o banco de leads e ver as oportunidades novas. Ao prospectar, você marca quais ICPs vão julgar os comentaristas — dá para rodar os dois de uma vez, e os aprovados aparecem na página Leads ICP com uma coluna por ICP.</p></div><div className="cm-header-meta">
        <button type="button" onClick={() => setShowProspectIcpManager(true)}
          title="Criar e editar os ICPs que aparecem na hora de prospectar"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <SlidersHorizontal size={13} /> Gerenciar ICPs
        </button>
        <span>{data.linkedin.length} posts</span><Users size={16} /></div></header>
      <SourceNotice data={data} />
      {refreshErrorNotice}
      {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
      <PostsSection filtered={filtered} allPosts={data.linkedin} filters={filters} setFilters={setFilters} prospecting={prospectingByPost} runningIds={prospectingRunning} onProspect={handleProspect} onAction={() => {}} showProspecting />
      {prospectPicker && (
        <ProspectIcpModal
          post={prospectPicker.post}
          icps={data.icpProfiles || []}
          alreadyProspected={['success', 'partial'].includes(prospectingByPost[prospectPicker.post.id]?.status)}
          onConfirm={(choice) => runProspect(prospectPicker.post, choice)}
          onClose={() => setProspectPicker(null)}
          onManage={() => { setProspectPicker(null); setShowProspectIcpManager(true); }}
        />
      )}
      {showProspectIcpManager && (
        <IcpSettingsModal
          icps={data.icpProfiles || []}
          client={client}
          onClose={() => setShowProspectIcpManager(false)}
          onNotice={setOperationMessage}
          onReload={reloadData}
        />
      )}
    </div>;
  }

  // Página Metas (acesso enxuto, sem o restante do dashboard): usada tanto pelo
  // Felipe quanto pelo Victor/Fernando pra definir e acompanhar a meta do mês.
  if (mode === 'goals') {
    return <div className="content-metrics-workspace">
      <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Crescimento</span><h1>Metas</h1><p>Defina a meta do mês para cada rede e acompanhe se está no caminho certo.</p></div><div className="cm-header-meta"><Target size={16} /></div></header>
      {refreshErrorNotice}
      {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
      <MetasSection data={data} client={client} />
    </div>;
  }

  // Página Leads ICP (Tela 2 do escopo): o banco de leads qualificados, com
  // mensagem, prospectado/ignorado e os antigos pelos filtros.
  if (mode === 'leads') {
    return <div className="content-metrics-workspace">
      <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Comercial</span><h1>Leads ICP</h1><p>Quem comentou nos posts e passou (ou está esperando) o filtro de qualificação. Gere a mensagem, copie, mande no LinkedIn e marque como prospectado.</p></div><div className="cm-header-meta"><span>{(data.leads || []).length} leads no banco</span><Users size={16} /></div></header>
      {refreshErrorNotice}
      {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
      <LeadsSection data={data} client={client} currentUser={currentUser} onNotice={setOperationMessage} onReload={reloadData} />
    </div>;
  }

  return <div className="content-metrics-workspace">
    <header className="cm-header"><div><span className="cm-eyebrow">Playbook Lab · Performance publicada</span><h1>Métricas de conteúdo</h1><p>Leitura histórica e operation diária de LinkedIn, YouTube e Instagram.</p></div><div className="cm-header-meta"><span>{data.linkedin.length} posts carregados</span><SlidersHorizontal size={16} /></div></header>
    <SourceNotice data={data} />
    {refreshErrorNotice}
    {operationMessage && <div className="cm-operation-message">{operationMessage}<button type="button" onClick={() => setOperationMessage('')}>Fechar</button></div>}
    <nav className="cm-tabs" aria-label="Seções de métricas">{METRICS_SECTIONS.map((item) => { const Icon = sectionIcons[item.id]; return <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-label={item.label}><Icon size={14} />{item.label}</button>; })}</nav>
    <AnimatePresence mode="wait"><motion.div key={section} className="cm-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
      {section !== 'overview' && <div className="cm-view-title"><span className="cm-eyebrow">Content Dashboard</span><h1>{title}</h1></div>}
      {section === 'overview' && <Overview filtered={combinedOverviewData} allPosts={allPostsForOverview} data={data} filters={filters} setFilters={setFilters} />}
      {section === 'linkedin' && <LinkedinAnalysis filtered={filtered} allPosts={data.linkedin} data={data} filters={filters} setFilters={setFilters} />}
      {section === 'youtube' && <YoutubeSection data={data} videos={filteredYoutube} filters={youtubeFilters} setFilters={setYoutubeFilters} onSettings={() => navigate('settings')} />}
      {section === 'instagram' && <InstagramSection data={data} filtered={filteredInstagram} allPosts={data.instagram} filters={instagramFilters} setFilters={setInstagramFilters} onSettings={() => navigate('settings')} client={client} onReload={reloadData} />}
      {section === 'posts' && <PostsSection filtered={filtered} allPosts={data.linkedin} filters={filters} setFilters={setFilters} onAction={(action) => setOperationMessage(action === 'history' ? 'O histórico completo ficará disponível assim que os snapshots diários forem publicados no Supabase.' : 'Essa ação usa a API administrativa protegida. Publique o schema e autentique o operador antes de alterar dados.')} />}
      {section === 'videos' && <VideosSection data={data} onSettings={() => navigate('settings')} />}
      {section === 'accounts' && <AccountsSection data={data} />}
      {section === 'imports' && <ImportsSection data={data} />}
      {section === 'settings' && <SettingsSection data={data} client={client} />}
    </motion.div></AnimatePresence>
  </div>;
}

