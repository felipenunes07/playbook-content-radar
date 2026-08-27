import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  ExternalLink, Plus, BarChart3, UserRound, Check, X, Star, RotateCcw,
  Search, Download, Trash2, AlertCircle, MessageSquare, FileText,
  CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Archive,
  ThumbsUp, ThumbsDown, Lightbulb, MoreHorizontal, Calendar,
  TrendingUp, Sparkles, Zap, Eye, Award, Flame, Clock, Users, Target, ListTodo,
  KanbanSquare
} from 'lucide-react';
import './styles.css';
import { createClient } from '@supabase/supabase-js';
import victorPhoto from './assets/victor.png';
import fernandoPhoto from './assets/fernando.png';
import felipePhoto from './assets/felipe.jfif';
import juniorPhoto from './assets/junior.png';
import playbookLogo from './assets/playbook-logo.png';
import { pathToMetricsSection, sectionToMetricsPath } from './contentMetrics/routes.js';
import { filterContent } from './contentMetrics/analytics.js';
import { FERNANDO_ATIVO, CURATORS, TEAM_MEMBERS } from './teamConfig.js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ContentMetricsWorkspace = React.lazy(() => import('./contentMetrics/ContentMetricsWorkspace.jsx'));
const PipelineBoard = React.lazy(() => import('./pipeline/PipelineBoard.jsx'));
const NotionDevelopmentBoard = React.lazy(() => import('./notionDevelopment/NotionDevelopmentBoard.jsx'));
const IdeaProductionWorkspace = React.lazy(() => import('./production/IdeaProductionWorkspace.jsx'));
const CollaborativeStudioModal = React.lazy(() => import('./production/CollaborativeStudioModal.jsx'));
const TeamWorkspace = React.lazy(() => import('./teamWorkspace/TeamWorkspace.jsx'));

// Custom Linkedin logo component for brand header
const LinkedinIcon = ({ size = 24, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);

// YouTube brand icon (lucide removeu ícones de marca)
const YoutubeIcon = ({ size = 24, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

// Instagram brand icon (lucide removeu ícones de marca)
const InstagramIcon = ({ size = 24, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

// Simple Repost Icon Component
const RepostIcon = ({ size = 18, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

// Simple Send Icon Component
const SendIcon = ({ size = 18, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const STORAGE_KEY = 'playbook-content-radar-v3';
const TEAM_WORKSPACE_ROOT_ID = 'team-workspace-root';

// Avatares dos curadores agora vêm de arquivos locais (src/assets), e não mais de
// URLs assinadas do LinkedIn (media.licdn.com), que expiram a cada ~30 dias e
// passam a retornar 403 — foi isso que fez as fotos do Victor e do Fernando sumirem.
// Para trocar a foto de alguém, basta substituir o PNG correspondente em src/assets.
// Felipe: enquanto não houver src/assets/felipe.png, usamos um avatar estável com a inicial.
const USER_AVATARS = {
  Victor: victorPhoto,
  Fernando: fernandoPhoto,
  Felipe: felipePhoto,
  Junior: juniorPhoto
};

// Papéis dos perfis do app:
// - Felipe é o admin (único que cria pautas, programa publicações e exporta dados);
// - Victor é o curador editorial — a aprovação de uma pauta é decidida pelo voto
//   dele (ver calculateAutoStatus);
// - Junior é colaborador: usa Tarefas & Notas e os painéis de apoio (métricas, metas,
//   prospecção, leads, desenvolvimento, produção, calendário), mas fica fora do fluxo
//   de votação para não alterar o critério de aprovação já em uso.
//
// CURATORS e TEAM_MEMBERS agora vêm de ./teamConfig.js, controlados pela flag
// FERNANDO_ATIVO (perfil do Fernando desativado; troque a flag para restaurar).
const isAdmin = (name) => name === 'Felipe';
const isCurator = (name) => CURATORS.includes(name);
const roleLabel = (name) => isAdmin(name)
  ? 'Administrador'
  : isCurator(name)
    ? 'Curador de Conteúdo'
    : 'Colaborador';

// Safe UUID helper
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Descobre a plataforma de origem a partir da própria URL. Evita mexer no schema do
// Supabase (a tabela `ideas` guarda a URL em linkedin_url, que reaproveitamos como
// campo genérico de origem): o card e a lógica derivam a plataforma na hora.
function detectPlatform(url) {
  return /instagram\.com/i.test(String(url || '')) ? 'instagram' : 'linkedin';
}

// Share Target (PWA): quando o Felipe compartilha um post pelo celular usando
// "Enviar para -> Content Radar", o app abre com a URL nos parâmetros. LinkedIn e
// Instagram às vezes mandam o link dentro de "text" (ex.: "Veja isso https://...").
// Aqui extraímos a primeira URL de linkedin.com OU instagram.com em url/text/title.
function getSharedLinkedInUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const candidates = [params.get('url'), params.get('text'), params.get('title')].filter(Boolean);
    for (const c of candidates) {
      const match = c.match(/https?:\/\/[^\s"']*(?:linkedin\.com|instagram\.com)\/[^\s"']+/i);
      if (match) return match[0].replace(/[)\].,;\s]+$/, '');
    }
  } catch {
    /* ignora parâmetros malformados */
  }
  return null;
}

// Normaliza uma URL do LinkedIn para comparar duplicados (ignora protocolo, www,
// query string, âncora e barra final). Não é perfeito, mas cobre os casos comuns.
function normalizeLinkedInUrl(url) {
  if (!url) return '';
  try {
    let u = String(url).trim().toLowerCase();
    u = u.split('?')[0].split('#')[0];
    u = u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    return u;
  } catch {
    return String(url || '').trim().toLowerCase();
  }
}

// Número/grupo do WhatsApp dos curadores (opcional). Deixe vazio para o app abrir
// o seletor de conversa do WhatsApp. Para mandar sempre pro mesmo número, preencha
// com DDI+DDD+numero, ex.: '5531999999999'.
const CURATORS_WHATSAPP = '';

// Abre o WhatsApp com uma mensagem pronta avisando os curadores sobre nova pauta.
function openWhatsAppNotice(title) {
  const appUrl = (typeof window !== 'undefined') ? window.location.origin : '';
  const msg =
    '📣 Nova pauta no Content Radar pra vocês votarem:\n\n' +
    '"' + (title || 'Novo post do LinkedIn') + '"\n\n' +
    'É rapidinho — entra e dá seu voto 👇\n' + appUrl;
  const base = CURATORS_WHATSAPP
    ? 'https://wa.me/' + CURATORS_WHATSAPP + '?text='
    : 'https://wa.me/?text=';
  if (typeof window !== 'undefined') {
    window.open(base + encodeURIComponent(msg), '_blank');
  }
}

// Premium Vote Badge renderer with LinkedIn high-fidelity reaction style
const renderVoteBadge = (vote) => {
  const voteType = vote || 'empty';
  const label = voteType === 'like' ? 'Gostei' : voteType === 'maybe' ? 'Talvez' : voteType === 'dislike' ? 'Não gostei' : 'Pendente';

  const getIcon = () => {
    switch (voteType) {
      case 'like':
        return <ThumbsUp size={12} fill="#0a66c2" strokeWidth={1.8} style={{ display: 'inline-block', verticalAlign: 'middle' }} />;
      case 'maybe':
        return <Lightbulb size={12} fill="#b45309" strokeWidth={1.8} style={{ display: 'inline-block', verticalAlign: 'middle' }} />;
      case 'dislike':
        return <ThumbsDown size={12} fill="#d13022" strokeWidth={1.8} style={{ display: 'inline-block', verticalAlign: 'middle' }} />;
      default:
        return <Clock size={12} strokeWidth={1.8} style={{ display: 'inline-block', verticalAlign: 'middle' }} />;
    }
  };

  return (
    <div className={`table-vote-badge ${voteType}`}>
      {getIcon()}
      <span className="vote-label">{label}</span>
    </div>
  );
};

// Premium Unified Score & Decision Column Renderer (Flat Modern SaaS Style)
const renderScoreColumn = (score, decision) => {
  const scoreVal = score || 0;
  const scoreClass = scoreVal >= 1.5 ? 'high' : scoreVal > 0 ? 'medium' : 'low';

  let dotColor = '#94a3b8'; // gray
  let decisionColor = '#64748b';

  if (scoreClass === 'high') {
    dotColor = '#10b981'; // emerald green
    decisionColor = '#057642';
  } else if (scoreClass === 'medium') {
    dotColor = '#f59e0b'; // amber
    decisionColor = '#b45309';
  }

  if (decision === 'Discutir com o time' || decision === 'Descartar') {
    dotColor = '#ef4444'; // red
    decisionColor = '#b91c1c';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start', userSelect: 'none' }}>
      {/* Score Number with a simple colored dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: dotColor,
          display: 'inline-block'
        }} />
        <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0f172a' }}>{scoreVal}</span>
      </div>

      {/* Very clean borderless subtext */}
      <span style={{
        fontSize: '10px',
        fontWeight: 700,
        color: decisionColor,
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        {decision}
      </span>
    </div>
  );
};


// Premium Custom Dropdown to replace native HTML select for Manual Status (Status do Radar)
function StatusDropdown({ idea, onChange, currentUser, isSmall = false }) {
  const [isOpen, setIsOpen] = useState(false);

  if (currentUser !== 'Felipe') return null;

  const options = [
    { value: 'auto', label: 'Automático (Votos)', icon: Sparkles, color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
    { value: 'aprovado', label: 'Aprovada', icon: CheckCircle2, color: '#057642', bg: '#eaf7f0', border: '#a7f3d0' },
    { value: 'rejeitado', label: 'Rejeitada', icon: XCircle, color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
    { value: 'em_producao', label: 'Em Produção', icon: Flame, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
    { value: 'publicada', label: 'Publicada', icon: ExternalLink, color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    { value: 'arquivada', label: 'Arquivada', icon: Archive, color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' }
  ];

  const currentVal = idea.manualStatus || 'auto';
  const selectedOpt = options.find(o => o.value === currentVal) || options[0];
  const Icon = selectedOpt.icon;

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%', maxWidth: isSmall ? '150px' : '170px', zIndex: isOpen ? 50 : 2 }}>
      {/* Selector Button */}
      <button
        type="button"
        className={`status-select-btn`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          width: '100%',
          padding: isSmall ? '4px 8px' : '6px 12px',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          background: '#ffffff',
          color: '#1e293b',
          fontSize: isSmall ? '11px' : '11.5px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = '#94a3b8';
          e.currentTarget.style.background = '#f8fafc';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = '#cbd5e1';
          e.currentTarget.style.background = '#ffffff';
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Icon size={12} strokeWidth={2.5} style={{ color: selectedOpt.color }} />
          {selectedOpt.label}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
            opacity: 0.7,
            flexShrink: 0,
            color: '#64748b'
          }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Floating Dropdown Overlay Menu */}
      {isOpen && (
        <>
          {/* Backdrop to close dropdown on click outside */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'transparent'
            }}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              zIndex: 9999,
              overflow: 'hidden',
              padding: '4px',
              minWidth: '150px'
            }}
          >
            {options.map(opt => {
              const OptIcon = opt.icon;
              const isSelected = opt.value === currentVal;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className="status-dropdown-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: '6px',
                    background: isSelected ? opt.bg : 'transparent',
                    color: opt.color,
                    fontSize: '11px',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                    marginBottom: '2px'
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = opt.bg;
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <OptIcon size={12} strokeWidth={isSelected ? 2.5 : 2} style={{ color: opt.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{opt.label}</span>
                  {isSelected && (
                    <Check size={12} strokeWidth={2.5} style={{ marginLeft: 'auto', color: opt.color, flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Smart LinkedIn URL Parser & Autofill Engine
function parseLinkedInUrl(url) {
  try {
    if (!url) return null;

    // Check if it's a linkedin url
    if (!url.toLowerCase().includes('linkedin.com')) {
      return null;
    }

    // Split query parameters
    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('/posts/');

    let author = 'Conexão do LinkedIn';
    let title = 'Referência de Conteúdo';
    let category = 'LinkedIn';

    if (parts.length >= 2) {
      const slug = parts[1];
      const slugParts = slug.split('_');

      let rawAuthor = slugParts[0] || 'Autor LinkedIn';
      let rawTitle = slugParts[1] || '';

      // Capitalize author name and replace dashes/underscores with spaces
      author = rawAuthor
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Inject spaces in camelCase usernames
      author = author.replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim();

      // Format Title
      if (rawTitle) {
        let cleanTitle = rawTitle;
        // Strip everything from ugcPost/activity/share/etc. onwards
        cleanTitle = cleanTitle.split(/-(?:ugcPost|activity|share|view|update)/i)[0];
        // Strip ending hashes/numbers (like -7466926641567649792-YOqg)
        cleanTitle = cleanTitle.replace(/-\d+.*$/, '');
        cleanTitle = cleanTitle.replace(/-[a-zA-Z0-9]+$/, ''); // Strip last short hash if exists

        title = cleanTitle
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    } else {
      // URL é do tipo feed/update/urn — não temos como extrair dados da URL
      // Não inventar dados falsos, retornar vazio para o usuário preencher
      title = '';
      author = '';
    }

    // Smart Category Inference (só se tiver título real)
    if (title) {
      const lowerTitle = title.toLowerCase();
      const lowerUrl = url.toLowerCase();
      if (lowerTitle.includes('ia') || lowerTitle.includes('ai') || lowerTitle.includes('gpt') || lowerTitle.includes('chat') || lowerUrl.includes('ia') || lowerUrl.includes('ai') || lowerUrl.includes('gpt')) {
        category = 'IA';
      } else if (lowerTitle.includes('agente') || lowerTitle.includes('agent') || lowerUrl.includes('agente') || lowerUrl.includes('agent')) {
        category = 'Agentes de IA';
      } else if (lowerTitle.includes('venda') || lowerTitle.includes('sale') || lowerTitle.includes('sdr') || lowerTitle.includes('comercial') || lowerUrl.includes('venda') || lowerUrl.includes('sale')) {
        category = 'Vendas';
      } else if (lowerTitle.includes('auto') || lowerTitle.includes('make') || lowerUrl.includes('auto') || lowerUrl.includes('make')) {
        category = 'Automação';
      } else if (lowerTitle.includes('vaga') || lowerTitle.includes('oportunidade') || lowerTitle.includes('engenhe') || lowerUrl.includes('vaga') || lowerUrl.includes('oportunidade') || lowerUrl.includes('engenhe')) {
        category = 'Bastidores Playbook';
      }
    }

    return {
      author: author || '',
      title: title || '',
      category
    };
  } catch (err) {
    console.error('Error parsing LinkedIn URL', err);
    return null;
  }
}

const CATEGORIES = [
  'IA', 'Agentes de IA', 'Vendas', 'GTM', 'Automação',
  'RevOps', 'Conteúdo', 'LinkedIn', 'Produto', 'Mercado',
  'Ferramentas', 'Bastidores Playbook', 'Outro'
];

const CONTENT_TYPES = [
  'Post LinkedIn', 'Carrossel', 'Vídeo curto', 'Vídeo longo',
  'Newsletter', 'Roteiro', 'Artigo', 'Ideia para live', 'Análise técnica'
];

const QUICK_COMMENTS = [
  'Bom para post', 'Bom para vídeo', 'Muito genérico',
  'Muito técnico', 'Já falamos disso', 'Precisa de dados',
  'Bom gancho', 'Boa provocação', 'Não combina com a Playbook'
];

const seedIdeas = [
  {
    id: generateUUID(),
    createdAt: new Date().toISOString(),
    title: 'Oportunidade em Aberto – Engenheiro(a) de Dados Pleno',
    linkedinUrl: 'https://www.linkedin.com/posts/raphaelasylvestreoliveira_oportunidade-em-aberto-engenheiroa-share-7465412701272477696-Z6Ds/',
    sourceAuthor: 'Raphaela Sylvestre Oliveira',
    authorHeadline: 'Analista de recrutamento e seleção/ Tech Recruiter Pleno',
    authorAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    summary: `🚀 Oportunidade em Aberto – Engenheiro(a) de Dados Pleno

📍 Modelo de trabalho: Remoto
💼 Contrato: CLT
🏢 Irá atuar no setor: Seguros

✅ Requisitos:
✔ Experiência como Engenheiro(a) de Dados Pleno
✔ Forte conhecimento em SAS (Base, Macros, Data Step, PROC SQL)
✔ Experiência com migração ou modernização de sistemas legados
✔ Domínio de SQL avançado
✔ Experiência com Python ou Scala
✔ Conhecimento em ferramentas de dados como Spark, Airflow, Databricks ou similares
✔ Experiência com bancos de dados relacionais e/ou data lakes

✅ Requisitos Desejáveis (caso tenha):
✔ Experiência com Cloud (AWS, Azure ou GCP)
✔ Conhecimento em Data Warehousing e modelagem dimensional
✔ Experiência com Git/versionamento
✔ Vivência em ambientes ágeis (Scrum/Kanban)
✔ Perfil analítico, colaborativo e com foco em resolução de problemas

📌 Interessados, por favor, me chamem aqui ou pelo WhatsApp com as seguintes informações:
[ Engenheiro(a) de Dados Pleno] – Nome completo – E-mail (Gmail) – Pretensão salarial – Link do LinkedIn
📱 WhatsApp: +55 11 98374-0081`,
    playbookAngle: 'Foco comercial de recrutamento técnico. Excelente gancho para abordarmos em nossas redes como a escassez de engenheiros SAS qualificados no setor de Seguros pode ser amplamente sanada através da transição para pipelines modernos em nuvem orquestrados de forma automatizada (nosso core na Playbook Lab).',
    category: 'Bastidores Playbook',
    contentType: 'Post LinkedIn',
    imageUrl: '',
    initialPriority: 'Alta',
    internalNotes: 'Pedir pro Victor escrever sob a perspectiva da Playbook Lab.',
    status: 'pendente',
    manualStatus: null,
    mockLikes: 105,
    mockCommentsCount: 6,
    mockRepostsCount: 7
  },
  {
    id: generateUUID(),
    createdAt: new Date().toISOString(),
    title: 'Agentes de IA e o futuro dos times de Vendas Outbound',
    linkedinUrl: 'https://www.linkedin.com/posts/felipe-playbook_ai-agents-salesops-activity-293847192',
    sourceAuthor: 'Mateus (Sales Tech Expert)',
    authorHeadline: 'Head of Sales Ops na Playbook Lab | LinkedIn Creator',
    authorAvatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
    summary: `🤖 SDRs humanos vão acabar? Minha opinião honesta 👇

Tenho visto dezenas de fundadores dizendo que vão demitir todo o time de SDR para colocar um agente de IA rodando no ChatGPT.

Sabe o que vai acontecer? Vão queimar o domínio de e-mails da empresa em 2 semanas e poluir o CRM com dados horríveis.

IA em vendas não serve para disparar spam genérico mais rápido. Serve para:
1️⃣ Enriquecer dados comerciais com contexto real de negócio
2️⃣ Analisar relatórios financeiros de leads antes da primeira call de vendas
3️⃣ Escrever abordagens contextuais 100% focadas na dor do ICP, não no pitch egoísta da sua empresa

O SDR do futuro não faz tarefas mecânicas e repetitivas. Ele valida a estratégia e foca no relacionamento de alto valor.

Concorda ou discorda? Deixe sua visão nos comentários!`,
    playbookAngle: 'Gravar um reels/shorts demonstrando uma automação parecida de enriquecimento de leads e CRM que nós mesmos rodamos na Playbook, comprovando nossa autoridade prática de mercado como arquitetos de IA.',
    category: 'Agentes de IA',
    contentType: 'Vídeo curto',
    imageUrl: '',
    initialPriority: 'Alta',
    internalNotes: 'Gravar formato reels/shorts bem dinâmico.',
    status: 'pendente',
    manualStatus: null,
    mockLikes: 242,
    mockCommentsCount: 38,
    mockRepostsCount: 12
  },
  {
    id: generateUUID(),
    createdAt: new Date().toISOString(),
    title: 'Por que automações falham quando não têm contexto de negócio',
    linkedinUrl: 'https://www.linkedin.com/posts/felipe-playbook_automacao-processo-gtm-activity-39485719',
    sourceAuthor: 'Vanessa Rodrigues',
    authorHeadline: 'RevOps Specialist & HubSpot Certified Architect',
    authorAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    summary: `🚨 ALERTA DE REVOPS: Por que 80% das automações de vendas falham?

Vejo dezenas de empresas gastando fortunas contratando desenvolvedores para criar fluxos de automação hiper complexos no Make ou Zapier.

Em 30 dias, a automação quebra. Por quê?

❌ 1. Tentaram automatizar um processo operacional que já estava torto ou indefinido.
❌ 2. Não havia governança de dados: informações duplicadas poluindo o HubSpot.
❌ 3. O time comercial odeia a ferramenta porque ela gera cliques extras em vez de produtividade.

Automação comercial eficiente é invisível e nasce da estratégia do playbook de vendas, não da linha de código.`,
    playbookAngle: 'Gerar um carrossel educativo defendendo que a tecnologia é secundária. O principal é desenhar o "Playbook Comercial" correto antes de disparar qualquer trigger, valorizando nossa consultoria.',
    category: 'Automação',
    contentType: 'Carrossel',
    imageUrl: '',
    initialPriority: 'Média',
    internalNotes: 'Carrossel com design premium e clean.',
    status: 'pendente',
    manualStatus: null,
    mockLikes: 147,
    mockCommentsCount: 18,
    mockRepostsCount: 3
  }
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ideas: seedIdeas, votes: [] };
    const parsed = JSON.parse(raw);
    return { ideas: parsed.ideas || seedIdeas, votes: parsed.votes || [] };
  } catch {
    return { ideas: seedIdeas, votes: [] };
  }
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function voteValue(vote) {
  if (vote === 'like') return 1;
  if (vote === 'maybe') return 0.5;
  return 0;
}

function voteLabel(vote) {
  if (!vote) return '—';
  if (vote === 'like') return 'Gostei';
  if (vote === 'maybe') return 'Talvez';
  return 'Não gostei';
}

function voteClass(vote) {
  if (vote === 'like') return 'vote-like';
  if (vote === 'maybe') return 'vote-maybe';
  if (vote === 'dislike') return 'vote-dislike';
  return 'vote-empty';
}

function calculateAutoStatus(idea, votes) {
  const victor = votes.find(v => v.ideaId === idea.id && v.voterName === 'Victor')?.vote;

  // Com o Fernando desativado, a aprovação depende apenas do voto do Victor.
  if (!FERNANDO_ATIVO) {
    if (!victor) return 'pendente';
    if (victor === 'like') return 'aprovado';
    if (victor === 'maybe') return 'avaliar';
    if (victor === 'dislike') return 'rejeitado';
    return 'avaliar';
  }

  // Fluxo original com dois curadores (restaurado ao ligar FERNANDO_ATIVO).
  const fernando = votes.find(v => v.ideaId === idea.id && v.voterName === 'Fernando')?.vote;
  if (!victor && !fernando) return 'pendente';
  if (!victor || !fernando) return 'aguardando outro voto';
  if (victor === 'like' && fernando === 'like') return 'aprovado';
  if (victor === 'dislike' && fernando === 'dislike') return 'rejeitado';
  if (victor === 'like' && fernando === 'dislike') return 'divergente';
  if (victor === 'dislike' && fernando === 'like') return 'divergente';
  return 'avaliar';
}

function getScore(idea, votes) {
  return votes
    .filter(v => v.ideaId === idea.id)
    .reduce((acc, vote) => acc + voteValue(vote.vote), 0);
}

function getSuggestedDecision(status, score) {
  if (status === 'divergente') return 'Discutir com o time';
  if (status === 'pendente' || status === 'aguardando outro voto') return 'Aguardando votos';
  if (score === 2) return 'Aprofundar';
  if (score === 1.5) return 'Boa ideia, revisar';
  if (score === 1) return 'Avaliar manualmente';
  if (score === 0.5) return 'Baixa prioridade';
  return 'Descartar';
}

function App() {
  const [state, setState] = useState(loadState);
  // Se o app foi aberto via compartilhamento de um post do LinkedIn, já entramos
  // como Felipe direto na tela de "Nova ideia" com o link pronto para importar.
  const [sharedUrl, setSharedUrl] = useState(getSharedLinkedInUrl);
  const startsInMetrics = typeof window !== 'undefined' && window.location.pathname.startsWith('/content-dashboard');
  const [user, setUser] = useState(sharedUrl || startsInMetrics ? 'Felipe' : null);
  const [view, setView] = useState(sharedUrl ? 'new' : startsInMetrics ? 'metrics' : 'vote'); // vote | dashboard | metrics | new | ideas | data
  const [metricsSection, setMetricsSection] = useState(() => pathToMetricsSection(typeof window !== 'undefined' ? window.location.pathname : ''));

  React.useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname.startsWith('/content-dashboard')) {
        // Métricas agora é acessível também para curadores (Victor/Fernando);
        // só assumimos "Felipe" quando ainda não há perfil selecionado.
        setUser(current => current || 'Felipe');
        setMetricsSection(pathToMetricsSection(window.location.pathname));
        setView('metrics');
      } else {
        setView(current => current === 'metrics' ? 'dashboard' : current);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  React.useEffect(() => {
    if ((view !== 'metrics' || !user) && typeof window !== 'undefined' && window.location.pathname.startsWith('/content-dashboard')) {
      window.history.replaceState({}, '', '/');
    }
  }, [view, user]);

  function openMetrics(section = 'overview') {
    setMetricsSection(section);
    setView('metrics');
    const path = sectionToMetricsPath(section);
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState({ contentMetrics: section }, '', path);
    }
  }

  function leaveMetrics(nextView) {
    setView(nextView);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/content-dashboard')) {
      window.history.pushState({}, '', '/');
    }
  }

  // Limpa os parâmetros da URL para que um refresh não reabra o fluxo de compartilhamento.
  React.useEffect(() => {
    if (sharedUrl && typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
  const [query, setQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [curatorFilter, setCuratorFilter] = useState('todos');
  const [activeFilter, setActiveFilter] = useState('todas');
  const [isLoading, setIsLoading] = useState(false);
  const [schedulingIdea, setSchedulingIdea] = useState(null);
  const [schedulingDate, setSchedulingDate] = useState(null);
  const [studioIdea, setStudioIdea] = useState(null);

  function addToast(message, type = 'success') {
    const id = generateUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }

  // Load authoritative shared data from Supabase
  async function loadData() {
    try {
      setIsLoading(true);
      const { data: dbIdeas, error: ideasErr } = await supabase
        .from('ideas')
        .select('*')
        .order('created_at', { ascending: false });

      if (ideasErr) throw ideasErr;

      const { data: dbVotes, error: votesErr } = await supabase
        .from('votes')
        .select('*');

      if (votesErr) throw votesErr;

      // O registro abaixo sustenta a área de tarefas/notas e não é uma pauta de conteúdo.
      const visibleDbIdeas = (dbIdeas || []).filter((item) => item.id !== TEAM_WORKSPACE_ROOT_ID);

      // Seed Supabase with starter ideas if it's empty
      if (visibleDbIdeas.length === 0) {
        const formattedSeed = seedIdeas.map(idea => ({
          id: idea.id,
          title: idea.title,
          linkedin_url: idea.linkedinUrl,
          source_author: idea.sourceAuthor,
          author_headline: idea.authorHeadline,
          author_avatar: idea.authorAvatar,
          summary: idea.summary,
          playbook_angle: idea.playbookAngle,
          category: idea.category,
          content_type: idea.contentType,
          image_url: idea.imageUrl,
          initial_priority: idea.initialPriority,
          internal_notes: idea.internalNotes,
          status: idea.status,
          manual_status: idea.manualStatus,
          mock_likes: idea.mockLikes,
          mock_comments_count: idea.mockCommentsCount,
          mock_reposts_count: idea.mockRepostsCount
        }));

        const { error: seedErr } = await supabase
          .from('ideas')
          .insert(formattedSeed);

        if (seedErr) {
          console.error('Seeding error:', seedErr);
        } else {
          // Fetch freshly inserted seeds
          const { data: freshIdeas } = await supabase
            .from('ideas')
            .select('*')
            .order('created_at', { ascending: false });
          setState({ ideas: (freshIdeas || []).filter((item) => item.id !== TEAM_WORKSPACE_ROOT_ID), votes: [] });
          return;
        }
      }

      // Map postgres snake_case to camelCase variables
      const mappedIdeas = visibleDbIdeas.map(item => ({
        id: item.id,
        createdAt: item.created_at,
        title: item.title,
        linkedinUrl: item.linkedin_url,
        sourceAuthor: item.source_author,
        authorHeadline: item.author_headline,
        authorAvatar: item.author_avatar,
        summary: item.summary,
        playbookAngle: item.playbook_angle,
        category: item.category,
        contentType: item.content_type,
        imageUrl: item.image_url,
        initialPriority: item.initial_priority,
        internalNotes: item.internal_notes,
        status: item.status,
        manualStatus: item.manual_status,
        mockLikes: item.mock_likes,
        mockCommentsCount: item.mock_comments_count,
        mockRepostsCount: item.mock_reposts_count,
        scheduledAt: item.scheduled_at,
        scheduledAssignee: item.scheduled_assignee,
        finalPostText: item.final_post_text,
        finalImageUrl: item.final_post_text ? item.image_url : ''
      }));

      const mappedVotes = (dbVotes || []).map(item => ({
        id: item.id,
        createdAt: item.created_at,
        ideaId: item.idea_id,
        voterName: item.voter_name,
        vote: item.vote,
        comment: item.comment
      }));

      setState({ ideas: mappedIdeas, votes: mappedVotes });
    } catch (err) {
      console.error('Error loading Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Load authoritative data on mount
  React.useEffect(() => {
    loadData();
  }, []);

  // Background diff-based sync to Supabase
  async function syncToSupabase(prev, next) {
    try {
      // 1. Add new ideas
      const addedIdeas = next.ideas.filter(ni => !prev.ideas.some(pi => pi.id === ni.id));
      for (const idea of addedIdeas) {
        await supabase.from('ideas').insert([{
          id: idea.id,
          created_at: idea.createdAt || new Date().toISOString(),
          title: idea.title,
          linkedin_url: idea.linkedinUrl,
          source_author: idea.sourceAuthor,
          author_headline: idea.authorHeadline,
          author_avatar: idea.authorAvatar,
          summary: idea.summary,
          playbook_angle: idea.playbookAngle,
          category: idea.category,
          content_type: idea.contentType,
          image_url: idea.imageUrl,
          initial_priority: idea.initialPriority,
          internal_notes: idea.internalNotes,
          status: idea.status || 'pendente',
          manual_status: idea.manualStatus || null,
          mock_likes: idea.mockLikes || 0,
          mock_comments_count: idea.mockCommentsCount || 0,
          mock_reposts_count: idea.mockRepostsCount || 0,
          scheduled_at: idea.scheduledAt || null,
          scheduled_assignee: idea.scheduledAssignee || null,
          final_post_text: idea.finalPostText || null
        }]);
      }

      // 2. Delete ideas
      const deletedIdeas = prev.ideas.filter(pi => !next.ideas.some(ni => ni.id === pi.id));
      for (const idea of deletedIdeas) {
        await supabase.from('ideas').delete().eq('id', idea.id);
      }

      // 3. Update ideas (manual_status, scheduled_at, scheduled_assignee, playbook_angle, final_post_text, image_url)
      for (const nextIdea of next.ideas) {
        const prevIdea = prev.ideas.find(pi => pi.id === nextIdea.id);
        if (prevIdea && (
          prevIdea.manualStatus !== nextIdea.manualStatus ||
          prevIdea.scheduledAt !== nextIdea.scheduledAt ||
          prevIdea.scheduledAssignee !== nextIdea.scheduledAssignee ||
          prevIdea.playbookAngle !== nextIdea.playbookAngle ||
          prevIdea.finalPostText !== nextIdea.finalPostText ||
          prevIdea.imageUrl !== nextIdea.imageUrl
        )) {
          await supabase.from('ideas')
            .update({
              manual_status: nextIdea.manualStatus,
              scheduled_at: nextIdea.scheduledAt || null,
              scheduled_assignee: nextIdea.scheduledAssignee || null,
              playbook_angle: nextIdea.playbookAngle || null,
              final_post_text: nextIdea.finalPostText || null,
              image_url: nextIdea.imageUrl || null
            })
            .eq('id', nextIdea.id);
        }
      }

      // 4. Upsert votes
      const changedVotes = next.votes.filter(nv => {
        const prevVote = prev.votes.find(pv => pv.id === nv.id);
        return !prevVote || prevVote.vote !== nv.vote || prevVote.comment !== nv.comment;
      });
      for (const vote of changedVotes) {
        await supabase.from('votes')
          .delete()
          .eq('idea_id', vote.ideaId)
          .eq('voter_name', vote.voterName);

        await supabase.from('votes').insert([{
          id: vote.id,
          created_at: vote.createdAt || new Date().toISOString(),
          idea_id: vote.ideaId,
          voter_name: vote.voterName,
          vote: vote.vote,
          comment: vote.comment || ''
        }]);
      }

      // 5. Delete votes
      const deletedVotes = prev.votes.filter(pv => !next.votes.some(nv => nv.id === pv.id));
      for (const vote of deletedVotes) {
        await supabase.from('votes').delete().eq('id', vote.id);
      }
    } catch (err) {
      console.error('Error syncing to Supabase:', err);
    }
  }

  function updateState(updater) {
    setState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveState(next);
      syncToSupabase(prev, next);
      return next;
    });
  }

  const enrichedIdeas = useMemo(() => {
    return state.ideas.map(idea => {
      const victorVote = state.votes.find(v => v.ideaId === idea.id && v.voterName === 'Victor')?.vote;
      const fernandoVote = state.votes.find(v => v.ideaId === idea.id && v.voterName === 'Fernando')?.vote;
      const score = getScore(idea, state.votes);
      const autoStatus = calculateAutoStatus(idea, state.votes);
      const computedStatus = idea.manualStatus || autoStatus;
      const suggestedDecision = getSuggestedDecision(autoStatus, score);

      return {
        ...idea,
        victorVote,
        fernandoVote,
        score,
        autoStatus,
        computedStatus,
        suggestedDecision
      };
    });
  }, [state]);

  const userCurationStats = useMemo(() => {
    // Só curadores têm painel "Suas decisões" — Junior (colaborador) não vota.
    if (!isCurator(user)) return null;
    const userVotes = state.votes.filter(v => v.voterName === user);
    return {
      like: userVotes.filter(v => v.vote === 'like').length,
      maybe: userVotes.filter(v => v.vote === 'maybe').length,
      dislike: userVotes.filter(v => v.vote === 'dislike').length
    };
  }, [state.votes, user]);

  const selectUser = (name) => {
    setUser(name);
    setCuratorFilter('todos');
    setActiveFilter('todas');
    if (isAdmin(name)) {
      setView('dashboard');
    } else if (isCurator(name)) {
      setView('vote');
    } else {
      // Colaboradores entram direto na área compartilhada de tarefas e anotações.
      setView('team-workspace');
    }
  };

  return (
    <div className={user ? "app-shell" : "app-shell-centered"}>
      {user && (
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-logo-circle"><LinkedinIcon size={16} /></div>
            <div className="brand-text">
              <h1>Content Radar</h1>
              <p style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Playbook Lab
                <span
                  onClick={loadData}
                  className={isLoading ? "sync-dot loading" : "sync-dot synced"}
                  style={{
                    cursor: 'pointer',
                    fontSize: '11px',
                    lineHeight: 1
                  }}
                  title={isLoading ? "Sincronizando com Supabase..." : "Sincronizado com Supabase! Clique para atualizar."}
                >
                  ●
                </span>
              </p>
            </div>
          </div>

          <div className="mobile-header-profile" style={{ display: 'none' }}>
            <img src={USER_AVATARS[user]} alt={user} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(0,0,0,0.1)' }} />
          </div>

          <div className="user-panel">
            <div className="user-panel-avatar" style={{ padding: 0, overflow: 'hidden' }}>
              <img
                src={USER_AVATARS[user]}
                alt={user}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user)}&background=0a66c2&color=fff&bold=true`;
                }}
              />
            </div>
            <div className="user-panel-info">
              <strong>{user}</strong>
              <span>{roleLabel(user)}</span>
            </div>
          </div>

          <nav className="nav-group">
            {!isAdmin(user) && (
              <>
                {isCurator(user) && (
                  <>
                    <button
                      className={view === 'vote' ? 'nav-link active' : 'nav-link'}
                      onClick={() => setView('vote')}
                    >
                      <LinkedinIcon size={14} /> Votar ideias
                    </button>
                    <button
                      className={view === 'ideas' ? 'nav-link active' : 'nav-link'}
                      onClick={() => {
                        setCuratorFilter(`${user.toLowerCase()}_voted`);
                        setActiveFilter('todas');
                        setView('ideas');
                      }}
                    >
                      <FileText size={16} /> Minhas Curadorias
                    </button>
                  </>
                )}
                <button
                  className={view === 'team-workspace' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('team-workspace')}
                >
                  <ListTodo size={16} /> Tarefas & Notas
                </button>
                <button
                  className={view === 'metrics' ? 'nav-link active' : 'nav-link'}
                  onClick={() => openMetrics(metricsSection)}
                >
                  <TrendingUp size={16} /> Métricas
                </button>
                <button
                  className={view === 'goals' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('goals')}
                >
                  <Target size={16} /> Metas
                </button>
                <button
                  className={view === 'prospecting' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('prospecting')}
                >
                  <Zap size={16} /> Prospecção
                </button>
                <button
                  className={view === 'leads' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('leads')}
                >
                  <Users size={16} /> Leads ICP
                </button>
                <button
                  className={view === 'pipeline' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('pipeline')}
                >
                  <KanbanSquare size={16} /> Kanban
                </button>
                <button
                  className={view === 'development' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('development')}
                >
                  <FileText size={16} /> Desenvolvimento
                </button>
                <button
                  className={view === 'production' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('production')}
                >
                  <Sparkles size={16} /> Produção
                </button>
                <button
                  className={view === 'calendar' ? 'nav-link active' : 'nav-link'}
                  onClick={() => setView('calendar')}
                >
                  <Calendar size={16} /> Calendário Editorial
                </button>
              </>
            )}

            {isAdmin(user) && (
              <>
                <button
                  className={view === 'dashboard' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('dashboard')}
                >
                  <BarChart3 size={16} /> Dashboard
                </button>
                <button
                  className={view === 'team-workspace' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('team-workspace')}
                >
                  <ListTodo size={16} /> Tarefas & Notas
                </button>
                <button
                  className={view === 'metrics' ? 'nav-link active' : 'nav-link'}
                  onClick={() => openMetrics(metricsSection)}
                >
                  <TrendingUp size={16} /> Métricas
                </button>
                <button
                  className={view === 'goals' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('goals')}
                >
                  <Target size={16} /> Metas
                </button>
                <button
                  className={view === 'prospecting' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('prospecting')}
                >
                  <Zap size={16} /> Prospecção
                </button>
                <button
                  className={view === 'leads' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('leads')}
                >
                  <Users size={16} /> Leads ICP
                </button>
                <button
                  className={view === 'pipeline' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('pipeline')}
                >
                  <KanbanSquare size={16} /> Kanban
                </button>
                <button
                  className={view === 'development' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('development')}
                >
                  <FileText size={16} /> Desenvolvimento
                </button>
                <button
                  className={view === 'production' ? 'nav-link active' : 'nav-link'}
                  onClick={() => leaveMetrics('production')}
                >
                  <Sparkles size={16} /> Produção
                </button>
                <button
                  className={view === 'new' ? 'nav-link active' : 'nav-link'}
                  onClick={() => setView('new')}
                >
                  <Plus size={16} /> Nova ideia
                </button>
                <button
                  className={view === 'ideas' ? 'nav-link active' : 'nav-link'}
                  onClick={() => {
                    setCuratorFilter('todos');
                    setActiveFilter('todas');
                    setView('ideas');
                  }}
                >
                  <FileText size={16} /> Listagem de Ideias
                </button>
                <button
                  className={view === 'calendar' ? 'nav-link active' : 'nav-link'}
                  onClick={() => setView('calendar')}
                >
                  <Calendar size={16} /> Calendário Editorial
                </button>
                <button
                  className={view === 'data' ? 'nav-link active' : 'nav-link'}
                  onClick={() => setView('data')}
                >
                  <Download size={16} /> Dados / Exportar
                </button>
              </>
            )}
          </nav>

          {userCurationStats && (
            <div className="sidebar-votes-section">
              <h3>Suas decisões</h3>
              <div className="sidebar-vote-items">
                <button
                  type="button"
                  className="sidebar-vote-item like interactive"
                  onClick={() => {
                    setCuratorFilter(`${user.toLowerCase()}_like`);
                    setActiveFilter('todas');
                    setView('ideas');
                  }}
                  title="Ver pautas que você marcou como Gostei"
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ThumbsUp size={12} /> Gostei
                  </span>
                  <span className="count">{userCurationStats.like}</span>
                </button>
                <button
                  type="button"
                  className="sidebar-vote-item maybe interactive"
                  onClick={() => {
                    setCuratorFilter(`${user.toLowerCase()}_maybe`);
                    setActiveFilter('todas');
                    setView('ideas');
                  }}
                  title="Ver pautas que você marcou como Talvez"
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Lightbulb size={12} /> Talvez
                  </span>
                  <span className="count">{userCurationStats.maybe}</span>
                </button>
                <button
                  type="button"
                  className="sidebar-vote-item dislike interactive"
                  onClick={() => {
                    setCuratorFilter(`${user.toLowerCase()}_dislike`);
                    setActiveFilter('todas');
                    setView('ideas');
                  }}
                  title="Ver pautas que você marcou como Não gostei"
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ThumbsDown size={12} /> Não gostei
                  </span>
                  <span className="count">{userCurationStats.dislike}</span>
                </button>
              </div>
            </div>
          )}

          <div className="sidebar-footer">
            <button className="nav-link logout-btn" onClick={() => setUser(null)} style={{ gap: '8px' }}>
              <RotateCcw size={14} /> Trocar de Perfil
            </button>
          </div>
        </aside>
      )}

      {user ? (
        <main className="main-area">
          {view === 'vote' && isCurator(user) && (
            <VoteView
              user={user}
              ideas={enrichedIdeas}
              votes={state.votes}
              updateState={updateState}
              addToast={addToast}
              onBackToSelect={() => setUser(null)}
            />
          )}
          {view === 'dashboard' && isAdmin(user) && (
            <DashboardView
              ideas={enrichedIdeas}
              votes={state.votes}
              updateState={updateState}
              addToast={addToast}
              onScheduleIdea={(idea) => setSchedulingIdea(idea)}
              onNavigateToIdeas={(filter) => {
                setCuratorFilter(filter);
                setActiveFilter('todas');
                setView('ideas');
              }}
            />
          )}
          {view === 'metrics' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Carregando métricas…</div>}>
              <ContentMetricsWorkspace
                client={supabase}
                initialSection={metricsSection}
                onSectionChange={(section) => {
                  setMetricsSection(section);
                  const path = sectionToMetricsPath(section);
                  if (window.location.pathname !== path) window.history.pushState({ contentMetrics: section }, '', path);
                }}
              />
            </React.Suspense>
          )}
          {view === 'prospecting' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Carregando prospecção…</div>}>
              <ContentMetricsWorkspace client={supabase} mode="prospecting" />
            </React.Suspense>
          )}
          {view === 'leads' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Carregando leads…</div>}>
              <ContentMetricsWorkspace client={supabase} mode="leads" currentUser={user} />
            </React.Suspense>
          )}

          {view === 'pipeline' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Carregando pipeline…</div>}>
              <PipelineBoard client={supabase} currentUser={user} />
            </React.Suspense>
          )}
          {view === 'goals' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Carregando metas…</div>}>
              <ContentMetricsWorkspace client={supabase} mode="goals" />
            </React.Suspense>
          )}
          {view === 'development' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Carregando desenvolvimento...</div>}>
              <NotionDevelopmentBoard
                client={supabase}
                ideas={enrichedIdeas}
                currentUser={user}
                updateState={updateState}
                onOpenStudio={(idea) => setStudioIdea(idea)}
                onSchedule={(idea) => setSchedulingIdea(idea)}
              />
            </React.Suspense>
          )}
          {view === 'production' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Carregando produção...</div>}>
              <IdeaProductionWorkspace
                ideas={enrichedIdeas}
                currentUser={user}
                updateState={updateState}
                onOpenStudio={(idea) => setStudioIdea(idea)}
                onSchedule={(idea) => setSchedulingIdea(idea)}
              />
            </React.Suspense>
          )}
          {view === 'new' && isAdmin(user) && (
            <NewIdeaView
              updateState={updateState}
              setView={setView}
              addToast={addToast}
              existingIdeas={state.ideas}
              initialUrl={sharedUrl}
              onSharedConsumed={() => setSharedUrl(null)}
            />
          )}
          {view === 'ideas' && (
            <IdeasListView
              ideas={enrichedIdeas}
              votes={state.votes}
              updateState={updateState}
              query={query}
              setQuery={setQuery}
              addToast={addToast}
              curatorFilter={curatorFilter}
              setCuratorFilter={setCuratorFilter}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              currentUser={user}
              onScheduleIdea={(idea) => setSchedulingIdea(idea)}
              onOpenStudio={(idea) => setStudioIdea(idea)}
            />
          )}
          {view === 'calendar' && (
            <CalendarView
              ideas={enrichedIdeas}
              updateState={updateState}
              currentUser={user}
              onScheduleIdea={(idea) => setSchedulingIdea(idea)}
              onScheduleDate={(date) => setSchedulingDate(date)}
              onOpenStudio={(idea) => setStudioIdea(idea)}
              addToast={addToast}
            />
          )}
          {/* Tarefas & Notas é a área compartilhada do time: todos os perfis entram,
              com presença ao vivo e edição colaborativa (não é mais exclusiva do admin). */}
          {view === 'team-workspace' && (
            <React.Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '13px' }}>Abrindo tarefas e anotações…</div>}>
              <TeamWorkspace client={supabase} currentUser={user} avatars={USER_AVATARS} members={TEAM_MEMBERS} />
            </React.Suspense>
          )}
          {view === 'data' && isAdmin(user) && (
            <DataExportView state={state} ideas={enrichedIdeas} addToast={addToast} />
          )}
        </main>
      ) : (
        <IdentityScreen selectUser={selectUser} ideas={state.ideas} votes={state.votes} />
      )}

      {/* Mobile Bottom Tab Bar */}
      {user && (
        <div className="mobile-bottom-nav">
          {!isAdmin(user) ? (
            <>
              {isCurator(user) && (
                <>
                  <button
                    type="button"
                    className={view === 'vote' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                    onClick={() => setView('vote')}
                  >
                    <ThumbsUp size={18} />
                    <span>Votar</span>
                  </button>

                  <button
                    type="button"
                    className={view === 'ideas' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                    onClick={() => {
                      setCuratorFilter(`${user.toLowerCase()}_voted`);
                      setActiveFilter('todas');
                      setView('ideas');
                    }}
                  >
                    <FileText size={18} />
                    <span>Curadorias</span>
                  </button>
                </>
              )}

              <button
                type="button"
                className={view === 'team-workspace' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('team-workspace')}
              >
                <ListTodo size={18} />
                <span>Tarefas</span>
              </button>

              <button
                type="button"
                className={view === 'metrics' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => openMetrics(metricsSection)}
              >
                <TrendingUp size={18} />
                <span>Métricas</span>
              </button>

              <button
                type="button"
                className={view === 'goals' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('goals')}
              >
                <Target size={18} />
                <span>Metas</span>
              </button>

              <button
                type="button"
                className={view === 'prospecting' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('prospecting')}
              >
                <Zap size={18} />
                <span>Prospecção</span>
              </button>

              <button
                type="button"
                className={view === 'leads' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('leads')}
              >
                <Users size={18} />
                <span>Leads</span>
              </button>

              <button
                type="button"
                className={view === 'development' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('development')}
              >
                <FileText size={18} />
                <span>Dev</span>
              </button>
              <button
                type="button"
                className={view === 'production' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('production')}
              >
                <Sparkles size={18} />
                <span>Produção</span>
              </button>

              <button
                type="button"
                className={view === 'calendar' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => setView('calendar')}
              >
                <Calendar size={18} />
                <span>Agenda</span>
              </button>

              <button
                type="button"
                className="mobile-nav-item"
                onClick={() => setUser(null)}
              >
                <RotateCcw size={18} />
                <span>Trocar</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={view === 'dashboard' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('dashboard')}
              >
                <BarChart3 size={18} />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                className={view === 'team-workspace' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('team-workspace')}
              >
                <ListTodo size={18} />
                <span>Tarefas</span>
              </button>

              <button
                type="button"
                className={view === 'metrics' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => openMetrics(metricsSection)}
              >
                <TrendingUp size={18} />
                <span>Métricas</span>
              </button>

              <button
                type="button"
                className={view === 'goals' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('goals')}
              >
                <Target size={18} />
                <span>Metas</span>
              </button>

              <button
                type="button"
                className={view === 'prospecting' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('prospecting')}
              >
                <Zap size={18} />
                <span>Prospecção</span>
              </button>

              <button
                type="button"
                className={view === 'leads' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('leads')}
              >
                <Users size={18} />
                <span>Leads</span>
              </button>

              <button
                type="button"
                className={view === 'development' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('development')}
              >
                <FileText size={18} />
                <span>Dev</span>
              </button>
              <button
                type="button"
                className={view === 'production' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => leaveMetrics('production')}
              >
                <Sparkles size={18} />
                <span>Produção</span>
              </button>

              <button
                type="button"
                className={view === 'new' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => setView('new')}
              >
                <Plus size={18} />
                <span>Nova</span>
              </button>

              <button
                type="button"
                className={view === 'ideas' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => {
                  setCuratorFilter('todos');
                  setActiveFilter('todas');
                  setView('ideas');
                }}
              >
                <FileText size={18} />
                <span>Acervo</span>
              </button>

              <button
                type="button"
                className={view === 'calendar' ? 'mobile-nav-item active' : 'mobile-nav-item'}
                onClick={() => setView('calendar')}
              >
                <Calendar size={18} />
                <span>Agenda</span>
              </button>

              <button
                type="button"
                className="mobile-nav-item"
                onClick={() => setUser(null)}
              >
                <RotateCcw size={18} />
                <span>Trocar</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Editorial Calendar Scheduling Modal */}
      {(schedulingIdea || schedulingDate) && (
        <SchedulerModal
          idea={schedulingIdea}
          preselectedDate={schedulingDate}
          unscheduledIdeas={enrichedIdeas.filter(i => !i.scheduledAt && (i.computedStatus === 'aprovado' || i.computedStatus === 'em_producao' || i.computedStatus === 'avaliar'))}
          onClose={() => {
            setSchedulingIdea(null);
            setSchedulingDate(null);
          }}
          updateState={updateState}
          addToast={addToast}
        />
      )}

      {/* Editorial Publisher Studio Modal */}
      {studioIdea && (
        <React.Suspense fallback={<div className="pub-studio-backdrop"><div style={{ color: '#fff', fontWeight: 700 }}>Carregando estúdio...</div></div>}>
          <CollaborativeStudioModal
            idea={studioIdea}
            currentUser={user}
            client={supabase}
            onClose={() => setStudioIdea(null)}
            onSchedule={(idea) => { setStudioIdea(null); setSchedulingIdea(idea); }}
            updateState={updateState}
            addToast={addToast}
          />
        </React.Suspense>
      )}

      {/* Toast alert portal */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== IDENTITY/LOGIN SCREEN ====================
function IdentityScreen({ selectUser, ideas, votes }) {
  const pendingFor = name => {
    return ideas.filter(idea =>
      idea.manualStatus !== 'arquivada' &&
      idea.manualStatus !== 'publicada' &&
      !votes.some(v => v.ideaId === idea.id && v.voterName === name)
    ).length;
  };

  return (
    <div className="identity-screen">
      <div className="identity-card">
        <div className="brand-badge">
          <LinkedinIcon size={18} /> Playbook Lab
        </div>
        <h1>Playbook Content Radar</h1>
        <p className="subtitle">
          Portal Corporativo de Curadoria Editorial integrado ao ecossistema do LinkedIn. Avalie as pautas e referências recomendadas para o seu perfil.
        </p>
        <div className="identity-grid">
          <button onClick={() => selectUser('Victor')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                className="avatar-initial"
                src={USER_AVATARS.Victor}
                alt="Victor"
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=Victor&background=057642&color=fff&bold=true`;
                }}
              />
              Victor
            </span>
            {pendingFor('Victor') > 0 ? (
              <span className="pending-pill">{pendingFor('Victor')} pendentes</span>
            ) : (
              <span style={{ color: 'var(--vote-green)', fontSize: '12px', fontWeight: 600 }}>Tudo limpo</span>
            )}
          </button>

          {/* Perfil do Fernando desativado (ver ./teamConfig.js). Restaura ao ligar FERNANDO_ATIVO. */}
          {FERNANDO_ATIVO && (
            <button onClick={() => selectUser('Fernando')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  className="avatar-initial"
                  src={USER_AVATARS.Fernando}
                  alt="Fernando"
                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://ui-avatars.com/api/?name=Fernando&background=b26200&color=fff&bold=true`;
                  }}
                />
                Fernando
              </span>
              {pendingFor('Fernando') > 0 ? (
                <span className="pending-pill">{pendingFor('Fernando')} pendentes</span>
              ) : (
                <span style={{ color: 'var(--vote-green)', fontSize: '12px', fontWeight: 600 }}>Tudo limpo</span>
              )}
            </button>
          )}

          <button onClick={() => selectUser('Junior')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                className="avatar-initial"
                src={USER_AVATARS.Junior}
                alt="Junior"
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=Junior&background=7c3aed&color=fff&bold=true`;
                }}
              />
              Junior
            </span>
            {/* Junior não vota: entra direto em Tarefas & Notas, então não há pendências a mostrar. */}
            <span style={{ fontSize: '12px', color: 'var(--linkedin-mid-gray)', fontWeight: 600 }}>Tarefas & Notas</span>
          </button>

          <button className="admin-btn" onClick={() => selectUser('Felipe')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                className="avatar-initial"
                src={USER_AVATARS.Felipe}
                alt="Felipe"
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=Felipe&background=0a66c2&color=fff&bold=true`;
                }}
              />
              Felipe
            </span>
            <span style={{ fontSize: '12px', color: 'var(--linkedin-mid-gray)', fontWeight: 600 }}>Painel Admin</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== SWIPE & VOTE SCREEN ====================
function VoteView({ user, ideas, votes, updateState, addToast, onBackToSelect }) {
  const pending = useMemo(() => {
    return ideas.filter(idea =>
      idea.manualStatus !== 'arquivada' &&
      idea.manualStatus !== 'publicada' &&
      !votes.some(v => v.ideaId === idea.id && v.voterName === user)
    );
  }, [ideas, votes, user]);

  const [index, setIndex] = useState(0);
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [currentVote, setCurrentVote] = useState(null); // 'like' | 'maybe' | 'dislike'
  const [customComment, setCustomComment] = useState('');
  const [selectedQuickComment, setSelectedQuickComment] = useState('');

  const current = pending[index];

  // Motion values — apenas o eixo X é usado para votar (swipe horizontal).
  // O eixo vertical fica livre para a rolagem nativa da página (ler posts longos).
  const dragX = useMotionValue(0);

  const cardRotation = useTransform(dragX, [-150, 150], [-8, 8]);
  const cardScale = useTransform(dragX, [-150, 0, 150], [0.97, 1, 0.97]);

  const likeOpacity = useTransform(dragX, [0, 120], [0, 1]);
  const dislikeOpacity = useTransform(dragX, [0, -120], [0, 1]);

  // Pull existing votes/comments on the current idea
  const ideaComments = useMemo(() => {
    if (!current) return [];
    return votes.filter(v => v.ideaId === current.id && v.comment);
  }, [votes, current]);

  function handleVoteTrigger(vote) {
    setCurrentVote(vote);
    setCommentPanelOpen(true);
  }

  function handleSaveVote(withComment = true) {
    if (!current) return;

    const finalComment = withComment
      ? (selectedQuickComment ? `[${selectedQuickComment}] ${customComment}`.trim() : customComment.trim())
      : '';

    updateState(prev => ({
      ...prev,
      votes: [
        ...prev.votes,
        {
          id: generateUUID(),
          ideaId: current.id,
          voterName: user,
          vote: currentVote,
          comment: finalComment,
          createdAt: new Date().toISOString()
        }
      ]
    }));

    addToast(`Voto "${voteLabel(currentVote)}" registrado!`);

    // reset states
    setCommentPanelOpen(false);
    setCurrentVote(null);
    setCustomComment('');
    setSelectedQuickComment('');

    dragX.set(0);
  }

  // Keyboard curation listeners for desktop efficiency
  React.useEffect(() => {
    if (commentPanelOpen || !current) return;

    function handleKeyDown(e) {
      const key = e.key.toLowerCase();
      if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        handleVoteTrigger('like');
      } else if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        handleVoteTrigger('dislike');
      } else if (key === 'arrowup' || key === 'w') {
        e.preventDefault();
        handleVoteTrigger('maybe');
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setCurrentVote('maybe');
        setCommentPanelOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commentPanelOpen, current]);

  const sessionSummary = useMemo(() => {
    const userVotes = votes.filter(v => v.voterName === user);
    return {
      like: userVotes.filter(v => v.vote === 'like').length,
      maybe: userVotes.filter(v => v.vote === 'maybe').length,
      dislike: userVotes.filter(v => v.vote === 'dislike').length
    };
  }, [votes, user]);

  if (!current) {
    return (
      <div className="swipe-container">
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <CheckCircle2 size={30} />
          </div>
          <h3>Parabéns, feed atualizado!</h3>
          <p>
            Você avaliou todas as ideias de conteúdo na caixa de entrada da Playbook Lab.
          </p>

          <div className="session-summary">
            <h5>Histórico de Ações Desta Sessão</h5>
            <div className="summary-stats-row">
              <div className="summary-stat-box like">
                <strong>{sessionSummary.like}</strong>
                <span>Gostei</span>
              </div>
              <div className="summary-stat-box maybe">
                <strong>{sessionSummary.maybe}</strong>
                <span>Talvez</span>
              </div>
              <div className="summary-stat-box dislike">
                <strong>{sessionSummary.dislike}</strong>
                <span>Não gostei</span>
              </div>
            </div>
          </div>

          <button className="back-home" onClick={onBackToSelect}>
            Trocar de Usuário
          </button>
        </div>
      </div>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="top-line">
        <div>
          <p className="eyebrow">LinkedIn Content Radar</p>
          <h2>Olá {user}, você tem {pending.length} ideias no feed</h2>
        </div>
        <div className="counter-badge">
          Ideia {index + 1} de {pending.length}
        </div>
      </div>

      <div className="playbook-desktop-grid">
        <div className="playbook-feed-main">
          <div className="swipe-container">
            <div className="swipe-wrap">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  style={{ x: dragX, rotate: cardRotation, scale: cardScale }}
                  drag="x"
                  dragDirectionLock
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.4}
                  onDragEnd={(event, info) => {
                    // Só gestos horizontais votam. Movimento vertical fica livre para
                    // rolar a página e ler posts longos (touch-action: pan-y no CSS).
                    // Aceita tanto arraste longo quanto "flick" rápido (velocidade).
                    const swipedRight = info.offset.x > 120 || info.velocity.x > 600;
                    const swipedLeft = info.offset.x < -120 || info.velocity.x < -600;
                    if (swipedRight) {
                      handleVoteTrigger('like');
                    } else if (swipedLeft) {
                      handleVoteTrigger('dislike');
                    }
                  }}
                  whileDrag={{ cursor: 'grabbing' }}
                >
                  {/* Swipe Overlays */}
                  <motion.div className="swipe-overlay like" style={{ opacity: likeOpacity }}>
                    Aprovado
                  </motion.div>
                  <motion.div className="swipe-overlay dislike" style={{ opacity: dislikeOpacity }}>
                    Rejeitado
                  </motion.div>

                  <LinkedInCard
                    idea={current}
                    comments={ideaComments}
                    onVote={handleVoteTrigger}
                    onOpenComment={() => {
                      setCurrentVote('maybe');
                      setCommentPanelOpen(true);
                    }}
                    addToast={addToast}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Tinder Curation Control Dock */}
            <div className="playbook-tinder-dock">
              <button
                className="tinder-btn dislike"
                onClick={() => handleVoteTrigger('dislike')}
                title="Não Gostei (Esquerda / A)"
              >
                <X size={20} />
              </button>

              <button
                className="tinder-btn maybe"
                onClick={() => {
                  setCurrentVote('maybe');
                  setCommentPanelOpen(true);
                }}
                title="Talvez (Cima / W)"
              >
                <Lightbulb size={20} />
              </button>

              <button
                className="tinder-btn like"
                onClick={() => handleVoteTrigger('like')}
                title="Gostei (Direita / D)"
              >
                <ThumbsUp size={20} />
              </button>

              <button
                className="tinder-btn comment"
                onClick={() => {
                  setCurrentVote('maybe');
                  setCommentPanelOpen(true);
                }}
                title="Adicionar Justificativa (Espaço / Enter)"
              >
                <MessageSquare size={20} />
              </button>
            </div>

            <div className="vote-actions-container">
              <p className="swipe-hint" style={{ marginTop: '10px' }}>Arraste para a <strong>Direita</strong> (Gostei) ou <strong>Esquerda</strong> (Não Gostei). Role a tela normalmente para ler o post inteiro. Para “Talvez”, use o botão 💡.</p>
            </div>
          </div>
        </div>

        {/* Desktop Sidebar Info Widget Panel */}
        <div className="playbook-feed-sidebar">
          <div className="sidebar-widget curador-widget">
            <div className="curador-header-cover"></div>
            <div className="curador-badge-avatar" style={{ padding: 0, overflow: 'hidden' }}>
              <img
                src={USER_AVATARS[user]}
                alt={user}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user)}&background=0a66c2&color=fff&bold=true`;
                }}
              />
            </div>
            <div className="curador-badge-body">
              <h4>{user}</h4>
              <p className="curador-headline">Curador Editorial</p>
              <p className="curador-company">Playbook Lab</p>
            </div>
            <div className="curador-quick-stats">
              <div className="quick-stat-box">
                <span className="label">Votadas por você</span>
                <span className="value">{votes.filter(v => v.voterName === user).length}</span>
              </div>
              <div className="quick-stat-box border-left">
                <span className="label">Restantes no feed</span>
                <span className="value text-blue">{pending.length}</span>
              </div>
            </div>
          </div>

          <div className="sidebar-widget keybindings-widget">
            <h5>Atalhos de Teclado Operacionais</h5>
            <p className="widget-desc">Classifique as referências do feed instantaneamente no desktop:</p>
            <div className="keyboard-guides-list">
              <div className="guide-shortcut-row">
                <div className="keys-wrap"><kbd>D</kbd> ou <kbd>→</kbd></div>
                <span>Gostei</span>
              </div>
              <div className="guide-shortcut-row">
                <div className="keys-wrap"><kbd>A</kbd> ou <kbd>←</kbd></div>
                <span>Não Gostei</span>
              </div>
              <div className="guide-shortcut-row">
                <div className="keys-wrap"><kbd>W</kbd> ou <kbd>↑</kbd></div>
                <span>Talvez</span>
              </div>
              <div className="guide-shortcut-row">
                <div className="keys-wrap"><kbd>Espaço</kbd> ou <kbd>↵</kbd></div>
                <span>Justificar Voto</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Comment Dialog */}
      <AnimatePresence>
        {commentPanelOpen && (
          <div className="comment-overlay-backdrop" onClick={() => handleSaveVote(false)}>
            <div className="comment-panel" onClick={e => e.stopPropagation()}>
              <h4>
                <MessageSquare size={18} className="text-blue-primary" />
                Deseja justificar ou classificar?
              </h4>
              <p className="desc">Aperte um atalho rápido ou descreva o direcionamento para o redator.</p>

              <div className="comment-tags-grid">
                {QUICK_COMMENTS.map(tag => (
                  <button
                    key={tag}
                    className={selectedQuickComment === tag ? "comment-tag-pill active" : "comment-tag-pill"}
                    onClick={() => setSelectedQuickComment(prev => prev === tag ? '' : tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <textarea
                className="comment-textarea"
                placeholder="Ex: Ótimo tema, acho legal complementar com dados de GTM do nosso case..."
                value={customComment}
                onChange={e => setCustomComment(e.target.value)}
              />

              <div className="comment-actions">
                <button className="skip" onClick={() => handleSaveVote(false)}>
                  Apenas Votar
                </button>
                <button className="save" onClick={() => handleSaveVote(true)}>
                  Salvar Comentário
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ==================== THE LINKEDIN CARD COMPONENT (LIGHT THEME CLONE) ====================
function LinkedInCard({ idea, comments = [], onVote, onOpenComment, addToast }) {
  const [imageError, setImageError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const platform = detectPlatform(idea.linkedinUrl);
  const isInstagram = platform === 'instagram';

  React.useEffect(() => {
    setImageError(false);
    setLightboxOpen(false);
  }, [idea.id]);

  const displayDate = useMemo(() => {
    return new Date(idea.createdAt).toLocaleDateString('pt-BR');
  }, [idea.createdAt]);

  return (
    <article className="linkedin-card">
      {/* LinkedIn Post Header */}
      <div className="li-post-header">
        <div className="li-post-author-row">
          {idea.authorAvatar ? (
            <img
              className="li-post-avatar-img"
              src={idea.authorAvatar}
              alt={idea.sourceAuthor}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(idea.sourceAuthor || 'Autor')}&background=0a66c2&color=fff&bold=true`;
              }}
            />
          ) : (
            <div className="li-post-avatar-fallback">{idea.sourceAuthor ? idea.sourceAuthor.charAt(0) : 'L'}</div>
          )}
          <div className="li-post-author-meta">
            <span className="li-post-author-name">
              {idea.sourceAuthor || (isInstagram ? 'Perfil do Instagram' : 'Autor LinkedIn')}
              {isInstagram
                ? <span className="li-post-connection-degree">• Instagram</span>
                : <><span className="li-premium-badge">in</span><span className="li-post-connection-degree">• 2nd</span></>}
            </span>
            <span className="li-post-author-headline">
              {idea.authorHeadline || (isInstagram ? 'Instagram' : 'Profissional no LinkedIn')}
            </span>
            <span className="li-post-time-globe">
              3d · 🌐
            </span>
          </div>
        </div>
        <div className="li-post-header-actions">
          {idea.linkedinUrl && (
            <a
              href={idea.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="li-post-connect-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#0a66c2',
                textDecoration: 'none',
                padding: '5px 12px',
                borderRadius: '100px',
                border: '1px solid #0a66c2',
                transition: 'all 0.2s ease',
                background: 'transparent'
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(10, 102, 194, 0.08)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <ExternalLink size={11} /> Ver original ↗
            </a>
          )}
          <div className="li-post-more-btn">
            <MoreHorizontal size={16} />
          </div>
        </div>
      </div>

      {/* Post Text Body with Exact white-space: pre-wrap preservation - fully expanded by default */}
      <div className="li-post-text-body">
        {idea.summary || ''}
      </div>

      {/* Edge to Edge Image inside card */}
      {idea.imageUrl && !imageError && (
        <div className="li-post-image-wrap">
          <img
            className="li-post-image"
            src={idea.imageUrl}
            alt="Imagem de referência do LinkedIn"
            onError={() => setImageError(true)}
            onClick={() => setLightboxOpen(true)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.015)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
          />
        </div>
      )}

      {/* Immersive Glassmorphic Lightbox Modal */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            className="playbook-lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              cursor: 'zoom-out',
              padding: '24px'
            }}
          >
            {/* Close Button */}
            <button
              type="button"
              className="playbook-lightbox-close"
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                zIndex: 10000
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              <X size={20} />
            </button>

            {/* Immersive Image Frame */}
            <motion.img
              src={idea.imageUrl}
              alt="Imagem de referência ampliada"
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '95vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'default'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barra de contadores sociais — rótulos por plataforma (Instagram não tem repost) */}
      <div className="li-social-counters-row">
        <div className="li-social-reactions">
          <div className="li-social-icons-bubble">
            {isInstagram ? (
              <span className="li-reaction-icon-mock love">❤️</span>
            ) : (
              <>
                <span className="li-reaction-icon-mock like">👍</span>
                <span className="li-reaction-icon-mock celebrate">👏</span>
                <span className="li-reaction-icon-mock love">❤️</span>
              </>
            )}
          </div>
          <span>
            {isInstagram
              ? `${(idea.mockLikes || 0) + idea.score} curtidas`
              : `Flavia Sant Ana Dias e ${(idea.mockLikes || 105) + idea.score} outros`}
          </span>
        </div>
        <div>
          <span>
            {isInstagram
              ? `${(idea.mockCommentsCount || 0) + comments.length} comentários`
              : `${(idea.mockCommentsCount || 6) + comments.length} comments • ${idea.mockRepostsCount || 7} reposts`}
          </span>
        </div>
      </div>

      {/* Live Teammate Comments Section inside the LinkedIn Thread box */}
      {comments.length > 0 && (
        <div className="li-comments-area">
          {comments.map(c => (
            <div key={c.id} className="li-comment-item">
              <div className="li-comment-avatar" style={{ padding: 0, overflow: 'hidden' }}>
                <img
                  src={USER_AVATARS[c.voterName] || USER_AVATARS.Felipe}
                  alt={c.voterName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.voterName)}&background=0a66c2&color=fff&bold=true`;
                  }}
                />
              </div>
              <div className="li-comment-bubble">
                <div className="li-comment-user-name">
                  {c.voterName} <span style={{ fontWeight: 400, color: 'rgba(0, 0, 0, 0.6)', fontSize: '10px' }}>• Curador</span>
                </div>
                <div className="li-comment-user-headline">Sócio na Playbook Lab</div>
                <p className="li-comment-text">{c.comment}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Actions Footer Bar matching standard LinkedIn feed actions */}
      <div className="li-post-actions-bar">
        <button className="li-post-action-btn" onClick={(e) => { e.stopPropagation(); onVote('like'); }} title="Reagir">
          <ThumbsUp size={16} />
          <span>Reagir</span>
        </button>
        <button className="li-post-action-btn comment" onClick={(e) => { e.stopPropagation(); onOpenComment(); }} title="Comentar">
          <MessageSquare size={16} />
          <span>Comentar</span>
        </button>
        <button className="li-post-action-btn maybe" onClick={(e) => { e.stopPropagation(); onVote('maybe'); }} title="Compartilhar">
          <RepostIcon size={16} />
          <span>Compartilhar</span>
        </button>
        <button
          className="li-post-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (idea.linkedinUrl) {
              navigator.clipboard.writeText(idea.linkedinUrl);
              addToast("Link copiado para a área de transferência!", "success");
            } else {
              addToast("Link do post indisponível para cópia.", "error");
            }
          }}
          title="Copiar link do post"
        >
          <SendIcon size={16} />
          <span>Enviar</span>
        </button>
      </div>
    </article>
  );
}

// Empty-state block reutilizado nas seções do feed do dashboard. Antes cada seção
// vazia era uma caixa branca alta com uma única linha em itálico flutuando no meio,
// o que parecia erro/espaço desperdiçado. Aqui viram estados intencionais com
// ícone, título, uma linha de orientação e um CTA opcional.
function FeedEmptyState({ icon: Icon, title, hint, actionLabel, onAction, tone = 'neutral' }) {
  return (
    <div className={`li-empty-state li-empty-state--${tone}`}>
      <div className="li-empty-state-icon">{Icon && <Icon size={20} />}</div>
      <p className="li-empty-state-title">{title}</p>
      {hint && <p className="li-empty-state-hint">{hint}</p>}
      {actionLabel && onAction && (
        <button type="button" className="li-empty-state-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ==================== ADMIN: DASHBOARD VIEW ====================
function DashboardView({ ideas, votes, updateState, addToast, onScheduleIdea, onNavigateToIdeas }) {
  const [activeTab, setActiveTab] = useState('curation');

  // Basic stats
  const stats = useMemo(() => {
    const total = ideas.length;
    const aprovados = ideas.filter(i => i.computedStatus === 'aprovado').length;
    const emProducao = ideas.filter(i => i.computedStatus === 'em_producao').length;
    const publicadas = ideas.filter(i => i.computedStatus === 'publicada').length;
    const rejeitadas = ideas.filter(i => i.computedStatus === 'rejeitado').length;
    const divergentes = ideas.filter(i => i.computedStatus === 'divergente').length;
    const pendentes = ideas.filter(i => i.computedStatus === 'pendente' || i.computedStatus === 'aguardando outro voto').length;

    // Calculated KPI indices
    const totalVotos = votes.length;
    const aprovacaoRate = total > 0 ? Math.round((aprovados / total) * 100) : 0;

    // Decisions efficiency: fraction of items with a concrete non-pending status (approved, rejected, production, published)
    const comDecisao = ideas.filter(i => ['aprovado', 'rejeitado', 'em_producao', 'publicada'].includes(i.computedStatus)).length;
    const decisaoRate = total > 0 ? Math.round((comDecisao / total) * 100) : 0;

    // Pending items count across both curators
    const pendingVictorCount = ideas.filter(i => i.computedStatus !== 'arquivada' && i.computedStatus !== 'publicada' && !votes.some(v => v.ideaId === i.id && v.voterName === 'Victor')).length;
    const pendingFernandoCount = ideas.filter(i => i.computedStatus !== 'arquivada' && i.computedStatus !== 'publicada' && !votes.some(v => v.ideaId === i.id && v.voterName === 'Fernando')).length;
    const totalPendencias = pendingVictorCount + pendingFernandoCount;

    return {
      total,
      pendentes,
      aprovados,
      divergentes,
      rejeitadas,
      emProducao,
      publicadas,
      aprovacaoRate,
      decisaoRate,
      totalPendencias,
      pendingVictorCount,
      pendingFernandoCount
    };
  }, [ideas, votes]);

  const approvedBoth = useMemo(() => ideas.filter(i => i.computedStatus === 'aprovado'), [ideas]);
  const divergentIdeas = useMemo(() => ideas.filter(i => i.computedStatus === 'divergente'), [ideas]);
  const evaluatingIdeas = useMemo(() => ideas.filter(i => i.computedStatus === 'avaliar' || i.computedStatus === 'aguardando outro voto' || i.computedStatus === 'pendente'), [ideas]);

  const pendingVictor = stats.pendingVictorCount;
  const pendingFernando = stats.pendingFernandoCount;

  // Visual breakdown metrics
  const categoryRanking = useMemo(() => {
    const counts = {};
    ideas.forEach(i => {
      if (!i.category) return;
      if (i.computedStatus === 'aprovado' || i.computedStatus === 'em_producao' || i.computedStatus === 'publicada') {
        counts[i.category] = (counts[i.category] || 0) + 1.5;
      } else if (i.computedStatus !== 'rejeitado') {
        counts[i.category] = (counts[i.category] || 0) + 0.5;
      }
    });

    const sorted = Object.entries(counts)
      .map(([cat, val]) => ({ name: cat, score: val }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const maxVal = sorted.length > 0 ? sorted[0].score : 1;
    return sorted.map(item => ({
      ...item,
      percentage: Math.max(10, Math.round((item.score / maxVal) * 100))
    }));
  }, [ideas]);

  const priorityBreakdown = useMemo(() => {
    const total = ideas.length;
    if (total === 0) return { alta: 0, media: 0, baixa: 0, altaPct: 0, mediaPct: 0, baixaPct: 0 };
    const alta = ideas.filter(i => i.initialPriority === 'Alta').length;
    const media = ideas.filter(i => i.initialPriority === 'Média').length;
    const baixa = ideas.filter(i => i.initialPriority === 'Baixa').length;
    return {
      alta,
      media,
      baixa,
      altaPct: Math.round((alta / total) * 100),
      mediaPct: Math.round((media / total) * 100),
      baixaPct: Math.round((baixa / total) * 100)
    };
  }, [ideas]);

  const formatBreakdown = useMemo(() => {
    const counts = {};
    ideas.forEach(i => {
      if (!i.contentType) return;
      counts[i.contentType] = (counts[i.contentType] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([fmt, val]) => ({ label: fmt, count: val }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [ideas]);

  // Executive Actions (Conciliador & Quick Decisions)
  const handleConciliation = (ideaId, finalDecision) => {
    // Override autoStatus/divergence by forcing manualStatus in Supabase/local state
    updateState(prev => {
      const updatedIdeas = prev.ideas.map(idea => {
        if (idea.id === ideaId) {
          return {
            ...idea,
            manualStatus: finalDecision // 'aprovado' or 'rejeitado'
          };
        }
        return idea;
      });
      return {
        ...prev,
        ideas: updatedIdeas
      };
    });
    addToast(
      finalDecision === 'aprovado'
        ? "Pauta conciliada e aprovada com sucesso!"
        : "Pauta conciliada e arquivada com sucesso!",
      "success"
    );
  };

  const handleManualAction = (ideaId, actionType) => {
    updateState(prev => {
      const updated = prev.ideas.map(idea => {
        if (idea.id === ideaId) {
          return {
            ...idea,
            manualStatus: actionType // 'aprovado', 'rejeitado', 'arquivada', etc.
          };
        }
        return idea;
      });
      return { ...prev, ideas: updated };
    });
    addToast(`Pauta marcada como ${actionType === 'aprovado' ? 'aprovada' : 'arquivada'}!`, "success");
  };

  return (
    <section className="li-dashboard-container">
      {/* LinkedIn Company Admin Header Profile Card */}
      <header className="li-company-card shadow-li">
        <div className="li-company-banner" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0a66c2 100%)' }}></div>
        <div className="li-company-profile-row">
          <img
            className="li-company-avatar"
            src="/logo.png?v=2"
            alt="Playbook Lab Logo"
            style={{ borderRadius: '12px', border: '3px solid #ffffff', objectFit: 'cover', background: '#ffffff' }}
          />
          <div className="li-company-info">
            <div className="li-company-title-row">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Playbook Lab
                <span className="li-verified-badge" title="Página Corporativa Verificada" style={{ background: '#0a66c2', fontSize: '10px' }}>✓</span>
              </h2>
            </div>
            <p className="li-company-tagline">Content Radar • Hub de Inteligência Editorial</p>
            <p className="li-company-details">Serviços de consultoria empresarial • São Paulo, SP • 43 funcionários</p>
          </div>
          <div className="li-company-actions" style={{ gap: '10px' }}>
            <button
              type="button"
              className="li-btn-primary"
              onClick={() => onNavigateToIdeas && onNavigateToIdeas('todos')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '100px' }}
            >
              <FileText size={14} /> Visualizar Acervo
            </button>
          </div>
        </div>

        {/* Flat horizontal navigation tabs */}
        <div className="li-admin-tabs">
          <button
            type="button"
            className={activeTab === 'curation' ? 'li-admin-tab active' : 'li-admin-tab'}
            onClick={() => setActiveTab('curation')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Zap size={14} /> Curation Hub
          </button>
          <button
            type="button"
            className={activeTab === 'analytics' ? 'li-admin-tab active' : 'li-admin-tab'}
            onClick={() => setActiveTab('analytics')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <BarChart3 size={14} /> Métricas & Analytics
          </button>
          <button
            type="button"
            className={activeTab === 'activity' ? 'li-admin-tab active' : 'li-admin-tab'}
            onClick={() => setActiveTab('activity')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Clock size={14} /> Atividade Recente
          </button>
        </div>
      </header>

      {/* LinkedIn Integrated Corporate Page Analytics Card */}
      <div className="li-analytics-card">
        <div className="li-analytics-header">
          <h3>Métricas do Radar</h3>
          <span>Dados em tempo real nos últimos 30 dias</span>
        </div>
        <div className="li-analytics-grid">
          <div className="li-analytics-item li-analytics-divider">
            <span className="li-analytics-title">Total Mapeado</span>
            <span className="li-analytics-value">{stats.total}</span>
            <span className="li-analytics-trend gray">Referências no radar</span>
          </div>
          <div className="li-analytics-item li-analytics-divider">
            <span className="li-analytics-title">Taxa de Aprovação</span>
            <span className="li-analytics-value">{stats.aprovacaoRate}%</span>
            <span className="li-analytics-trend green">▲ {stats.aprovados} pautas</span>
          </div>
          <div className="li-analytics-item li-analytics-divider">
            <span className="li-analytics-title">Decisão Eficiente</span>
            <span className="li-analytics-value">{stats.decisaoRate}%</span>
            <span className="li-analytics-trend green">▲ {ideas.length - stats.pendentes} tratadas</span>
          </div>
          <div className="li-analytics-item">
            <span className="li-analytics-title">Ações Pendentes</span>
            <span className="li-analytics-value" style={{ color: stats.totalPendencias > 0 ? '#d13022' : 'inherit' }}>
              {stats.totalPendencias}
            </span>
            <span className={`li-analytics-trend ${stats.totalPendencias > 0 ? 'red' : 'green'}`}>
              {stats.totalPendencias > 0 ? '⚠️ Ações requeridas' : '🎉 Tudo limpo!'}
            </span>
          </div>
        </div>
      </div>

      {/* 3-Column LinkedIn Feed Style Layout */}
      <div className="li-three-columns">

        {/* Left Column: Metrics and Stats widget */}
        <aside className="li-column-left">
          <div className="li-sidebar-widget shadow-li" style={{ borderRadius: '12px' }}>
            <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>Painel do Criador</h3>
            <p className="desc" style={{ fontSize: '11px', color: '#94a3b8' }}>Desempenho editorial das referências</p>
            <hr className="divider" />

            <div className="li-metric-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={13} /> Mapeadas</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="li-metric-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Check size={13} className="text-green" /> Aprovadas</span>
              <strong className="text-green">{stats.aprovados}</strong>
            </div>
            <div className="li-metric-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={13} className="text-amber" /> Divergentes</span>
              <strong className="text-amber">{stats.divergentes}</strong>
            </div>
            <div className="li-metric-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><X size={13} className="text-red" /> Rejeitadas</span>
              <strong className="text-red">{stats.rejeitadas}</strong>
            </div>
            <div className="li-metric-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={13} /> Em Produção</span>
              <strong>{stats.emProducao}</strong>
            </div>
            <div className="li-metric-row" style={{ borderBottom: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Award size={13} className="text-green" style={{ color: '#0a66c2' }} /> Publicadas</span>
              <strong style={{ color: '#0a66c2' }}>{stats.publicadas}</strong>
            </div>
          </div>
        </aside>

        {/* Center Column: Major feed Curation elements */}
        <main className="li-column-center">
          {activeTab === 'curation' && (
            <>
              {/* Section: Aprovadas por Ambos */}
              <div style={{ marginBottom: '24px' }}>
                <div className="li-analytics-header" style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(0,0,0,0.9)' }}>Aprovadas por Ambos</h3>
                  <span className="badge-pill success">Prontas para Sheets / Agendamento</span>
                </div>
                {approvedBoth.length === 0 ? (
                  <FeedEmptyState
                    icon={CheckCircle2}
                    tone="success"
                    title={FERNANDO_ATIVO ? 'Nenhuma pauta aprovada pelos dois ainda' : 'Nenhuma pauta aprovada ainda'}
                    hint={FERNANDO_ATIVO ? 'Quando Victor e Fernando aprovarem a mesma referência, ela aparece aqui pronta para agendar.' : 'Quando o Victor aprovar uma referência, ela aparece aqui pronta para agendar.'}
                    actionLabel="Ver acervo"
                    onAction={() => onNavigateToIdeas && onNavigateToIdeas('todos')}
                  />
                ) : (
                  <div className="li-feed-list">
                    {approvedBoth.map(item => (
                      <div key={item.id} className="li-feed-post-card">
                        {/* Post Header */}
                        <div className="li-feed-post-header">
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {item.authorAvatar ? (
                              <img
                                className="li-feed-post-avatar-img"
                                src={item.authorAvatar}
                                alt={item.sourceAuthor}
                                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sourceAuthor || 'Autor')}&background=0a66c2&color=fff&bold=true`; }}
                              />
                            ) : (
                              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#0a66c2', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{item.sourceAuthor ? item.sourceAuthor.charAt(0) : 'L'}</div>
                            )}
                            <div>
                              <div className="li-feed-post-author-name">
                                {item.sourceAuthor || 'Autor LinkedIn'} <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 'normal', fontSize: '12px' }}>• 2º</span>
                              </div>
                              <div className="li-feed-post-author-headline">{item.authorHeadline || 'Líder de GTM'}</div>
                              <div className="li-feed-post-time">1d • 🌐</div>
                            </div>
                          </div>
                          {item.linkedinUrl && (
                            <a href={item.linkedinUrl} target="_blank" rel="noopener noreferrer" className="li-feed-post-connect-btn">
                              Ver original ↗
                            </a>
                          )}
                        </div>

                        {/* Post Content */}
                        <div className="li-feed-post-body" style={{ maxHeight: '160px', overflowY: 'auto', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '8px', marginBottom: '8px' }}>
                          <h4 style={{ fontWeight: 600, color: 'rgba(0,0,0,0.9)', marginBottom: '6px' }}>{item.title}</h4>
                          <p style={{ fontSize: '13px', color: 'rgba(0,0,0,0.85)' }}>{item.summary}</p>
                        </div>

                        {/* Repost Box (Playbook Angle) */}
                        {item.playbookAngle && (
                          <div className="li-feed-post-insight-box">
                            <strong>🎯 Insight de Curadoria (Ângulo Playbook)</strong>
                            <p>{item.playbookAngle}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="li-feed-actions-bar">
                          <span style={{ fontSize: '11px', color: 'rgba(0,0,0,0.6)', fontWeight: 600 }}>
                            {item.category} • {item.contentType}
                          </span>
                          <div className="li-action-btn-group">
                            <button
                              type="button"
                              className="li-feed-pill-btn primary"
                              onClick={() => onScheduleIdea && onScheduleIdea(item)}
                            >
                              <Calendar size={12} /> Agendar
                            </button>
                            <button
                              type="button"
                              className="li-feed-pill-btn secondary"
                              onClick={() => onNavigateToIdeas && onNavigateToIdeas('todos')}
                            >
                              Ver Detalhes
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Divergência de Votos */}
              <div style={{ marginBottom: '24px' }}>
                <div className="li-analytics-header" style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#991b1b' }}>Divergência de Votos</h3>
                  <span className="badge-pill warning" style={{ background: '#fee2e2', color: '#991b1b' }}>Requer Conciliação Admin</span>
                </div>
                {divergentIdeas.length === 0 ? (
                  <FeedEmptyState
                    icon={Check}
                    tone="success"
                    title="Nenhuma divergência no radar"
                    hint="Sem conflitos de voto entre os curadores. Nada precisa de conciliação agora."
                  />
                ) : (
                  <div className="li-feed-list">
                    {divergentIdeas.map(item => {
                      const victorVote = votes.find(v => v.ideaId === item.id && v.voterName === 'Victor');
                      const fernandoVote = votes.find(v => v.ideaId === item.id && v.voterName === 'Fernando');

                      return (
                        <div key={item.id} className="li-feed-post-card" style={{ border: '1px solid #fca5a5' }}>
                          {/* Post Header */}
                          <div className="li-feed-post-header">
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              {item.authorAvatar ? (
                                <img
                                  className="li-feed-post-avatar-img"
                                  src={item.authorAvatar}
                                  alt={item.sourceAuthor}
                                  onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sourceAuthor || 'Autor')}&background=0a66c2&color=fff&bold=true`; }}
                                />
                              ) : (
                                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#0a66c2', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{item.sourceAuthor ? item.sourceAuthor.charAt(0) : 'L'}</div>
                              )}
                              <div>
                                <div className="li-feed-post-author-name">
                                  {item.sourceAuthor || 'Autor LinkedIn'} <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 'normal', fontSize: '12px' }}>• 2º</span>
                                </div>
                                <div className="li-feed-post-author-headline">{item.authorHeadline || 'Líder de GTM'}</div>
                                <div className="li-feed-post-time">2d • 🌐</div>
                              </div>
                            </div>
                            {item.linkedinUrl && (
                              <a href={item.linkedinUrl} target="_blank" rel="noopener noreferrer" className="li-feed-post-connect-btn">
                                Ver original ↗
                              </a>
                            )}
                          </div>

                          {/* Post Content */}
                          <div className="li-feed-post-body" style={{ maxHeight: '160px', overflowY: 'auto', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '8px', marginBottom: '8px' }}>
                            <h4 style={{ fontWeight: 600, color: 'rgba(0,0,0,0.9)', marginBottom: '6px' }}>{item.title}</h4>
                            <p style={{ fontSize: '13px', color: 'rgba(0,0,0,0.85)' }}>{item.summary}</p>
                          </div>

                          {/* Repost Box (Playbook Angle) */}
                          {item.playbookAngle && (
                            <div className="li-feed-post-insight-box">
                              <strong>🎯 Insight de Curadoria (Ângulo Playbook)</strong>
                              <p>{item.playbookAngle}</p>
                            </div>
                          )}

                          {/* Curator Comments nested exactly like native LinkedIn Comments */}
                          <div className="li-feed-comments-section">
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Discussão da Curadoria</span>

                            {/* Victor's Comment Bubble */}
                            <div className="li-feed-comment-item">
                              <img
                                src={USER_AVATARS.Victor}
                                alt="Victor"
                                className="li-feed-comment-avatar"
                                onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=Victor&background=057642&color=fff"; }}
                              />
                              <div className="li-feed-comment-bubble">
                                <div className="li-feed-comment-user-name">Victor <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 'normal' }}>• Curador Editorial</span></div>
                                <div className="li-feed-comment-text">"{victorVote?.comment || 'Sem observações adicionais.'}"</div>
                                <div className={`li-feed-comment-voter-badge ${victorVote?.vote === 'like' ? 'liked' : 'disliked'}`}>
                                  {victorVote?.vote === 'like' ? '👍 Gostou da ideia' : '👎 Rejeitou a ideia'}
                                </div>
                              </div>
                            </div>

                            {/* Bolha de comentário do Fernando desativada (ver ./teamConfig.js). */}
                            {FERNANDO_ATIVO && (
                              <div className="li-feed-comment-item">
                                <img
                                  src={USER_AVATARS.Fernando}
                                  alt="Fernando"
                                  className="li-feed-comment-avatar"
                                  onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=Fernando&background=b26200&color=fff"; }}
                                />
                                <div className="li-feed-comment-bubble">
                                  <div className="li-feed-comment-user-name">Fernando <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 'normal' }}>• Curador Editorial</span></div>
                                  <div className="li-feed-comment-text">"{fernandoVote?.comment || 'Sem observações adicionais.'}"</div>
                                  <div className={`li-feed-comment-voter-badge ${fernandoVote?.vote === 'like' ? 'liked' : 'disliked'}`}>
                                    {fernandoVote?.vote === 'like' ? '👍 Gostou da ideia' : '👎 Rejeitou a ideia'}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Executive Conciliation Actions */}
                          <div className="li-feed-actions-bar">
                            <span style={{ fontSize: '11px', color: 'rgba(0,0,0,0.6)', fontWeight: 600 }}>
                              {item.category} • {item.contentType}
                            </span>
                            <div className="li-action-btn-group">
                              <button
                                type="button"
                                className="li-feed-pill-btn success"
                                onClick={() => handleConciliation(item.id, 'aprovado')}
                              >
                                <Check size={12} /> Aprovar Pauta
                              </button>
                              <button
                                type="button"
                                className="li-feed-pill-btn danger"
                                onClick={() => handleConciliation(item.id, 'rejeitado')}
                              >
                                <X size={12} /> Recusar Pauta
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section: Fila Geral de Avaliação */}
              <div style={{ marginBottom: '24px' }}>
                <div className="li-analytics-header" style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(0,0,0,0.9)' }}>Fila Geral de Avaliação</h3>
                  <span className="badge-pill info">Aguardando Decisões</span>
                </div>
                {evaluatingIdeas.length === 0 ? (
                  <FeedEmptyState
                    icon={Sparkles}
                    tone="neutral"
                    title="Nenhuma pauta aguardando avaliação"
                    hint="Assim que novas referências forem mapeadas, elas entram nesta fila para os curadores decidirem."
                    actionLabel="Nova ideia"
                    onAction={() => onNavigateToIdeas && onNavigateToIdeas('todos')}
                  />
                ) : (
                  <div className="li-feed-list">
                    {evaluatingIdeas.map(item => {
                      const victorVote = votes.find(v => v.ideaId === item.id && v.voterName === 'Victor');
                      const fernandoVote = votes.find(v => v.ideaId === item.id && v.voterName === 'Fernando');

                      return (
                        <div key={item.id} className="li-feed-post-card">
                          {/* Post Header */}
                          <div className="li-feed-post-header">
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              {item.authorAvatar ? (
                                <img
                                  className="li-feed-post-avatar-img"
                                  src={item.authorAvatar}
                                  alt={item.sourceAuthor}
                                  onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.sourceAuthor || 'Autor')}&background=0a66c2&color=fff&bold=true`; }}
                                />
                              ) : (
                                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#0a66c2', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{item.sourceAuthor ? item.sourceAuthor.charAt(0) : 'L'}</div>
                              )}
                              <div>
                                <div className="li-feed-post-author-name">
                                  {item.sourceAuthor || 'Autor LinkedIn'} <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 'normal', fontSize: '12px' }}>• 2º</span>
                                </div>
                                <div className="li-feed-post-author-headline">{item.authorHeadline || 'Líder de GTM'}</div>
                                <div className="li-feed-post-time">3d • 🌐</div>
                              </div>
                            </div>
                            {item.linkedinUrl && (
                              <a href={item.linkedinUrl} target="_blank" rel="noopener noreferrer" className="li-feed-post-connect-btn">
                                Ver original ↗
                              </a>
                            )}
                          </div>

                          {/* Post Content */}
                          <div className="li-feed-post-body" style={{ maxHeight: '160px', overflowY: 'auto', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '8px', marginBottom: '8px' }}>
                            <h4 style={{ fontWeight: 600, color: 'rgba(0,0,0,0.9)', marginBottom: '6px' }}>{item.title}</h4>
                            <p style={{ fontSize: '13px', color: 'rgba(0,0,0,0.85)' }}>{item.summary}</p>
                          </div>

                          {/* Repost Box (Playbook Angle) */}
                          {item.playbookAngle && (
                            <div className="li-feed-post-insight-box">
                              <strong>🎯 Insight de Curadoria (Ângulo Playbook)</strong>
                              <p>{item.playbookAngle}</p>
                            </div>
                          )}

                          {/* Curators evaluation comments section */}
                          <div className="li-feed-comments-section">
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Observações e Votos</span>

                            {/* Victor status comment */}
                            <div className="li-feed-comment-item">
                              <img
                                src={USER_AVATARS.Victor}
                                alt="Victor"
                                className="li-feed-comment-avatar"
                                onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=Victor&background=057642&color=fff"; }}
                              />
                              <div className="li-feed-comment-bubble">
                                <div className="li-feed-comment-user-name">Victor <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 'normal' }}>• Curador Editorial</span></div>
                                <div className="li-feed-comment-text">
                                  {victorVote ? `"${victorVote.comment || 'Votou sem comentários.'}"` : '⏳ Aguardando envio de voto...'}
                                </div>
                                {victorVote && (
                                  <div className={`li-feed-comment-voter-badge ${victorVote.vote === 'like' ? 'liked' : victorVote.vote === 'maybe' ? 'maybe' : 'disliked'}`}>
                                    {victorVote.vote === 'like' ? '👍 Gostou' : victorVote.vote === 'maybe' ? '💡 Talvez' : '👎 Rejeitou'}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Comentário de status do Fernando desativado (ver ./teamConfig.js). */}
                            {FERNANDO_ATIVO && (
                              <div className="li-feed-comment-item">
                                <img
                                  src={USER_AVATARS.Fernando}
                                  alt="Fernando"
                                  className="li-feed-comment-avatar"
                                  onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=Fernando&background=b26200&color=fff"; }}
                                />
                                <div className="li-feed-comment-bubble">
                                  <div className="li-feed-comment-user-name">Fernando <span style={{ color: 'rgba(0,0,0,0.6)', fontWeight: 'normal' }}>• Curador Editorial</span></div>
                                  <div className="li-feed-comment-text">
                                    {fernandoVote ? `"${fernandoVote.comment || 'Votou sem comentários.'}"` : '⏳ Aguardando envio de voto...'}
                                  </div>
                                  {fernandoVote && (
                                    <div className={`li-feed-comment-voter-badge ${fernandoVote.vote === 'like' ? 'liked' : fernandoVote.vote === 'maybe' ? 'maybe' : 'disliked'}`}>
                                      {fernandoVote.vote === 'like' ? '👍 Gostou' : fernandoVote.vote === 'maybe' ? '💡 Talvez' : '👎 Rejeitou'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Direct Admin Decisions actions bar */}
                          <div className="li-feed-actions-bar">
                            <div className="li-feed-actions-left">
                              <span style={{ fontSize: '11px', color: 'rgba(0,0,0,0.6)', fontWeight: 600, marginRight: '8px' }}>
                                {item.category} • {item.contentType}
                              </span>
                              {renderScoreColumn(getScore(item, votes), getSuggestedDecision(item.computedStatus, getScore(item, votes)))}
                            </div>
                            <div className="li-action-btn-group">
                              <button
                                type="button"
                                className="li-feed-pill-btn primary"
                                onClick={() => handleManualAction(item.id, 'aprovado')}
                              >
                                Forçar Aprovação
                              </button>
                              <button
                                type="button"
                                className="li-feed-pill-btn secondary"
                                onClick={() => handleManualAction(item.id, 'arquivada')}
                              >
                                Arquivar
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'analytics' && (
            <div className="metrics-section-grid">
              {/* Left Column: Category Ranking */}
              <div className="li-feed-card shadow-li" style={{ borderRadius: '12px' }}>
                <div className="card-header">
                  <h3 style={{ fontWeight: 700 }}>Desempenho por Categoria</h3>
                </div>
                {categoryRanking.length === 0 ? (
                  <p className="li-empty-text">Sem dados estatísticos de categorias no momento.</p>
                ) : (
                  <div className="li-charts-list" style={{ gap: '18px' }}>
                    {categoryRanking.map(item => (
                      <div key={item.name} className="li-chart-item">
                        <div className="li-chart-label" style={{ fontSize: '13px', fontWeight: 600 }}>
                          <span>{item.name}</span>
                          <strong style={{ color: '#0a66c2' }}>{item.score} pontos</strong>
                        </div>
                        <div className="li-chart-bar-outer" style={{ height: '8px', background: '#f1f5f9' }}>
                          <div
                            className="li-chart-bar-inner"
                            style={{
                              width: `${item.percentage}%`,
                              background: 'linear-gradient(to right, #0a66c2, #3b82f6)',
                              boxShadow: '0 1px 3px rgba(10, 102, 194, 0.3)'
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Breakdown metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Priority distribution */}
                <div className="metrics-secondary-card shadow-li" style={{ borderRadius: '12px' }}>
                  <h3>Distribuição de Prioridades</h3>
                  <div className="priority-distribution-list">
                    <div className="priority-dist-item">
                      <div className="priority-dist-color alta"></div>
                      <span className="priority-dist-label">Alta</span>
                      <div className="priority-dist-bar-wrap">
                        <div className="priority-dist-bar-fill" style={{ width: `${priorityBreakdown.altaPct}%`, background: 'linear-gradient(90deg, #d13022, #f87171)' }}></div>
                      </div>
                      <span className="priority-dist-count">{priorityBreakdown.alta} ({priorityBreakdown.altaPct}%)</span>
                    </div>

                    <div className="priority-dist-item">
                      <div className="priority-dist-color media"></div>
                      <span className="priority-dist-label">Média</span>
                      <div className="priority-dist-bar-wrap">
                        <div className="priority-dist-bar-fill" style={{ width: `${priorityBreakdown.mediaPct}%`, background: 'linear-gradient(90deg, #b26200, #f59e0b)' }}></div>
                      </div>
                      <span className="priority-dist-count">{priorityBreakdown.media} ({priorityBreakdown.mediaPct}%)</span>
                    </div>

                    <div className="priority-dist-item">
                      <div className="priority-dist-color baixa"></div>
                      <span className="priority-dist-label">Baixa</span>
                      <div className="priority-dist-bar-wrap">
                        <div className="priority-dist-bar-fill" style={{ width: `${priorityBreakdown.baixaPct}%`, background: 'linear-gradient(90deg, #057642, #10b981)' }}></div>
                      </div>
                      <span className="priority-dist-count">{priorityBreakdown.baixa} ({priorityBreakdown.baixaPct}%)</span>
                    </div>
                  </div>
                </div>

                {/* Formats Breakdown grid */}
                <div className="metrics-secondary-card shadow-li" style={{ borderRadius: '12px' }}>
                  <h3>Formatos Populares</h3>
                  <div className="formats-distribution-grid">
                    {formatBreakdown.length === 0 ? (
                      <p className="li-empty-text" style={{ gridColumn: 'span 2' }}>Sem dados.</p>
                    ) : (
                      formatBreakdown.map(fmt => (
                        <div key={fmt.label} className="format-stat-box">
                          <span className="format-stat-count">{fmt.count}</span>
                          <span className="format-stat-label" title={fmt.label}>{fmt.label}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="li-feed-card shadow-li" style={{ borderRadius: '12px' }}>
              <div className="card-header" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontWeight: 700 }}>Histórico Recente de Atividades</h3>
              </div>
              {votes.length === 0 ? (
                <p className="li-empty-text">Nenhuma atividade registrada.</p>
              ) : (
                <div className="li-activity-timeline">
                  {votes.slice(0, 10).map(v => {
                    const idea = ideas.find(i => i.id === v.ideaId);
                    const ideaTitle = idea?.title || 'Pauta Mapeada';

                    return (
                      <div key={v.id} className="activity-timeline-item">
                        <div className="activity-timeline-node"></div>
                        <div className="timeline-item-inner">
                          <div className="timeline-avatar-wrap">
                            <img
                              src={USER_AVATARS[v.voterName] || USER_AVATARS.Felipe}
                              alt={v.voterName}
                              className="timeline-avatar-img"
                              onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(v.voterName)}&background=0a66c2&color=fff`; }}
                            />
                          </div>

                          <div className="timeline-content-wrap">
                            <div className="timeline-content-top">
                              <span className="timeline-user-info">
                                <strong>{v.voterName}</strong> ({v.voterName === 'Felipe' ? 'Administrador' : 'Curador'})
                              </span>
                              <span className={`timeline-action-badge ${v.vote}`}>
                                {voteLabel(v.vote)}
                              </span>
                            </div>

                            <span className="timeline-time-ago">{new Date(v.createdAt).toLocaleString('pt-BR')}</span>
                            <p className="timeline-target-title">Pauta: "{ideaTitle}"</p>

                            {v.comment && (
                              <div className="timeline-comment-box">
                                "{v.comment}"
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Column: Pending voters / Curation boxes */}
        <aside className="li-column-right">
          <div className="li-sidebar-widget shadow-li" style={{ borderRadius: '12px' }}>
            <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>Pendências</h3>
            <p className="desc" style={{ fontSize: '11px', color: '#94a3b8' }}>Ações pendentes na caixa de entrada</p>
            <hr className="divider" />

            <div className="li-pending-voters-list" style={{ gap: '10px' }}>
              <button
                type="button"
                className="li-pending-voter-card victor"
                onClick={() => onNavigateToIdeas && onNavigateToIdeas('victor_pending')}
                style={{ borderRadius: '8px', borderLeft: '3px solid #057642' }}
              >
                <div className="voter-info">
                  <div className="avatar" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={USER_AVATARS.Victor}
                      alt="Victor"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                      onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=Victor&background=057642&color=fff&bold=true`; }}
                    />
                  </div>
                  <div>
                    <h4 style={{ fontWeight: 600 }}>Victor</h4>
                    <p style={{ fontSize: '10.5px' }}>Curador Editorial</p>
                  </div>
                </div>
                <strong className="badge" style={{ background: pendingVictor > 0 ? '#ef4444' : '#e6f4ea', color: pendingVictor > 0 ? '#ffffff' : '#137333' }}>
                  {pendingVictor}
                </strong>
              </button>

              {/* Card de pendências do Fernando desativado (ver ./teamConfig.js). */}
              {FERNANDO_ATIVO && (
                <button
                  type="button"
                  className="li-pending-voter-card fernando"
                  onClick={() => onNavigateToIdeas && onNavigateToIdeas('fernando_pending')}
                  style={{ borderRadius: '8px', borderLeft: '3px solid #b26200' }}
                >
                  <div className="voter-info">
                    <div className="avatar" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={USER_AVATARS.Fernando}
                        alt="Fernando"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                        onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=Fernando&background=b26200&color=fff&bold=true`; }}
                      />
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 600 }}>Fernando</h4>
                      <p style={{ fontSize: '10.5px' }}>Curador Editorial</p>
                    </div>
                  </div>
                  <strong className="badge" style={{ background: pendingFernando > 0 ? '#ef4444' : '#e6f4ea', color: pendingFernando > 0 ? '#ffffff' : '#137333' }}>
                    {pendingFernando}
                  </strong>
                </button>
              )}
            </div>
          </div>
        </aside>

      </div>
    </section>
  );
}

// ==================== ADMIN: NEW IDEA FORM ====================
function NewIdeaView({ updateState, setView, addToast, existingIdeas = [], initialUrl, onSharedConsumed }) {
  const [justSaved, setJustSaved] = useState(null);
  const [form, setForm] = useState({
    title: '',
    linkedinUrl: '',
    sourceAuthor: '',
    authorHeadline: '',
    authorAvatar: '',
    summary: '',
    playbookAngle: '',
    category: 'IA',
    contentType: 'Post LinkedIn',
    imageUrl: '',
    initialPriority: 'Média',
    internalNotes: '',
    mockLikes: 0,
    mockCommentsCount: 0,
    mockRepostsCount: 0
  });

  const [isImporting, setIsImporting] = useState(false);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Importação automática quando o post chega via compartilhamento (Share Target).
  const sharedConsumedRef = React.useRef(false);
  React.useEffect(() => {
    if (initialUrl && !sharedConsumedRef.current) {
      sharedConsumedRef.current = true;
      setForm(prev => ({ ...prev, linkedinUrl: initialUrl }));
      handleAutofill(initialUrl);
      if (onSharedConsumed) onSharedConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  // Bookmarklet "Salvar do PC": botão arrastável para a barra de favoritos do navegador,
  // já com o endereço atual do app (window.location.origin). Ao clicar nele dentro de
  // qualquer post do LinkedIn, abre o Radar com a URL pronta para importar.
  // O href é setado via ref porque o React bloqueia hrefs começando com "javascript:".
  const bookmarkletRef = React.useRef(null);
  React.useEffect(() => {
    if (!bookmarkletRef.current) return;
    const origin = window.location.origin;
    const code =
      "javascript:(function(){var h=location.href;" +
      "if(h.indexOf('linkedin.com')===-1&&h.indexOf('instagram.com')===-1){alert('Abra um post do LinkedIn ou do Instagram antes de clicar aqui.');return;}" +
      "window.open('" + origin + "/?url='+encodeURIComponent(h),'_blank');})();";
    bookmarkletRef.current.setAttribute('href', code);
  }, []);

  // Aceita uma URL explícita (vinda do compartilhamento) ou usa a do formulário
  // (clique no botão "Importar", que passa um evento — por isso o typeof string).
  async function handleAutofill(urlArg) {
    const targetUrl = (typeof urlArg === 'string' && urlArg) ? urlArg : form.linkedinUrl;

    if (!targetUrl) {
      addToast('Insira uma URL válida primeiro!', 'error');
      return;
    }

    const lowerUrl = targetUrl.toLowerCase();
    const isInstagram = lowerUrl.includes('instagram.com');
    if (!lowerUrl.includes('linkedin.com') && !isInstagram) {
      addToast('A URL precisa ser do LinkedIn ou do Instagram.', 'error');
      return;
    }

    // ─── Instagram: raspa via Edge Function scrape-instagram (Apify) ───
    if (isInstagram) {
      setIsImporting(true);
      addToast('Buscando dados reais do post no Instagram...', 'success');
      try {
        const response = await fetch('https://xcihctupmfawtawbzwvm.supabase.co/functions/v1/scrape-instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl })
        });
        const data = response.ok ? await response.json() : null;
        if (!data || !data.success || (!data.description && !data.author)) {
          throw new Error(data?.error || 'Nenhum dado extraído do Instagram.');
        }
        setForm(prev => ({
          ...prev,
          title: data.title || prev.title,
          sourceAuthor: data.author || prev.sourceAuthor,
          authorHeadline: data.authorHeadline || prev.authorHeadline,
          authorAvatar: data.authorAvatar || prev.authorAvatar,
          summary: data.description || prev.summary,
          imageUrl: data.image || prev.imageUrl,
          category: prev.category,
          contentType: 'Carrossel',
          mockLikes: data.mockLikes || prev.mockLikes,
          mockCommentsCount: data.mockCommentsCount || prev.mockCommentsCount,
          mockRepostsCount: 0
        }));
        addToast(data.description ? '✅ Post importado do Instagram com sucesso!' : '⚠️ Dados básicos importados. Complete o texto manualmente.', data.description ? 'success' : 'error');
      } catch (err) {
        console.error('Instagram scrape failed:', err);
        addToast('❌ Não foi possível importar o post do Instagram. Preencha os dados manualmente.', 'error');
      } finally {
        setIsImporting(false);
      }
      return;
    }

    setIsImporting(true);
    addToast('Buscando dados reais do post no LinkedIn...', 'success');

    try {
      // ─── Tentar Supabase Edge Function (via principal) ───
      let data = null;
      let usedSupabase = false;

      try {
        const response = await fetch('https://xcihctupmfawtawbzwvm.supabase.co/functions/v1/scrape-linkedin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl })
        });
        if (response.ok) {
          data = await response.json();
          usedSupabase = true;
        }
      } catch { /* Supabase indisponível, usar fallback */ }

      // ─── Fallback: proxy CORS + parsing client-side ───
      if (!data || (!data.description && !data.author && !data.title)) {
        try {
          const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl);
          const proxyResp = await fetch(proxyUrl);
          if (proxyResp.ok) {
            const html = await proxyResp.text();

            const getMetaContent = (property) => {
              const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const r1 = new RegExp('property="' + escaped + '"\\s+content="([^"]*)"', 'i');
              const m1 = html.match(r1);
              if (m1) return m1[1];
              const r2 = new RegExp('content="([^"]*)"\\s+property="' + escaped + '"', 'i');
              const m2 = html.match(r2);
              if (m2) return m2[1];
              return '';
            };

            const decodeEntities = (str) => {
              if (!str) return '';
              return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
                .replace(/&#x2F;/g, '/').replace(/&nbsp;/g, ' ');
            };

            const ogTitle = getMetaContent('og:title');
            const ogDesc = getMetaContent('og:description');
            const ogImage = getMetaContent('og:image');
            const titleMatch = html.match(/<title>([^<]*)<\/title>/i);

            let authorName = '', authorHeadline = '', authorAvatar = '', articleBody = '';
            let parsedLikes = 0, parsedComments = 0;

            const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
            let jsonLdMatch;
            while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
              try {
                const jd = JSON.parse(jsonLdMatch[1]);
                if (jd.author?.name) authorName = jd.author.name;
                if (jd.author?.description) authorHeadline = jd.author.description;
                if (jd.articleBody) articleBody = jd.articleBody;
                if (jd.author?.image?.url) authorAvatar = jd.author.image.url;
                else if (typeof jd.author?.image === 'string') authorAvatar = jd.author.image;
                if (typeof jd.commentCount === 'number') parsedComments = jd.commentCount;
                if (Array.isArray(jd.interactionStatistic)) {
                  for (const s of jd.interactionStatistic) {
                    if (s.interactionType?.includes('LikeAction') && typeof s.userInteractionCount === 'number') parsedLikes = s.userInteractionCount;
                    if (s.interactionType?.includes('CommentAction') && typeof s.userInteractionCount === 'number' && !parsedComments) parsedComments = s.userInteractionCount;
                  }
                }
              } catch { /* ignore */ }
            }

            const bestTitle = ogTitle || (titleMatch ? titleMatch[1] : '');
            if (!authorName && bestTitle) {
              const am = bestTitle.match(/^(.+?)(?:\s+on\s+LinkedIn|\s+no\s+LinkedIn|\s+\|\s+LinkedIn)/i);
              if (am) authorName = am[1].trim();
            }

            // Filtrar imagens genéricas
            let postImage = ogImage;
            if (ogImage && (ogImage.includes('static.licdn.com') || ogImage.includes('favicon'))) postImage = '';
            if (authorAvatar && (authorAvatar.includes('static.licdn.com') || authorAvatar.includes('ghost'))) authorAvatar = '';

            data = {
              author: decodeEntities(authorName),
              authorHeadline: decodeEntities(authorHeadline),
              authorAvatar: decodeEntities(authorAvatar),
              title: decodeEntities(bestTitle),
              description: decodeEntities(articleBody || ogDesc),
              image: decodeEntities(postImage),
              mockLikes: parsedLikes,
              mockCommentsCount: parsedComments,
              isAuthwall: html.includes('authwall') || html.includes('auth_wall')
            };
          }
        } catch { /* proxy também falhou */ }
      }

      // ─── Se nenhuma via funcionou, throw ───
      if (!data || (!data.description && !data.author && !data.title)) {
        throw new Error('Nenhum dado extraído do LinkedIn.');
      }

      // ─── Processar dados (independente da fonte) ───
      let cleanTitle = '';
      if (data.description) {
        const firstLine = data.description.split('\n').find(l => l.trim().length > 5) || '';
        cleanTitle = firstLine.slice(0, 80).trim();
        if (firstLine.length > 80) cleanTitle += '...';
      }
      if (!cleanTitle && data.title) {
        cleanTitle = data.title.split('|')[0].trim().slice(0, 80);
      }

      // Inferência de categoria
      const lowerContent = ((data.description || '') + ' ' + (cleanTitle || '')).toLowerCase();
      let category = 'LinkedIn';
      if (lowerContent.includes('vaga') || lowerContent.includes('hiring') || lowerContent.includes('recrutamento') || lowerContent.includes('oportunidade')) {
        category = 'Bastidores Playbook';
      } else if (lowerContent.includes('ia ') || lowerContent.includes('ai ') || lowerContent.includes('gpt') || lowerContent.includes('inteligência artificial')) {
        category = 'IA';
      } else if (lowerContent.includes('agente') || lowerContent.includes('agent')) {
        category = 'Agentes de IA';
      } else if (lowerContent.includes('venda') || lowerContent.includes('sales') || lowerContent.includes('sdr')) {
        category = 'Vendas';
      } else if (lowerContent.includes('automação') || lowerContent.includes('automation') || lowerContent.includes('zapier') || lowerContent.includes('make')) {
        category = 'Automação';
      } else if (lowerContent.includes('revops') || lowerContent.includes('hubspot') || lowerContent.includes('crm')) {
        category = 'RevOps';
      } else if (lowerContent.includes('gtm') || lowerContent.includes('go-to-market')) {
        category = 'GTM';
      } else if (lowerContent.includes('conteúdo') || lowerContent.includes('content') || lowerContent.includes('marketing')) {
        category = 'Conteúdo';
      }

      const importedText = data.description || '';
      const isTextTruncated = importedText.length > 0 && importedText.length < 280;

      // Ignorar headline fabricado pelo backend (contém keywords genéricas)
      const fabricatedHeadlines = ['Profissional de Tecnologia', 'Líder de Talent', 'Especialista em Inteligência', 'Arquiteto de Agentes', 'Head de GTM', 'Engenheiro de Integrações'];
      let realHeadline = data.authorHeadline || '';
      if (fabricatedHeadlines.some(fh => realHeadline.includes(fh))) {
        realHeadline = ''; // Era fabricado, descartar
      }

      setForm(prev => ({
        ...prev,
        title: cleanTitle || prev.title,
        sourceAuthor: data.author || prev.sourceAuthor,
        authorHeadline: realHeadline || prev.authorHeadline,
        authorAvatar: data.authorAvatar || prev.authorAvatar,
        summary: importedText || prev.summary,
        imageUrl: data.image || prev.imageUrl,
        category: category,
        mockLikes: data.mockLikes || prev.mockLikes,
        mockCommentsCount: data.mockCommentsCount || prev.mockCommentsCount,
        mockRepostsCount: data.mockRepostsCount || prev.mockRepostsCount
      }));

      if (!importedText) {
        addToast('⚠️ Dados básicos importados, mas o texto do post não pôde ser extraído' + (data.isAuthwall ? ' (LinkedIn exigiu login)' : '') + '. Cole o texto manualmente.', 'error');
      } else if (isTextTruncated) {
        addToast('⚠️ Post importado, mas o texto pode estar truncado (' + importedText.length + ' chars). Confira e complete se necessário.', 'error');
      } else {
        addToast('✅ Post importado do LinkedIn com sucesso!', 'success');
      }

    } catch (err) {
      console.error('LinkedIn scrape failed:', err);

      // Fallback final: extrair dados básicos da URL
      const parsed = parseLinkedInUrl(targetUrl);
      if (parsed && (parsed.title || parsed.author)) {
        setForm(prev => ({
          ...prev,
          title: prev.title || parsed.title,
          sourceAuthor: prev.sourceAuthor || parsed.author,
          category: parsed.category || prev.category
        }));
        addToast('⚠️ Não foi possível acessar o post. Dados básicos da URL foram extraídos. Preencha o resto manualmente.', 'error');
      } else {
        addToast('❌ Não foi possível importar o post. Preencha os dados manualmente.', 'error');
      }
    } finally {
      setIsImporting(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;

    // Bloqueia cadastrar o mesmo post duas vezes (compara a URL normalizada).
    if (form.linkedinUrl) {
      const dupe = (existingIdeas || []).find(i =>
        i.linkedinUrl && normalizeLinkedInUrl(i.linkedinUrl) === normalizeLinkedInUrl(form.linkedinUrl)
      );
      if (dupe) {
        addToast('⚠️ Esse post já está no radar (como "' + (dupe.title || 'sem título') + '"). Não foi duplicado.', 'error');
        return;
      }
    }

    const savedTitle = form.title.trim();

    const finalLikes = form.mockLikes || Math.floor(Math.random() * 200) + 50;
    const finalComments = form.mockCommentsCount || Math.floor(finalLikes * 0.08) + 2;
    const finalReposts = form.mockRepostsCount || Math.floor(finalLikes * 0.04) + 1;

    updateState(prev => ({
      ...prev,
      ideas: [
        {
          id: generateUUID(),
          createdAt: new Date().toISOString(),
          status: 'pendente',
          manualStatus: null,
          scheduledAt: null,
          scheduledAssignee: null,
          finalPostText: null,
          ...form,
          mockLikes: finalLikes,
          mockCommentsCount: finalComments,
          mockRepostsCount: finalReposts
        },
        ...prev.ideas
      ]
    }));

    addToast('Nova ideia de LinkedIn inserida no radar!');

    // Clear and reset form state to prevent duplicate/cached inputs on next view
    setForm({
      title: '',
      linkedinUrl: '',
      sourceAuthor: '',
      authorHeadline: '',
      authorAvatar: '',
      summary: '',
      playbookAngle: '',
      category: 'IA',
      contentType: 'Post LinkedIn',
      imageUrl: '',
      initialPriority: 'Média',
      internalNotes: '',
      mockLikes: 0,
      mockCommentsCount: 0,
      mockRepostsCount: 0
    });

    // Em vez de sair direto, mostra um painel de sucesso com o botão de avisar no
    // WhatsApp (precisa do clique do usuário para o navegador permitir abrir a aba).
    setJustSaved(savedTitle);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <section>
      <div className="admin-view-header">
        <p className="eyebrow">Radar Editor</p>
        <h2>Cadastrar Referência</h2>
        <p>Cole o link do LinkedIn e importe automaticamente o autor, texto e imagem do post real.</p>
      </div>

      {/* Painel de sucesso após salvar: botão para avisar o curador no WhatsApp. */}
      {justSaved && (
        <div style={{
          background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
          border: '1px solid #86efac',
          borderRadius: '12px',
          padding: '18px 20px',
          marginBottom: '20px'
        }}>
          <strong style={{ display: 'block', color: '#15803d', fontSize: '15px', marginBottom: '4px' }}>
            ✅ Pauta salva e já na fila de votação!
          </strong>
          <p style={{ fontSize: '13px', color: '#334155', margin: '0 0 14px', lineHeight: 1.5 }}>
            “{justSaved}” já está esperando o voto do {FERNANDO_ATIVO ? 'Victor e do Fernando. Avise eles' : 'Victor. Avise ele'} pra não deixar a pauta parada:
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => openWhatsAppNotice(justSaved)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', borderRadius: '100px', border: 'none',
                background: '#25D366', color: '#fff', fontWeight: 700, fontSize: '13px',
                cursor: 'pointer', boxShadow: '0 2px 6px rgba(37, 211, 102, 0.4)'
              }}
            >
              📣 Avisar no WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setJustSaved(null)}
              style={{
                padding: '9px 18px', borderRadius: '100px', border: '1px solid #cbd5e1',
                background: '#fff', color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
              }}
            >
              ➕ Cadastrar outra
            </button>
            <button
              type="button"
              onClick={() => { setJustSaved(null); setView('ideas'); }}
              style={{
                padding: '9px 18px', borderRadius: '100px', border: '1px solid #cbd5e1',
                background: '#fff', color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
              }}
            >
              📋 Ver lista de pautas
            </button>
          </div>
        </div>
      )}

      {/* Atalho "Salvar do PC": arraste o botão para a barra de favoritos uma vez só. */}
      <div style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)',
        border: '1px solid #bfdbfe',
        borderRadius: '12px',
        padding: '16px 18px',
        marginBottom: '20px'
      }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0a66c2', fontSize: '14px' }}>
          💻 Salvar do PC com 1 clique
        </strong>
        <p style={{ fontSize: '13px', color: '#334155', margin: '8px 0 12px', lineHeight: 1.5 }}>
          Arraste o botão abaixo para a <b>barra de favoritos</b> do seu navegador (só precisa fazer isso uma vez).
          Depois, sempre que estiver vendo um post no LinkedIn ou no Instagram, é só <b>clicar nele</b> que o post abre aqui já importado — pronto pra salvar.
        </p>
        <a
          ref={bookmarkletRef}
          href="#salvar-no-radar"
          draggable="true"
          onClick={(e) => { e.preventDefault(); addToast('Arraste este botão para a barra de favoritos do navegador (não precisa clicar).', 'success'); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '100px',
            background: '#0a66c2',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            textDecoration: 'none',
            border: 'none',
            boxShadow: '0 2px 6px rgba(10, 102, 194, 0.35)',
            cursor: 'grab'
          }}
        >
          ➕ Salvar no Radar
        </a>
        <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
          ↑ arraste para os favoritos — não clique aqui
        </span>
      </div>

      <form className="idea-form" onSubmit={submit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--linkedin-dark-gray)' }}>Link Original do Post (LinkedIn ou Instagram) *</span>
            {form.linkedinUrl && (
              <button
                type="button"
                onClick={handleAutofill}
                disabled={isImporting}
                style={{
                  fontSize: '11px',
                  color: '#ffffff',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 14px',
                  borderRadius: '100px',
                  background: isImporting ? '#8bb7e0' : '#0a66c2',
                  border: 'none',
                  cursor: isImporting ? 'wait' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 3px rgba(10, 102, 194, 0.3)'
                }}
              >
                {isImporting ? '⏳ Buscando post real...' : (detectPlatform(form.linkedinUrl) === 'instagram' ? '🔗 Importar do Instagram' : '🔗 Importar do LinkedIn')}
              </button>
            )}
          </div>
          <input
            value={form.linkedinUrl}
            onChange={e => update('linkedinUrl', e.target.value)}
            placeholder="Cole o link do LinkedIn ou do Instagram (ex.: instagram.com/p/... ou /reel/...)"
            required
          />
        </div>

        <label>
          Título Interno / Tema Principal *
          <input
            value={form.title}
            onChange={e => update('title', e.target.value)}
            placeholder="Ex: Engenheiro de Dados Pleno - Seguros"
            required
          />
        </label>

        <div className="form-grid-2">
          <label>
            Nome do Autor do Post
            <input
              value={form.sourceAuthor}
              onChange={e => update('sourceAuthor', e.target.value)}
              placeholder="Ex: Raphaela Sylvestre Oliveira"
            />
          </label>

          <label>
            Cargo / Headline do Autor
            <input
              value={form.authorHeadline}
              onChange={e => update('authorHeadline', e.target.value)}
              placeholder="Ex: Tech Recruiter Pleno"
            />
          </label>
        </div>

        <div className="form-grid-2">
          <label>
            URL da Foto do Autor (Avatar)
            <input
              value={form.authorAvatar}
              onChange={e => update('authorAvatar', e.target.value)}
              placeholder="https://exemplo.com/foto.jpg"
            />
            <span style={{ fontSize: '11.5px', color: 'var(--linkedin-blue)', fontWeight: 600, marginTop: '4px', display: 'block', lineHeight: 1.3 }}>
              💡 <strong>Dica da Foto Real:</strong> Clique com o botão direito na foto do autor no LinkedIn, selecione <strong>"Copiar endereço da imagem"</strong> e cole neste campo!
            </span>
          </label>

          <label>
            URL de Imagem / Print Anexo ao Post
            <input
              value={form.imageUrl}
              onChange={e => update('imageUrl', e.target.value)}
              placeholder="https://..."
            />
          </label>
        </div>

        <label>
          Texto Completo do Post {form.summary ? '✅' : '(Cole o texto do LinkedIn)'}
          <textarea
            value={form.summary}
            onChange={e => update('summary', e.target.value)}
            placeholder={FERNANDO_ATIVO ? 'Cole aqui o texto completo do post do LinkedIn preservando emojis, quebras de linha e caracteres especiais para que Victor e Fernando leiam o post inteiro de forma idêntica...' : 'Cole aqui o texto completo do post do LinkedIn preservando emojis, quebras de linha e caracteres especiais para que o Victor leia o post inteiro de forma idêntica...'}
            style={{ minHeight: '160px', borderColor: form.summary ? '#10b981' : undefined }}
          />
          {!form.summary && (
            <span style={{ fontSize: '11.5px', color: '#ef4444', fontWeight: 600, marginTop: '4px', display: 'block', lineHeight: 1.3 }}>
              ⚠️ O LinkedIn frequentemente bloqueia a extração automática do texto. <strong>Cole o texto completo do post aqui manualmente.</strong>
            </span>
          )}
        </label>

        <label>
          Ângulo Playbook (Como isso vira conteúdo da Playbook Lab?)
          <textarea
            value={form.playbookAngle}
            onChange={e => update('playbookAngle', e.target.value)}
            placeholder="Ex: Destacar que a tecnologia e automação eliminam gargalos técnicos..."
          />
        </label>

        <div className="form-grid-2">
          <label>
            Categoria
            <select value={form.category} onChange={e => update('category', e.target.value)}>
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </label>

          <label>
            Tipo de Conteúdo Sugerido (Formato)
            <select value={form.contentType} onChange={e => update('contentType', e.target.value)}>
              {CONTENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        </div>

        <div className="form-grid-2">
          <label>
            Prioridade Inicial
            <select value={form.initialPriority} onChange={e => update('initialPriority', e.target.value)}>
              <option value="Baixa">Baixa</option>
              <option value="Média">Média</option>
              <option value="Alta">Alta</option>
            </select>
          </label>

          <label>
            Curtidas (Social)
            <input
              type="number"
              value={form.mockLikes || ''}
              onChange={e => update('mockLikes', parseInt(e.target.value) || 0)}
              placeholder="Ex: 105"
            />
          </label>
        </div>

        <label>
          Notas Internas (Privado para o time)
          <textarea
            value={form.internalNotes}
            onChange={e => update('internalNotes', e.target.value)}
            placeholder="Prazos, sugestões adicionais ou observações rápidas..."
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={() => setView('dashboard')}>
            Cancelar
          </button>
          <button type="submit" className="btn-submit" disabled={isImporting}>
            <Plus size={16} /> Salvar Referência
          </button>
        </div>
      </form>
    </section>
  );
}

// ==================== ADMIN: IDEAS LISTING VIEW ====================
function IdeasListView({
  ideas,
  votes = [],
  updateState,
  query,
  setQuery,
  addToast,
  curatorFilter,
  setCuratorFilter,
  activeFilter,
  setActiveFilter,
  currentUser,
  onScheduleIdea,
  onOpenStudio
}) {

  // No celular a Tabela Operacional (7 colunas) vira scroll horizontal; o feed é
  // muito mais confortável, então ele é o padrão em telas estreitas mesmo pro Felipe.
  const isNarrowScreen = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const [viewMode, setViewMode] = useState(currentUser === 'Felipe' && !isNarrowScreen ? 'table' : 'feed');
  const [commentingIdea, setCommentingIdea] = useState(null);
  const [customComment, setCustomComment] = useState('');
  const [selectedQuickComment, setSelectedQuickComment] = useState('');

  function handleDirectVote(ideaId, voteType) {
    if (!isCurator(currentUser)) {
      addToast(`Apenas curadores (${CURATORS.join('/')}) podem votar!`, 'error');
      return;
    }
    updateState(prev => {
      const existingVoteIndex = prev.votes.findIndex(v => v.ideaId === ideaId && v.voterName === currentUser);
      let nextVotes = [...prev.votes];

      if (existingVoteIndex > -1) {
        nextVotes[existingVoteIndex] = {
          ...nextVotes[existingVoteIndex],
          vote: voteType,
          createdAt: new Date().toISOString()
        };
      } else {
        nextVotes.push({
          id: generateUUID(),
          ideaId,
          voterName: currentUser,
          vote: voteType,
          comment: '',
          createdAt: new Date().toISOString()
        });
      }

      return {
        ...prev,
        votes: nextVotes
      };
    });
    addToast(`Voto "${voteLabel(voteType)}" registrado!`);
  }

  function handleSaveFeedComment(withComment = true) {
    if (!commentingIdea) return;
    if (!isCurator(currentUser)) {
      addToast(`Apenas curadores (${CURATORS.join('/')}) podem comentar!`, 'error');
      return;
    }

    const finalComment = withComment
      ? (selectedQuickComment ? `[${selectedQuickComment}] ${customComment}`.trim() : customComment.trim())
      : '';

    updateState(prev => {
      const existingVoteIndex = prev.votes.findIndex(v => v.ideaId === commentingIdea.id && v.voterName === currentUser);
      let nextVotes = [...prev.votes];

      if (existingVoteIndex > -1) {
        nextVotes[existingVoteIndex] = {
          ...nextVotes[existingVoteIndex],
          comment: finalComment,
          createdAt: new Date().toISOString()
        };
      } else {
        nextVotes.push({
          id: generateUUID(),
          ideaId: commentingIdea.id,
          voterName: currentUser,
          vote: 'maybe',
          comment: finalComment,
          createdAt: new Date().toISOString()
        });
      }

      return {
        ...prev,
        votes: nextVotes
      };
    });

    addToast("Comentário editorial registrado!");
    setCommentingIdea(null);
    setCustomComment('');
    setSelectedQuickComment('');
  }

  const filteredIdeas = useMemo(() => {
    return ideas.filter(idea => {
      // 1. Status Filter
      if (activeFilter !== 'todas') {
        if (activeFilter === 'pendente') {
          if (idea.computedStatus !== 'pendente') return false;
        } else if (activeFilter === 'aguardando') {
          if (idea.computedStatus !== 'aguardando outro voto') return false;
        } else {
          if (idea.computedStatus !== activeFilter) return false;
        }
      }

      // 2. Curator Curation Filter
      if (curatorFilter !== 'todos') {
        if (curatorFilter === 'victor_voted') {
          if (!idea.victorVote) return false;
        } else if (curatorFilter === 'victor_like') {
          if (idea.victorVote !== 'like') return false;
        } else if (curatorFilter === 'victor_maybe') {
          if (idea.victorVote !== 'maybe') return false;
        } else if (curatorFilter === 'victor_dislike') {
          if (idea.victorVote !== 'dislike') return false;
        } else if (curatorFilter === 'victor_pending') {
          if (idea.victorVote) return false;
        } else if (curatorFilter === 'fernando_voted') {
          if (!idea.fernandoVote) return false;
        } else if (curatorFilter === 'fernando_like') {
          if (idea.fernandoVote !== 'like') return false;
        } else if (curatorFilter === 'fernando_maybe') {
          if (idea.fernandoVote !== 'maybe') return false;
        } else if (curatorFilter === 'fernando_dislike') {
          if (idea.fernandoVote !== 'dislike') return false;
        } else if (curatorFilter === 'fernando_pending') {
          if (idea.fernandoVote) return false;
        }
      }

      // 3. Search query filter
      const searchStr = `${idea.title} ${idea.summary} ${idea.category} ${idea.contentType} ${idea.sourceAuthor}`.toLowerCase();
      return searchStr.includes(query.toLowerCase());
    });
  }, [ideas, activeFilter, curatorFilter, query]);

  function handleDelete(id) {
    if (!confirm('Deseja excluir permanentemente a referência do radar? Os votos associados também serão excluídos.')) return;
    updateState(prev => ({
      ideas: prev.ideas.filter(i => i.id !== id),
      votes: prev.votes.filter(v => v.ideaId !== id)
    }));
    addToast('Referência deletada do Radar.');
  }

  function handleUpdateManualStatus(id, value) {
    updateState(prev => ({
      ...prev,
      ideas: prev.ideas.map(i => i.id === id ? { ...i, manualStatus: value === 'auto' ? null : value } : i)
    }));
    addToast('Status interno modificado.');
  }

  const getStatusCount = (status) => {
    if (status === 'todas') return ideas.length;
    if (status === 'pendente') return ideas.filter(i => i.computedStatus === 'pendente').length;
    if (status === 'aguardando') return ideas.filter(i => i.computedStatus === 'aguardando outro voto').length;
    return ideas.filter(i => i.computedStatus === status).length;
  };

  const curatorType = curatorFilter.startsWith('victor_')
    ? 'victor'
    : curatorFilter.startsWith('fernando_')
      ? 'fernando'
      : 'todos';

  const handleCuratorTypeChange = (type) => {
    if (type === 'todos') {
      setCuratorFilter('todos');
    } else {
      setCuratorFilter(`${type}_voted`);
    }
  };

  return (
    <section>
      <div className="admin-view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <p className="eyebrow">{currentUser === 'Felipe' ? 'Radar' : 'Minhas Curadorias'}</p>
          <h2>{currentUser === 'Felipe' ? 'Curadorias & Decisões' : 'Histórico de Curadoria'}</h2>
          <p>{currentUser === 'Felipe' ? `Revise notas de ${CURATORS.join('/')} e alterne fluxos operacionais manualmente.` : 'Visualize e filtre as pautas do radar com base nos seus votos.'}</p>
        </div>

        <div className="view-mode-toggle-container" style={{ display: 'flex', gap: '4px', background: '#eef3f8', padding: '4px', borderRadius: '100px', border: '1px solid rgba(0, 0, 0, 0.08)' }}>
          <button
            type="button"
            className={viewMode === 'feed' ? 'li-toggle-btn active' : 'li-toggle-btn'}
            onClick={() => setViewMode('feed')}
            style={{
              padding: '6px 16px',
              borderRadius: '100px',
              fontSize: '12.5px',
              fontWeight: 600,
              color: viewMode === 'feed' ? '#ffffff' : '#5c6f84',
              background: viewMode === 'feed' ? '#0a66c2' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Visualização em Feed
          </button>
          <button
            type="button"
            className={viewMode === 'table' ? 'li-toggle-btn active' : 'li-toggle-btn'}
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 16px',
              borderRadius: '100px',
              fontSize: '12.5px',
              fontWeight: 600,
              color: viewMode === 'table' ? '#ffffff' : '#5c6f84',
              background: viewMode === 'table' ? '#0a66c2' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Tabela Operacional
          </button>
        </div>
      </div>

      <div className="filter-search-container">
        <div className="search-box-row">
          <div className="search-input-wrapper">
            <Search size={18} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por tema, categoria, autor..."
            />
          </div>

          <div className="curator-filter-segmented-container">
            <div className="li-tabs-container">
              <button
                type="button"
                className={curatorType === 'todos' ? 'li-tab active' : 'li-tab'}
                onClick={() => handleCuratorTypeChange('todos')}
              >
                Todos os Curadores
              </button>
              <button
                type="button"
                className={curatorType === 'victor' ? 'li-tab active' : 'li-tab'}
                onClick={() => handleCuratorTypeChange('victor')}
              >
                Victor
              </button>
              {/* Aba de filtro do Fernando desativada (ver ./teamConfig.js). */}
              {FERNANDO_ATIVO && (
                <button
                  type="button"
                  className={curatorType === 'fernando' ? 'li-tab active' : 'li-tab'}
                  onClick={() => handleCuratorTypeChange('fernando')}
                >
                  Fernando
                </button>
              )}
            </div>
          </div>
        </div>

        {curatorType !== 'todos' && (
          <div className="curator-vote-subfilter-row">
            <span className="curator-subfilter-label">Filtro de Voto:</span>
            <div className="subfilter-chips">
              {[
                { value: 'voted', label: 'Qualquer Voto' },
                { value: 'like', label: 'Gostei' },
                { value: 'maybe', label: 'Talvez' },
                { value: 'dislike', label: 'Não Gostei' },
                { value: 'pending', label: 'Pendente' }
              ].map(opt => {
                const isActive = curatorFilter === `${curatorType}_${opt.value}`;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={isActive ? 'subfilter-chip active' : 'subfilter-chip'}
                    onClick={() => setCuratorFilter(`${curatorType}_${opt.value}`)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="filters-scroll">
          <button className={activeFilter === 'todas' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('todas')}>
            Todas <span className="filter-chip-count">{getStatusCount('todas')}</span>
          </button>
          <button className={activeFilter === 'pendente' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('pendente')}>
            Pendentes <span className="filter-chip-count">{getStatusCount('pendente')}</span>
          </button>
          <button className={activeFilter === 'aguardando' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('aguardando')}>
            Aguardando Outro <span className="filter-chip-count">{getStatusCount('aguardando')}</span>
          </button>
          <button className={activeFilter === 'aprovado' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('aprovado')}>
            Aprovadas <span className="filter-chip-count">{getStatusCount('aprovado')}</span>
          </button>
          <button className={activeFilter === 'divergente' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('divergente')}>
            Divergente <span className="filter-chip-count">{getStatusCount('divergente')}</span>
          </button>
          <button className={activeFilter === 'avaliar' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('avaliar')}>
            Avaliar <span className="filter-chip-count">{getStatusCount('avaliar')}</span>
          </button>
          <button className={activeFilter === 'rejeitado' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('rejeitado')}>
            Rejeitadas <span className="filter-chip-count">{getStatusCount('rejeitado')}</span>
          </button>
          <button className={activeFilter === 'em_producao' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('em_producao')}>
            Em Produção <span className="filter-chip-count">{getStatusCount('em_producao')}</span>
          </button>
          <button className={activeFilter === 'publicada' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('publicada')}>
            Publicadas <span className="filter-chip-count">{getStatusCount('publicada')}</span>
          </button>
          <button className={activeFilter === 'arquivada' ? "filter-chip active" : "filter-chip"} onClick={() => setActiveFilter('arquivada')}>
            Arquivadas <span className="filter-chip-count">{getStatusCount('arquivada')}</span>
          </button>
        </div>
      </div>

      {viewMode === 'feed' ? (
        <div className="li-feed-view-list" style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', padding: '10px 0' }}>
          {filteredIdeas.length === 0 ? (
            <div className="empty-state-card" style={{ padding: '40px', textAlign: 'center', background: 'white', borderRadius: '8px', border: '1px solid #e0e0e0', margin: '0 auto', width: '100%' }}>
              <div className="empty-state-icon">
                <CheckCircle2 size={30} />
              </div>
              <h3>Nenhuma referência para curadoria</h3>
              <p>Não há pautas correspondentes aos filtros aplicados neste momento.</p>
            </div>
          ) : (
            filteredIdeas.map(idea => {
              const ideaComments = votes.filter(v => v.ideaId === idea.id && v.comment);

              return (
                <div key={idea.id} className="li-feed-item-wrapper" style={{ display: 'flex', flexDirection: 'column', width: '100%', background: '#ffffff', borderRadius: '8px', border: '1px solid #e0e0e0', overflow: 'visible', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'relative' }}>

                  {/* Curation Info Ribbon Above Card */}
                  <div className="li-feed-curator-status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f3f6f8', padding: '12px 20px', borderBottom: '1px solid #e0e0e0', fontSize: '13px', fontWeight: 600, borderTopLeftRadius: '7px', borderTopRightRadius: '7px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`status-pill ${idea.computedStatus.replace(' outro voto', '')}`}>
                        {idea.computedStatus === 'em_producao' ? 'Em Produção' :
                          idea.computedStatus === 'publicada' ? 'Publicada' :
                            idea.computedStatus === 'arquivada' ? 'Arquivada' : idea.computedStatus}
                      </span>
                      <StatusDropdown
                        idea={idea}
                        onChange={value => handleUpdateManualStatus(idea.id, value)}
                        currentUser={currentUser}
                        isSmall={true}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {currentUser === 'Felipe' && (
                        <button
                          type="button"
                          onClick={() => onScheduleIdea && onScheduleIdea(idea)}
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid ' + (idea.scheduledAt ? 'var(--linkedin-blue)' : '#cbd5e1'),
                            background: idea.scheduledAt ? 'var(--linkedin-blue-light)' : '#ffffff',
                            color: idea.scheduledAt ? 'var(--linkedin-blue)' : '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title={idea.scheduledAt ? `Agendado para ${new Date(idea.scheduledAt).toLocaleDateString('pt-BR')} (${idea.scheduledAssignee})` : "Agendar publicação"}
                        >
                          <Calendar size={11} /> {idea.scheduledAt ? 'Agendado' : 'Agendar'}
                        </button>
                      )}
                      <span className="score-meter-pill medium" style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(10, 102, 194, 0.08)', color: 'var(--linkedin-blue)' }}>
                        Score: <strong>{idea.score}</strong>
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--linkedin-mid-gray)' }}>{idea.suggestedDecision}</span>
                    </div>
                  </div>

                  {/* High Fidelity LinkedInCard */}
                  <LinkedInCard
                    idea={idea}
                    comments={ideaComments}
                    onVote={(voteType) => handleDirectVote(idea.id, voteType)}
                    onOpenComment={() => setCommentingIdea(idea)}
                    addToast={addToast}
                  />

                  {/* Curator votes statuses row under the card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', background: '#fafafa', borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: '12.5px', color: 'var(--linkedin-dark-gray)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <img src={USER_AVATARS.Victor} alt="Victor" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} />
                      Victor: <strong style={{ color: idea.victorVote === 'like' ? 'var(--vote-green)' : idea.victorVote === 'maybe' ? 'var(--vote-amber)' : idea.victorVote === 'dislike' ? 'var(--vote-red)' : 'var(--linkedin-mid-gray)' }}>{voteLabel(idea.victorVote)}</strong>
                    </span>
                    {/* Voto do Fernando desativado (ver ./teamConfig.js). */}
                    {FERNANDO_ATIVO && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <img src={USER_AVATARS.Fernando} alt="Fernando" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} />
                        Fernando: <strong style={{ color: idea.fernandoVote === 'like' ? 'var(--vote-green)' : idea.fernandoVote === 'maybe' ? 'var(--vote-amber)' : idea.fernandoVote === 'dislike' ? 'var(--vote-red)' : 'var(--linkedin-mid-gray)' }}>{voteLabel(idea.fernandoVote)}</strong>
                      </span>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', width: '90px' }}>Imagem</th>
                <th>Tema / Título</th>
                <th>Victor</th>
                {/* Coluna do Fernando desativada (ver ./teamConfig.js). */}
                {FERNANDO_ATIVO && <th>Fernando</th>}
                <th>Score</th>
                <th>Status do Radar</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredIdeas.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--linkedin-mid-gray)', fontStyle: 'italic' }}>
                    Nenhuma referência encontrada.
                  </td>
                </tr>
              ) : (
                filteredIdeas.map(idea => {
                  const ideaComments = votes.filter(v => v.ideaId === idea.id && v.comment);
                  const scoreClass = idea.score >= 1.5 ? 'high' : idea.score > 0 ? 'medium' : 'low';

                  return (
                    <tr key={idea.id}>
                      <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                        {idea.imageUrl ? (
                          <div
                            style={{
                              width: '64px',
                              height: '42px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1px solid rgba(0,0,0,0.12)',
                              background: '#f8fafc',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                              cursor: 'pointer',
                              transition: 'transform 0.15s ease'
                            }}
                            onClick={() => onOpenStudio(idea)}
                            title="Clique para abrir no Estúdio de Criação"
                            onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                          >
                            <img src={idea.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: '64px',
                              height: '42px',
                              borderRadius: '6px',
                              border: '1px dashed #cbd5e1',
                              background: '#f8fafc',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={() => onOpenStudio(idea)}
                            title="Clique para carregar imagem no Estúdio de Criação"
                            onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.borderColor = 'var(--linkedin-blue)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                          >
                            <Plus size={14} style={{ color: '#64748b' }} />
                          </div>
                        )}
                      </td>
                      <td
                        className="idea-table-title clickable"
                        onClick={() => onOpenStudio(idea)}
                        title="Clique para abrir no Estúdio de Criação"
                      >
                        <strong>{idea.title}</strong>
                        <span>Enviado em: {new Date(idea.createdAt).toLocaleDateString('pt-BR')}</span>

                        {ideaComments.length > 0 && (
                          <div className="table-idea-comments">
                            {ideaComments.map(c => (
                              <div key={c.id} className="table-comment-bubble">
                                <strong>{c.voterName}:</strong> "{c.comment}"
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {renderVoteBadge(idea.victorVote)}
                      </td>
                      {/* Célula de voto do Fernando desativada (ver ./teamConfig.js). */}
                      {FERNANDO_ATIVO && (
                        <td>
                          {renderVoteBadge(idea.fernandoVote)}
                        </td>
                      )}
                      <td>
                        {renderScoreColumn(idea.score, idea.suggestedDecision)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <StatusDropdown
                            idea={idea}
                            onChange={value => handleUpdateManualStatus(idea.id, value)}
                            currentUser={currentUser}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <a href={idea.linkedinUrl} target="_blank" rel="noreferrer" className="action-icon-btn" title="Abrir no LinkedIn">
                            <ExternalLink size={12} />
                          </a>
                          {currentUser === 'Felipe' && (
                            <>
                              <button
                                className="action-icon-btn"
                                onClick={() => onScheduleIdea && onScheduleIdea(idea)}
                                title={idea.scheduledAt ? `Agendado para ${new Date(idea.scheduledAt).toLocaleDateString('pt-BR')} (${idea.scheduledAssignee})` : "Agendar publicação"}
                                style={idea.scheduledAt ? { color: 'var(--linkedin-blue)', borderColor: 'var(--linkedin-blue)', background: 'var(--linkedin-blue-light)' } : {}}
                              >
                                <Calendar size={12} />
                              </button>
                              <button className="action-icon-btn" onClick={() => handleUpdateManualStatus(idea.id, 'arquivada')} title="Arquivar">
                                <Archive size={12} />
                              </button>
                              <button className="action-icon-btn delete" onClick={() => handleDelete(idea.id)} title="Excluir">
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Curation comment modal in Feed View */}
      <AnimatePresence>
        {commentingIdea && (
          <div className="comment-overlay-backdrop" onClick={() => handleSaveFeedComment(false)}>
            <div className="comment-panel" onClick={e => e.stopPropagation()}>
              <h4>
                <MessageSquare size={18} className="text-blue-primary" />
                Justificar curadoria feed: {commentingIdea.title}
              </h4>
              <p className="desc">Aperte um atalho rápido ou descreva o direcionamento para o redator.</p>

              <div className="comment-tags-grid">
                {QUICK_COMMENTS.map(tag => (
                  <button
                    key={tag}
                    className={selectedQuickComment === tag ? "comment-tag-pill active" : "comment-tag-pill"}
                    onClick={() => setSelectedQuickComment(prev => prev === tag ? '' : tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <textarea
                className="comment-textarea"
                placeholder="Ex: Ótimo tema, acho legal complementar com dados de GTM do nosso case..."
                value={customComment}
                onChange={e => setCustomComment(e.target.value)}
              />

              <div className="comment-actions">
                <button className="skip" onClick={() => handleSaveFeedComment(false)}>
                  Apenas Votar
                </button>
                <button className="save" onClick={() => handleSaveFeedComment(true)}>
                  Salvar Comentário
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ==================== ADMIN: EXPORT VIEW ====================
function DataExportView({ state, ideas, addToast }) {
  function downloadCsv(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`CSV "${filename}" exportado para download!`);
  }

  function exportIdeiasCsv() {
    const header = ['id', 'data_adicionada', 'titulo', 'link_linkedin', 'autor', 'resumo', 'angulo_playbook', 'categoria', 'tipo_conteudo', 'status'];
    const rows = state.ideas.map(i => [
      i.id,
      i.createdAt,
      i.title,
      i.linkedinUrl,
      i.sourceAuthor,
      i.summary,
      i.playbookAngle,
      i.category,
      i.contentType,
      i.manualStatus || 'auto'
    ]);

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    downloadCsv('ideias.csv', csvContent);
  }

  function exportVotosCsv() {
    const header = ['id_voto', 'id_ideia', 'pessoa', 'voto', 'comentario', 'data_voto'];
    const rows = state.votes.map(v => [
      v.id,
      v.ideaId,
      v.voterName,
      v.vote,
      v.comment || '',
      v.createdAt
    ]);

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    downloadCsv('votos.csv', csvContent);
  }

  function exportResumoCsv() {
    // Coluna voto_fernando incluída apenas quando o perfil está ativo (ver ./teamConfig.js).
    const header = ['id_ideia', 'titulo', 'categoria', 'tipo_conteudo', 'voto_victor', ...(FERNANDO_ATIVO ? ['voto_fernando'] : []), 'score', 'status', 'decisao_sugerida'];
    const rows = ideas.map(i => [
      i.id,
      i.title,
      i.category,
      i.contentType,
      voteLabel(i.victorVote),
      ...(FERNANDO_ATIVO ? [voteLabel(i.fernandoVote)] : []),
      i.score,
      i.computedStatus,
      i.suggestedDecision
    ]);

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    downloadCsv('resumo.csv', csvContent);
  }

  function exportBackupJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playbook-content-radar-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    addToast('Backup JSON gerado com sucesso!');
  }

  return (
    <section>
      <div className="admin-view-header">
        <p className="eyebrow">Exportar</p>
        <h2>Integração Google Planilhas</h2>
        <p>Gere os arquivos estruturados para exportação facilitada para o Sheets ou faça backup local.</p>
      </div>

      <div className="export-panel">
        <div className="export-grid">
          <div className="export-card">
            <div className="export-card-icon"><FileText size={18} /></div>
            <h4>ideias.csv</h4>
            <p>Lista o acervo total de referências, temas e URLs mapeadas pelo Felipe.</p>
            <button className="primary" onClick={exportIdeiasCsv}><Download size={12} /> Baixar CSV</button>
          </div>

          <div className="export-card">
            <div className="export-card-icon"><MessageSquare size={18} /></div>
            <h4>votos.csv</h4>
            <p>Registro individual de todas as votações, carimbos e notas explicativas.</p>
            <button className="primary" onClick={exportVotosCsv}><Download size={12} /> Baixar CSV</button>
          </div>

          <div className="export-card">
            <div className="export-card-icon"><BarChart3 size={18} /></div>
            <h4>resumo.csv</h4>
            <p>Planilha consolidada contendo decisões automáticas sugeridas e scores das pautas.</p>
            <button className="primary" onClick={exportResumoCsv}><Download size={12} /> Baixar CSV</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button onClick={exportBackupJson} style={{ background: 'var(--linkedin-dark-gray)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
            <Download size={12} /> Exportar Backup JSON
          </button>
        </div>

        <div className="instruction-box">
          <h4>📊 Como rodar a sincronização manual:</h4>
          <p style={{ marginTop: '6px' }}>
            1. Faça download do <strong>resumo.csv</strong> acima.<br />
            2. No seu Google Planilhas, acesse <strong>Arquivo &gt; Importar &gt; Fazer Upload</strong>.<br />
            3. Selecione o arquivo baixado e marque a opção <strong>"Substituir planilha atual"</strong>.<br />
            4. O Google Sheets identificará os cabeçalhos das colunas automaticamente, deixando os dados 100% prontos para suas conexões via ferramentas como n8n, Zapier ou automações com Apps Script.
          </p>
        </div>
      </div>
    </section>
  );
}

// ==================== EDITORIAL CALENDAR & SCHEDULER VIEW ====================
function SchedulerModal({ idea: initialIdea, preselectedDate, unscheduledIdeas = [], onClose, updateState, addToast }) {
  const [selectedIdeaId, setSelectedIdeaId] = useState(initialIdea ? initialIdea.id : (unscheduledIdeas[0]?.id || ''));
  const [date, setDate] = useState(preselectedDate || (initialIdea?.scheduledAt || ''));
  const [assignee, setAssignee] = useState(initialIdea?.scheduledAssignee || 'Victor');

  const activeIdea = useMemo(() => {
    if (initialIdea) return initialIdea;
    return unscheduledIdeas.find(i => i.id === selectedIdeaId);
  }, [initialIdea, selectedIdeaId, unscheduledIdeas]);

  const [playbookAngle, setPlaybookAngle] = useState('');

  React.useEffect(() => {
    if (activeIdea) {
      setPlaybookAngle(activeIdea.playbookAngle || '');
    }
  }, [activeIdea]);

  const handleSave = () => {
    if (!activeIdea) {
      alert('Selecione uma pauta para agendar.');
      return;
    }
    if (!date) {
      alert('Selecione uma data para agendar.');
      return;
    }

    updateState(prev => ({
      ...prev,
      ideas: prev.ideas.map(i => i.id === activeIdea.id ? {
        ...i,
        scheduledAt: date,
        scheduledAssignee: assignee,
        playbookAngle: playbookAngle,
        // Automatic decision promotion to em_producao when scheduled
        manualStatus: i.manualStatus || 'em_producao'
      } : i)
    }));

    addToast(`Pauta agendada para ${new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')} (${assignee})!`, 'success');
    onClose();
  };

  const handleUnschedule = () => {
    if (!activeIdea) return;
    if (!confirm('Deseja remover o agendamento desta pauta?')) return;

    updateState(prev => ({
      ...prev,
      ideas: prev.ideas.map(i => i.id === activeIdea.id ? {
        ...i,
        scheduledAt: null,
        scheduledAssignee: null
      } : i)
    }));

    addToast('Agendamento removido.', 'success');
    onClose();
  };

  return (
    <div className="scheduler-modal-backdrop" onClick={onClose}>
      <div className="scheduler-modal" onClick={e => e.stopPropagation()}>
        <div className="scheduler-modal-header">
          <h3>📅 {initialIdea ? 'Editar Agendamento' : 'Programar Publicação'}</h3>
          <X className="close-btn" size={18} onClick={onClose} />
        </div>
        <div className="scheduler-modal-body">
          {initialIdea ? (
            <div className="scheduler-post-summary">
              <h4>{activeIdea.title}</h4>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Autor: {activeIdea.sourceAuthor} | Categoria: {activeIdea.category}</p>
            </div>
          ) : (
            <label className="scheduler-form-label">
              Selecione a Referência / Post *
              <select
                className="scheduler-form-select"
                value={selectedIdeaId}
                onChange={e => setSelectedIdeaId(e.target.value)}
              >
                {unscheduledIdeas.length === 0 ? (
                  <option value="">Nenhuma pauta aprovada disponível</option>
                ) : (
                  unscheduledIdeas.map(i => (
                    <option key={i.id} value={i.id}>
                      [{i.category}] {i.title.slice(0, 50)}{i.title.length > 50 ? '...' : ''}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          <label className="scheduler-form-label">
            Data de Publicação *
            <input
              type="date"
              className="scheduler-form-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </label>

          <label className="scheduler-form-label">
            Responsável pela Publicação *
            <select
              className="scheduler-form-select"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
            >
              <option value="Victor">Victor</option>
              {/* Fernando removido como responsável (ver ./teamConfig.js). */}
              {FERNANDO_ATIVO && <option value="Fernando">Fernando</option>}
              <option value="Felipe">Felipe</option>
            </select>
          </label>

          <label className="scheduler-form-label">
            Ângulo Playbook Lab (Direcionamento Editorial)
            <textarea
              className="scheduler-form-input"
              style={{ minHeight: '80px', resize: 'vertical' }}
              value={playbookAngle}
              onChange={e => setPlaybookAngle(e.target.value)}
              placeholder="Ex: Enfocar no nosso diferencial e complementar com nossos dados internos de GTM..."
            />
          </label>
        </div>
        <div className="scheduler-modal-footer">
          {initialIdea?.scheduledAt && (
            <button className="scheduler-btn unschedule" onClick={handleUnschedule}>
              Remover do calendário
            </button>
          )}
          <button className="scheduler-btn cancel" onClick={onClose}>
            Cancelar
          </button>
          <button className="scheduler-btn save" onClick={handleSave} disabled={!activeIdea}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== ESTÚDIO DE CRIAÇÃO EDITORIAL (PUBLISHER STUDIO) ====================
function PublisherStudioModal({ idea, currentUser, onClose, updateState, addToast }) {
  const [copyText, setCopyText] = useState(idea.finalPostText || '');
  const [imageUrl, setImageUrl] = useState(idea.finalImageUrl || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState('preview');
  const [previewPersona, setPreviewPersona] = useState('Victor');

  const isFelipe = currentUser === 'Felipe';

  const categoryImages = {
    'IA': 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=800',
    'Agentes de IA': 'https://images.unsplash.com/photo-1680814907495-d227b2c525db?w=800',
    'Vendas': 'https://images.unsplash.com/photo-1552581230-c01891e7c90a?w=800',
    'GTM': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    'Automação': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
    'RevOps': 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800',
    'Conteúdo': 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800',
    'LinkedIn': 'https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=800',
    'Produto': 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800',
    'Mercado': 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800',
    'Ferramentas': 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800',
    'Bastidores Playbook': 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800',
    'Outro': 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800'
  };

  const handleAiGenerateImage = () => {
    setIsGenerating(true);
    addToast('🤖 Inteligência Artificial analisando a pauta...', 'success');

    setTimeout(() => {
      const selectedImage = categoryImages[idea.category] || categoryImages['Outro'];
      setImageUrl(selectedImage);
      setIsGenerating(false);
      addToast('🎨 Imagem criada com IA para a pauta!', 'success');
    }, 1500);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      addToast('⚠️ A imagem deve ter no máximo 8MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result);
      addToast('📤 Imagem carregada com sucesso!', 'success');
    };
    reader.onerror = () => {
      addToast('❌ Falha ao processar o arquivo.', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    updateState(prev => ({
      ...prev,
      ideas: prev.ideas.map(i => i.id === idea.id ? {
        ...i,
        finalPostText: copyText,
        finalImageUrl: imageUrl,
        // Sync with base Supabase image_url column under the hood
        imageUrl: imageUrl
      } : i)
    }));
    addToast('✍️ Post final e imagem salvos com sucesso no estúdio!', 'success');
    onClose();
  };

  const handleCopyToClipboard = () => {
    if (!copyText) return;
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    addToast('📋 Copy final copiada para a área de transferência!', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleUnschedule = () => {
    if (!confirm('Deseja remover esta pauta do Calendário Editorial?')) return;

    updateState(prev => ({
      ...prev,
      ideas: prev.ideas.map(i => i.id === idea.id ? {
        ...i,
        scheduledAt: null,
        scheduledAssignee: null
      } : i)
    }));

    addToast('Agendamento removido com sucesso!', 'success');
    onClose();
  };

  const originalIdeaComments = useMemo(() => {
    return idea.internalNotes ? [{ voterName: 'Time Playbook', comment: idea.internalNotes }] : [];
  }, [idea]);

  return (
    <div className="pub-studio-backdrop" onClick={onClose}>
      <div className="pub-studio-modal" onClick={e => e.stopPropagation()}>
        <div className="pub-studio-header">
          <h3>
            <Sparkles size={18} style={{ color: '#0a66c2' }} />
            Estúdio de Criação Editorial - {idea.title}
          </h3>
          <X className="close-btn" size={18} style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>

        <div className="pub-studio-body">
          <div className="pub-studio-layout">

            {/* Left Column: Reference inspiration */}
            <div className="pub-studio-col">
              <span className="pub-studio-col-title">
                <FileText size={15} style={{ color: '#0a66c2' }} />
                1. Referência & Inspiração (Original)
              </span>

              <div className="pub-studio-reference-wrap">
                <LinkedInCard
                  idea={idea}
                  comments={originalIdeaComments}
                  onVote={() => { }}
                  onOpenComment={() => { }}
                  addToast={addToast}
                />
              </div>

              {idea.playbookAngle && (
                <div className="pub-studio-angle-callout">
                  <h5>🎯 Ângulo Playbook Lab</h5>
                  <p>{idea.playbookAngle}</p>
                </div>
              )}
            </div>

            {/* Right Column: Custom created post */}
            <div className="pub-studio-col" style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '24px', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <span className="pub-studio-col-title">
                <Sparkles size={15} style={{ color: '#057642' }} />
                2. Seu Post Final Customizado (Produção)
              </span>

              {/* Tab Selector */}
              <div className="pub-studio-tabs-row" style={{ display: 'flex', gap: '8px', margin: '12px 0 16px 0' }}>
                <button
                  type="button"
                  className={`pub-studio-tab-btn ${(activeRightTab === 'edit' || activeRightTab === 'read') ? 'active' : ''}`}
                  onClick={() => setActiveRightTab(isFelipe ? 'edit' : 'read')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid',
                    borderColor: (activeRightTab === 'edit' || activeRightTab === 'read') ? 'var(--linkedin-blue)' : '#cbd5e1',
                    background: (activeRightTab === 'edit' || activeRightTab === 'read') ? 'var(--linkedin-blue)' : '#ffffff',
                    color: (activeRightTab === 'edit' || activeRightTab === 'read') ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isFelipe ? '✍️ Editor de Post' : '📝 Visualizar Conteúdo'}
                </button>
                <button
                  type="button"
                  className={`pub-studio-tab-btn ${activeRightTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveRightTab('preview')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1px solid',
                    borderColor: activeRightTab === 'preview' ? 'var(--linkedin-blue)' : '#cbd5e1',
                    background: activeRightTab === 'preview' ? 'var(--linkedin-blue)' : '#ffffff',
                    color: activeRightTab === 'preview' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  👁️ Pré-visualização Real
                </button>
              </div>

              {/* Scrollable Tab Content Area */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {activeRightTab === 'edit' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        Copy Final do Post *
                      </label>
                      <textarea
                        className="pub-studio-copy-textarea"
                        value={copyText}
                        onChange={e => setCopyText(e.target.value)}
                        placeholder="Redija aqui a copy final adaptada para a Playbook Lab com base no post original à esquerda..."
                      />
                    </div>

                    <div className="pub-studio-image-widget">
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        Imagem Final do Post
                      </label>

                      <div className="pub-studio-image-preview-box">
                        {imageUrl ? (
                          <img src={imageUrl} alt="Final Preview" className="pub-studio-image-preview-img" />
                        ) : (
                          <div className="pub-studio-image-empty">
                            <Plus size={24} />
                            <span>Nenhuma imagem final definida</span>
                          </div>
                        )}
                      </div>

                      <div className="pub-studio-image-controls">
                        <button
                          type="button"
                          className="pub-studio-ai-btn"
                          onClick={handleAiGenerateImage}
                          disabled={isGenerating}
                          title="Gerar imagem conceitual com base na categoria da pauta"
                        >
                          {isGenerating ? '⏳ Criando...' : '🤖 Gerar com IA'}
                        </button>

                        <label htmlFor="pub-studio-upload" className="pub-studio-upload-btn">
                          📤 Fazer Upload
                        </label>
                        <input
                          type="file"
                          id="pub-studio-upload"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleImageUpload}
                        />

                        <input
                          type="text"
                          className="pub-studio-input-url"
                          value={imageUrl}
                          onChange={e => setImageUrl(e.target.value)}
                          placeholder="Ou cole a URL da imagem manualmente..."
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeRightTab === 'read' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative', flex: 1 }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        Copy Pronta para LinkedIn
                      </label>

                      {copyText ? (
                        <div className="pub-studio-copy-box">
                          <button
                            className="pub-studio-copy-badge"
                            style={{ cursor: 'pointer', border: 'none', background: 'var(--linkedin-blue-light)' }}
                            onClick={handleCopyToClipboard}
                          >
                            {copied ? '✓ Copiado!' : '📋 Copiar Texto'}
                          </button>
                          {copyText}
                        </div>
                      ) : (
                        <div className="pub-studio-copy-box" style={{ background: '#f8fafc', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                          Felipe ainda não redigiu a copy final para esta pauta.
                        </div>
                      )}
                    </div>

                    <div className="pub-studio-image-widget">
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        Imagem Pronta para LinkedIn
                      </label>

                      <div className="pub-studio-image-preview-box" style={{ height: '200px' }}>
                        {imageUrl ? (
                          <img src={imageUrl} alt="Final View" className="pub-studio-image-preview-img" />
                        ) : (
                          <div className="pub-studio-image-empty">
                            <span>Nenhuma imagem definida para este post.</span>
                          </div>
                        )}
                      </div>

                      {imageUrl && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <a
                            href={imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="pub-studio-btn success"
                            style={{ textDecoration: 'none', textAlign: 'center' }}
                          >
                            📥 Abrir Imagem em Alta
                          </a>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeRightTab === 'preview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Persona Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Ver como:</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {CURATORS.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPreviewPersona(p)}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              borderRadius: '4px',
                              border: '1px solid',
                              borderColor: previewPersona === p ? 'var(--linkedin-blue)' : '#cbd5e1',
                              background: previewPersona === p ? 'var(--linkedin-blue-light)' : '#ffffff',
                              color: previewPersona === p ? 'var(--linkedin-blue)' : '#475569',
                              cursor: 'pointer'
                            }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* High Fidelity Live Card Preview */}
                    <div className="pub-studio-preview-card-wrap" style={{ transform: 'scale(0.96)', transformOrigin: 'top center' }}>
                      <LinkedInCard
                        idea={{
                          ...idea,
                          sourceAuthor: previewPersona,
                          authorHeadline: 'Curador Editorial na Playbook Lab',
                          authorAvatar: USER_AVATARS[previewPersona],
                          summary: copyText || '✍️ [O post formatado aparecerá aqui após você digitar a copy...]',
                          imageUrl: imageUrl || '',
                          linkedinUrl: ''
                        }}
                        comments={[]}
                        onVote={() => { }}
                        onOpenComment={() => { }}
                        addToast={addToast}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Footer Row (unified & sticky at the bottom) */}
              <div className="pub-studio-action-row" style={{ borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: 'auto', display: 'flex', gap: '8px' }}>
                {isFelipe ? (
                  <>
                    {idea.scheduledAt && (
                      <button
                        type="button"
                        className="pub-studio-btn danger"
                        onClick={handleUnschedule}
                        style={{
                          flex: 1,
                          background: '#fef2f2',
                          color: '#ef4444',
                          border: '1px solid #fca5a5',
                          borderRadius: '100px',
                          padding: '10px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#ef4444';
                          e.currentTarget.style.color = '#ffffff';
                          e.currentTarget.style.borderColor = 'transparent';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = '#fef2f2';
                          e.currentTarget.style.color = '#ef4444';
                          e.currentTarget.style.borderColor = '#fca5a5';
                        }}
                      >
                        Desagendar
                      </button>
                    )}
                    <button type="button" className="pub-studio-btn secondary" onClick={onClose} style={{ flex: 1 }}>
                      Cancelar
                    </button>
                    <button type="button" className="pub-studio-btn primary" onClick={handleSave} style={{ flex: 2 }}>
                      Salvar e Programar
                    </button>
                  </>
                ) : (
                  <button type="button" className="pub-studio-btn secondary" onClick={onClose} style={{ flex: 'none', width: '120px', marginLeft: 'auto' }}>
                    Fechar
                  </button>
                )}
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// Chave de data no fuso local (YYYY-MM-DD), para casar published_at (timestamptz) com as células do mês
const localDateKey = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function CalendarView({ ideas, updateState, currentUser, onScheduleIdea, onScheduleDate, onOpenStudio, addToast }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [publishedPosts, setPublishedPosts] = useState([]);
  const [platformFilters, setPlatformFilters] = useState({ linkedin: true, youtube: true, instagram: true });
  // Autores sem chave no mapa permanecem sempre visíveis (ver visiblePublished).
  // Com o Fernando desativado, o chip dele some, mas as publicações históricas continuam visíveis.
  const [ownerFilters, setOwnerFilters] = useState(FERNANDO_ATIVO ? { victor: true, fernando: true } : { victor: true });

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('v_latest_linkedin_post_metrics').select('external_post_id, owner_name, author_name, published_at, hook, post_url, format, likes, comments, shares, engagement_total, is_repost, repost_id'),
      supabase.from('v_latest_youtube_video_metrics').select('video_id, owner_name, title, video_url, published_at, views, likes, comments, engagement_total'),
      supabase.from('v_latest_instagram_post_metrics').select('external_post_id, owner_name, published_at, hook, caption, post_url, format, likes, comments, engagement_total, is_repost'),
    ]).then(([li, yt, ig]) => {
      if (!active) return;
      const linkedin = filterContent(Array.isArray(li.data) ? li.data : []).map(p => ({
        key: `li-${p.external_post_id || p.post_url}`,
        platform: 'linkedin',
        owner_name: p.owner_name,
        published_at: p.published_at,
        title: p.hook || 'Post no LinkedIn',
        url: p.post_url,
        likes: p.likes,
        comments: p.comments,
        engagement_total: p.engagement_total,
      }));
      const youtube = (Array.isArray(yt.data) ? yt.data : []).map(v => ({
        key: `yt-${v.video_id}`,
        platform: 'youtube',
        owner_name: v.owner_name,
        published_at: v.published_at,
        title: v.title || 'Vídeo no YouTube',
        url: v.video_url,
        likes: v.likes,
        comments: v.comments,
        views: v.views,
        engagement_total: v.engagement_total,
      }));
      // Stories são efêmeros e não pertencem ao calendário editorial — só posts e reels
      const instagram = (Array.isArray(ig.data) ? ig.data : []).filter(p => p.is_repost !== true && p.format !== 'story').map(p => ({
        key: `ig-${p.external_post_id || p.post_url}`,
        platform: 'instagram',
        owner_name: p.owner_name,
        published_at: p.published_at,
        title: p.hook || p.caption || 'Post no Instagram',
        url: p.post_url,
        likes: p.likes,
        comments: p.comments,
        engagement_total: p.engagement_total,
      }));
      setPublishedPosts([...linkedin, ...youtube, ...instagram]);
    });
    return () => { active = false; };
  }, []);

  const visiblePublished = useMemo(() => {
    return publishedPosts.filter(p => {
      if (!platformFilters[p.platform]) return false;
      const firstName = (p.owner_name || '').split(' ')[0].toLowerCase();
      // Autores fora do mapa de filtros (se surgirem novos) permanecem sempre visíveis
      if (firstName in ownerFilters) return ownerFilters[firstName];
      return true;
    });
  }, [publishedPosts, platformFilters, ownerFilters]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const dayOfWeekIdx = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const result = [];

    // Prev month filler
    for (let i = dayOfWeekIdx - 1; i >= 0; i--) {
      result.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      result.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Next month filler to complete 42 cells (6 rows)
    const remaining = 42 - result.length;
    for (let i = 1; i <= remaining; i++) {
      result.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return result;
  }, [year, month]);

  const scheduledPosts = useMemo(() => {
    return ideas.filter(i => {
      if (!i.scheduledAt) return false;
      const d = new Date(i.scheduledAt + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    }).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }, [ideas, year, month]);

  const publishedByDate = useMemo(() => {
    const map = new Map();
    for (const post of visiblePublished) {
      if (!post.published_at) continue;
      const d = new Date(post.published_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = localDateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(post);
    }
    return map;
  }, [visiblePublished]);

  const publishedThisMonth = useMemo(() => {
    return visiblePublished.filter(p => {
      if (!p.published_at) return false;
      const d = new Date(p.published_at);
      return d.getFullYear() === year && d.getMonth() === month;
    }).sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  }, [visiblePublished, year, month]);

  const unscheduledIdeas = useMemo(() => {
    return ideas.filter(i =>
      !i.scheduledAt &&
      (i.computedStatus === 'aprovado' || i.computedStatus === 'em_producao' || i.computedStatus === 'avaliar')
    );
  }, [ideas]);

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const removeFromCalendar = (idea, event) => {
    event?.stopPropagation();
    if (!confirm(`Remover “${idea.title}” do calendário?\n\nO conteúdo continuará salvo na área de Produção.`)) return;
    updateState(prev => ({
      ...prev,
      ideas: prev.ideas.map(item => item.id === idea.id ? {
        ...item,
        scheduledAt: null,
        scheduledAssignee: null
      } : item)
    }));
    addToast('Post removido do calendário. O conteúdo continua salvo em Produção.', 'success');
  };

  return (
    <section>
      <div className="admin-view-header" style={{ marginBottom: '24px' }}>
        <p className="eyebrow">Planejamento</p>
        <h2>Calendário Editorial</h2>
        <p>Programe e visualize as próximas publicações no LinkedIn da Playbook Lab.</p>
      </div>

      <div className="calendar-view-container">
        {/* Monthly Grid */}
        <div className="calendar-main-card">
          <div className="calendar-control-header">
            <div className="calendar-month-title">
              <Calendar size={20} style={{ color: 'var(--linkedin-blue)' }} />
              <strong>{MONTH_NAMES[month]} {year}</strong>
              <span style={{ fontSize: '11px', background: 'rgba(10, 102, 194, 0.08)', color: 'var(--linkedin-blue)', padding: '2px 8px', borderRadius: '99px', fontWeight: 600 }}>
                {scheduledPosts.length} agendados
              </span>
              <span style={{ fontSize: '11px', background: 'rgba(5, 118, 66, 0.08)', color: '#057642', padding: '2px 8px', borderRadius: '99px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={11} /> {publishedThisMonth.length} publicados
              </span>
            </div>
            <div className="calendar-platform-filters">
              {[
                { id: 'linkedin', label: 'LinkedIn', icon: <LinkedinIcon size={12} /> },
                { id: 'youtube', label: 'YouTube', icon: <YoutubeIcon size={12} /> },
                { id: 'instagram', label: 'Instagram', icon: <InstagramIcon size={12} /> },
              ].map(pl => (
                <button
                  key={pl.id}
                  type="button"
                  className={`calendar-platform-chip platform-${pl.id} ${platformFilters[pl.id] ? 'active' : ''}`}
                  onClick={() => setPlatformFilters(f => ({ ...f, [pl.id]: !f[pl.id] }))}
                  title={platformFilters[pl.id] ? `Ocultar publicações do ${pl.label}` : `Mostrar publicações do ${pl.label}`}
                >
                  {pl.icon} {pl.label}
                </button>
              ))}
              <span className="calendar-filter-divider" />
              {[
                { id: 'victor', label: 'Victor', avatarKey: 'Victor' },
                // Chip do Fernando removido (ver ./teamConfig.js); publicações antigas seguem visíveis.
                ...(FERNANDO_ATIVO ? [{ id: 'fernando', label: 'Fernando', avatarKey: 'Fernando' }] : []),
              ].map(person => (
                <button
                  key={person.id}
                  type="button"
                  className={`calendar-platform-chip owner-chip owner-${person.id} ${ownerFilters[person.id] ? 'active' : ''}`}
                  onClick={() => setOwnerFilters(f => ({ ...f, [person.id]: !f[person.id] }))}
                  title={ownerFilters[person.id] ? `Ocultar publicações de ${person.label}` : `Mostrar publicações de ${person.label}`}
                >
                  <img src={USER_AVATARS[person.avatarKey]} alt={person.label} className="chip-avatar" />
                  {person.label}
                </button>
              ))}
            </div>
            <div className="calendar-nav-buttons">
              <button type="button" className="calendar-nav-btn" onClick={prevMonth} title="Mês anterior">
                &lt;
              </button>
              <button type="button" className="calendar-nav-btn" style={{ fontSize: '11.5px', fontWeight: 600 }} onClick={() => setCurrentMonth(new Date())} title="Ir para hoje">
                Hoje
              </button>
              <button type="button" className="calendar-nav-btn" onClick={nextMonth} title="Próximo mês">
                &gt;
              </button>
            </div>
          </div>

          <div className="calendar-grid-header">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(day => (
              <div key={day} className="calendar-weekday-col">{day}</div>
            ))}
          </div>

          <div className="calendar-cells-grid">
            {cells.map((cell, idx) => {
              const dateStr = cell.date.toISOString().split('T')[0];
              const cellPosts = ideas.filter(i => i.scheduledAt === dateStr);
              const cellPublished = publishedByDate.get(localDateKey(cell.date)) || [];

              return (
                <div
                  key={idx}
                  className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${isToday(cell.date) ? 'today' : ''}`}
                  onClick={() => {
                    if (currentUser === 'Felipe') {
                      if (unscheduledIdeas.length > 0) {
                        onScheduleDate(dateStr);
                      } else {
                        addToast("Nenhuma pauta aprovada disponível para agendar. Aprove pautas primeiro!");
                      }
                    } else {
                      addToast("Apenas Felipe (Administrador) pode programar publicações.");
                    }
                  }}
                  title={currentUser === 'Felipe' ? "Clique para programar uma pauta neste dia" : ""}
                >
                  <span className="day-number">{cell.date.getDate()}</span>

                  <div className="calendar-cell-posts-container">
                    {cellPublished.map(post => {
                      const ownerFirstName = (post.owner_name || '').split(' ')[0];
                      const platformLabel = post.platform === 'youtube' ? 'YouTube' : post.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
                      const statLine = post.platform === 'youtube'
                        ? `${post.views || 0} views · ${post.likes || 0} likes`
                        : `${post.likes || 0} reações · ${post.comments || 0} comentários`;
                      return (
                        <div
                          key={post.key}
                          className={`calendar-published-card platform-${post.platform}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (post.url) window.open(post.url, '_blank', 'noopener');
                          }}
                          title={`${platformLabel} · Publicado por ${post.owner_name} · ${statLine}${post.url ? ' | Clique para abrir' : ''}`}
                        >
                          {post.platform === 'youtube' ? <YoutubeIcon size={11} className="platform-icon" /> : post.platform === 'instagram' ? <InstagramIcon size={11} className="platform-icon" /> : <LinkedinIcon size={11} className="platform-icon" />}
                          <span className="title-text">{post.title}</span>
                          <img
                            src={USER_AVATARS[ownerFirstName] || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.owner_name || 'P')}&background=057642&color=fff&bold=true`}
                            alt={post.owner_name}
                            className="assignee-avatar"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.owner_name || 'P')}&background=057642&color=fff&bold=true`;
                            }}
                          />
                        </div>
                      );
                    })}
                    {cellPosts.map(post => (
                      <div
                        key={post.id}
                        className={`calendar-scheduled-card assignee-${post.scheduledAssignee?.toLowerCase() || 'victor'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onScheduleIdea(post);
                        }}
                        title={`Responsável: ${post.scheduledAssignee} | Clique para gerenciar`}
                      >
                        <span className="title-text">{post.title}</span>
                        <img
                          src={USER_AVATARS[post.scheduledAssignee] || USER_AVATARS.Felipe}
                          alt={post.scheduledAssignee}
                          className="assignee-avatar"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.scheduledAssignee)}&background=0a66c2&color=fff&bold=true`;
                          }}
                        />
                        <button
                          type="button"
                          className="calendar-scheduled-remove"
                          onClick={(event) => removeFromCalendar(post, event)}
                          aria-label={`Remover ${post.title} do calendário`}
                          title="Remover do calendário"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar panels */}
        <div className="calendar-sidebar">
          {currentUser === 'Felipe' && (
            <div className="calendar-sidebar-card">
              <h3>Aguardando Agendamento</h3>
              <p className="desc">Pautas aprovadas prontas para programar no LinkedIn.</p>

              <div className="calendar-sidebar-list">
                {unscheduledIdeas.length === 0 ? (
                  <div className="calendar-empty-state">
                    Nenhuma pauta aprovada aguardando agendamento.
                  </div>
                ) : (
                  unscheduledIdeas.map(idea => (
                    <div key={idea.id} className="calendar-sidebar-item">
                      <div className="item-info">
                        <span className="item-title" title={idea.title}>{idea.title}</span>
                        <div className="item-meta">
                          <span style={{ color: 'var(--linkedin-blue)', fontWeight: 600 }}>{idea.category}</span>
                          <span>•</span>
                          <span>Score: {idea.score}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="calendar-sidebar-action-btn"
                        onClick={() => onScheduleIdea(idea)}
                      >
                        Agendar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="calendar-sidebar-card">
            <h3>Publicados em {MONTH_NAMES[month]}</h3>
            <p className="desc">Conteúdo já no ar (LinkedIn, YouTube e Instagram), com engajamento coletado.</p>

            <div className="calendar-sidebar-list">
              {publishedThisMonth.length === 0 ? (
                <div className="calendar-empty-state">
                  Nenhuma publicação coletada neste mês.
                </div>
              ) : (
                publishedThisMonth.map(post => (
                  <div
                    key={post.key}
                    className="calendar-sidebar-item"
                    style={{ cursor: post.url ? 'pointer' : 'default' }}
                    onClick={() => { if (post.url) window.open(post.url, '_blank', 'noopener'); }}
                  >
                    <div className="item-info">
                      <span className="item-title" title={post.title}>{post.title}</span>
                      <div className="item-meta">
                        <strong style={{ color: '#0f172a' }}>{new Date(post.published_at).toLocaleDateString('pt-BR')}</strong>
                        <span>•</span>
                        <span className={`platform-tag platform-${post.platform}`}>
                          {post.platform === 'youtube' ? 'YouTube' : post.platform === 'instagram' ? 'Instagram' : 'LinkedIn'}
                        </span>
                        <span>•</span>
                        <span style={{ color: '#057642', fontWeight: 600 }}>{(post.owner_name || '').split(' ')[0]}</span>
                        <span>•</span>
                        <span>{post.engagement_total || 0} interações</span>
                      </div>
                    </div>
                    {post.url && <ExternalLink size={14} style={{ color: '#64748b', flexShrink: 0 }} />}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="calendar-sidebar-card">
            <h3>Agenda de {MONTH_NAMES[month]}</h3>
            <p className="desc">Lista cronológica das publicações programadas.</p>

            <div className="calendar-sidebar-list">
              {scheduledPosts.length === 0 ? (
                <div className="calendar-empty-state">
                  Nenhuma publicação programada para este mês.
                </div>
              ) : (
                scheduledPosts.map(post => (
                  <div
                    key={post.id}
                    className="calendar-sidebar-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onScheduleIdea(post)}
                  >
                    <div className="item-info">
                      <span className="item-title" title={post.title}>{post.title}</span>
                      <div className="item-meta">
                        <strong style={{ color: '#0f172a' }}>{new Date(post.scheduledAt + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
                        <span>•</span>
                        <span className={`assignee-tag ${post.scheduledAssignee?.toLowerCase() || 'victor'}`}>{post.scheduledAssignee}</span>
                      </div>
                    </div>
                    {currentUser === 'Felipe' && (
                      <div className="calendar-sidebar-scheduled-actions">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); onScheduleIdea(post); }}
                          title="Editar agendamento"
                          aria-label={`Editar agendamento de ${post.title}`}
                        >
                          <Calendar size={14} />
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={(event) => removeFromCalendar(post, event)}
                          title="Remover do calendário"
                          aria-label={`Remover ${post.title} do calendário`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
