import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { 
  ExternalLink, Plus, BarChart3, UserRound, Check, X, Star, RotateCcw, 
  Search, Download, Trash2, AlertCircle, MessageSquare, FileText, 
  CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Archive,
  ThumbsUp, ThumbsDown, Lightbulb, MoreHorizontal
} from 'lucide-react';
import './styles.css';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
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

const USER_AVATARS = {
  Victor: "https://media.licdn.com/dms/image/v2/D4D03AQHwzd_nAdPnxg/profile-displayphoto-crop_800_800/B4DZxqF2moIUAM-/0/1771306452300?e=1781740800&v=beta&t=9c3ObEUV2RPArOaUVbvqypVwGTH4cD4yYr8oKMx9wmY",
  Fernando: "https://media.licdn.com/dms/image/v2/D4D03AQERsnymqjUlqg/profile-displayphoto-shrink_400_400/profile-displayphoto-shrink_400_400/0/1691368512757?e=1781740800&v=beta&t=8DPmkbjdmCK80cNFjIBlK5DHUZaAaL4co3rO-chr9r0",
  Felipe: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"
};

// Safe UUID helper
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

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
      // Try to parse feed/update/urn format: extract number or use a generic title
      title = 'Insight de Negócios Mapeado';
      author = 'Líder de GTM';
    }
    
    // Smart Category Inference
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
    
    // Generate highly realistic LinkedIn metrics
    const mockLikes = Math.floor(Math.random() * 320) + 80; 
    const mockCommentsCount = Math.floor(mockLikes * (Math.random() * 0.1 + 0.04)) + 3;
    const mockRepostsCount = Math.floor(mockLikes * 0.05) + 1;
    
    return {
      author,
      title: title.includes('Mapeado') ? title : `${title} (Mapeado)`,
      category,
      mockLikes,
      mockCommentsCount,
      mockRepostsCount
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
  const [user, setUser] = useState(null);
  const [view, setView] = useState('vote'); // vote | dashboard | new | ideas | data
  const [query, setQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [curatorFilter, setCuratorFilter] = useState('todos');
  const [activeFilter, setActiveFilter] = useState('todas');
  const [isLoading, setIsLoading] = useState(false);

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
      
      // Seed Supabase with starter ideas if it's empty
      if (!dbIdeas || dbIdeas.length === 0) {
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
          setState({ ideas: freshIdeas || [], votes: [] });
          return;
        }
      }

      // Map postgres snake_case to camelCase variables
      const mappedIdeas = (dbIdeas || []).map(item => ({
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
        mockRepostsCount: item.mock_reposts_count
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
          mock_reposts_count: idea.mockRepostsCount || 0
        }]);
      }

      // 2. Delete ideas
      const deletedIdeas = prev.ideas.filter(pi => !next.ideas.some(ni => ni.id === pi.id));
      for (const idea of deletedIdeas) {
        await supabase.from('ideas').delete().eq('id', idea.id);
      }

      // 3. Update ideas (manual_status)
      for (const nextIdea of next.ideas) {
        const prevIdea = prev.ideas.find(pi => pi.id === nextIdea.id);
        if (prevIdea && prevIdea.manualStatus !== nextIdea.manualStatus) {
          await supabase.from('ideas')
            .update({ manual_status: nextIdea.manualStatus })
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
    if (!user || user === 'Felipe') return null;
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
    if (name === 'Felipe') {
      setView('dashboard');
    } else {
      setView('vote');
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
              <span>{user === 'Felipe' ? 'Administrador' : 'Curador de Conteúdo'}</span>
            </div>
          </div>

          <nav className="nav-group">
            {user !== 'Felipe' && (
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
            
            {user === 'Felipe' && (
              <>
                <button 
                  className={view === 'dashboard' ? 'nav-link active' : 'nav-link'} 
                  onClick={() => setView('dashboard')}
                >
                  <BarChart3 size={16} /> Dashboard
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
          {view === 'vote' && user !== 'Felipe' && (
            <VoteView 
              user={user} 
              ideas={enrichedIdeas} 
              votes={state.votes} 
              updateState={updateState} 
              addToast={addToast}
              onBackToSelect={() => setUser(null)}
            />
          )}
          {view === 'dashboard' && user === 'Felipe' && (
            <DashboardView 
              ideas={enrichedIdeas} 
              votes={state.votes} 
              onNavigateToIdeas={(filter) => {
                setCuratorFilter(filter);
                setActiveFilter('todas');
                setView('ideas');
              }}
            />
          )}
          {view === 'new' && user === 'Felipe' && (
            <NewIdeaView updateState={updateState} setView={setView} addToast={addToast} />
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
            />
          )}
          {view === 'data' && user === 'Felipe' && (
            <DataExportView state={state} ideas={enrichedIdeas} addToast={addToast} />
          )}
        </main>
      ) : (
        <IdentityScreen selectUser={selectUser} ideas={state.ideas} votes={state.votes} />
      )}

      {/* Mobile Bottom Tab Bar */}
      {user && (
        <div className="mobile-bottom-nav">
          {user !== 'Felipe' ? (
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
                onClick={() => setView('dashboard')}
              >
                <BarChart3 size={18} />
                <span>Dashboard</span>
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

  // Motion values
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  
  const cardRotation = useTransform(dragX, [-150, 150], [-8, 8]);
  const cardScale = useTransform(dragX, [-150, 0, 150], [0.97, 1, 0.97]);

  const likeOpacity = useTransform(dragX, [0, 120], [0, 1]);
  const dislikeOpacity = useTransform(dragX, [0, -120], [0, 1]);
  const maybeOpacity = useTransform(dragY, [0, -120], [0, 1]);

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
    dragY.set(0);
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
                  style={{ x: dragX, y: dragY, rotate: cardRotation, scale: cardScale }}
                  drag
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  dragElastic={0.6}
                  onDragEnd={(event, info) => {
                    if (info.offset.x > 140) {
                      handleVoteTrigger('like');
                    } else if (info.offset.x < -140) {
                      handleVoteTrigger('dislike');
                    } else if (info.offset.y < -120) {
                      handleVoteTrigger('maybe');
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
                  <motion.div className="swipe-overlay maybe" style={{ opacity: maybeOpacity }}>
                    Revisar
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
              <p className="swipe-hint" style={{ marginTop: '10px' }}>Arraste para a Direita (Gostei), Esquerda (Não Gostei) ou Cima (Talvez) para classificar rapidamente.</p>
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
              {idea.sourceAuthor || 'Autor LinkedIn'} 
              <span className="li-premium-badge">in</span>
              <span className="li-post-connection-degree">• 2nd</span>
            </span>
            <span className="li-post-author-headline">
              {idea.authorHeadline || 'Profissional no LinkedIn'}
            </span>
            <span className="li-post-time-globe">
              3d · 🌐
            </span>
          </div>
        </div>
        <div className="li-post-header-actions">
          <button type="button" className="li-post-connect-btn">
            <Plus size={14} style={{ marginRight: '2px' }} /> Connect
          </button>
          <div className="li-post-more-btn">
            <MoreHorizontal size={16} />
          </div>
        </div>
      </div>

      {/* Post Text Body with Exact white-space: pre-wrap preservation - fully expanded by default */}
      <div className="li-post-text-body">
        {idea.summary || ''}
      </div>

      {/* Direct LinkedIn Outbound Link CTA Button */}
      {idea.linkedinUrl && (
        <div style={{ padding: '0 20px 16px 20px', display: 'flex' }}>
          <a 
            href={idea.linkedinUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="li-direct-post-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#ffffff',
              background: '#0a66c2',
              padding: '6px 16px',
              borderRadius: '100px',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(10, 102, 194, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseOver={(e) => e.currentTarget.style.background = '#004182'}
            onMouseOut={(e) => e.currentTarget.style.background = '#0a66c2'}
          >
            <ExternalLink size={12} /> Acessar Post no LinkedIn ↗
          </a>
        </div>
      )}

      {/* Edge to Edge Image inside card */}
      {idea.imageUrl && (
        <div className="li-post-image-wrap">
          <img className="li-post-image" src={idea.imageUrl} alt="Imagem de referência do LinkedIn" />
        </div>
      )}

      {/* Mock Social Counters Bar matching LinkedIn exact Dark Mode format */}
      <div className="li-social-counters-row">
        <div className="li-social-reactions">
          <div className="li-social-icons-bubble">
            <span className="li-reaction-icon-mock like">👍</span>
            <span className="li-reaction-icon-mock celebrate">👏</span>
            <span className="li-reaction-icon-mock love">❤️</span>
          </div>
          <span>
            Flavia Sant Ana Dias e {(idea.mockLikes || 105) + idea.score} outros
          </span>
        </div>
        <div>
          <span>{(idea.mockCommentsCount || 6) + comments.length} comments • {idea.mockRepostsCount || 7} reposts</span>
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
              addToast("Link do LinkedIn indisponível para cópia.", "error");
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

// ==================== ADMIN: DASHBOARD VIEW ====================
function DashboardView({ ideas, votes, onNavigateToIdeas }) {
  const [activeTab, setActiveTab] = useState('curation');

  const stats = useMemo(() => {
    return {
      total: ideas.length,
      pendentes: ideas.filter(i => i.computedStatus === 'pendente' || i.computedStatus === 'aguardando outro voto').length,
      aprovados: ideas.filter(i => i.computedStatus === 'aprovado').length,
      divergentes: ideas.filter(i => i.computedStatus === 'divergente').length,
      rejeitadas: ideas.filter(i => i.computedStatus === 'rejeitado').length,
      emProducao: ideas.filter(i => i.computedStatus === 'em_producao').length,
      publicadas: ideas.filter(i => i.computedStatus === 'publicada').length
    };
  }, [ideas]);

  const approvedBoth = useMemo(() => ideas.filter(i => i.computedStatus === 'aprovado'), [ideas]);
  const divergentIdeas = useMemo(() => ideas.filter(i => i.computedStatus === 'divergente'), [ideas]);
  const evaluatingIdeas = useMemo(() => ideas.filter(i => i.computedStatus === 'avaliar'), [ideas]);

  const pendingVictor = useMemo(() => {
    return ideas.filter(i => i.computedStatus !== 'arquivada' && i.computedStatus !== 'publicada' && !votes.some(v => v.ideaId === i.id && v.voterName === 'Victor')).length;
  }, [ideas, votes]);

  const pendingFernando = useMemo(() => {
    return ideas.filter(i => i.computedStatus !== 'arquivada' && i.computedStatus !== 'publicada' && !votes.some(v => v.ideaId === i.id && v.voterName === 'Fernando')).length;
  }, [ideas, votes]);

  const categoryRanking = useMemo(() => {
    const counts = {};
    ideas.forEach(i => {
      if (!i.category) return;
      if (i.computedStatus === 'aprovado') {
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

  return (
    <section className="li-dashboard-container">
      {/* LinkedIn Company Admin Header Profile Card */}
      <header className="li-company-card shadow-li">
        <div className="li-company-banner"></div>
        <div className="li-company-profile-row">
          <div className="li-company-avatar">P</div>
          <div className="li-company-info">
            <div className="li-company-title-row">
              <h2>Playbook Lab</h2>
              <span className="li-verified-badge" title="Página Corporativa Verificada">✓</span>
            </div>
            <p className="li-company-tagline">Content Radar • Hub de Inteligência Editorial</p>
            <p className="li-company-details">Serviços de tecnologia empresarial • São Paulo, SP • 43 funcionários</p>
          </div>
          <div className="li-company-actions">
            <button 
              type="button" 
              className="li-btn-primary" 
              onClick={() => onNavigateToIdeas && onNavigateToIdeas('todos')}
            >
              Visualizar Acervo
            </button>
          </div>
        </div>
        
        {/* Flat horizontal navigation tabs */}
        <div className="li-admin-tabs">
          <button 
            type="button"
            className={activeTab === 'curation' ? 'li-admin-tab active' : 'li-admin-tab'}
            onClick={() => setActiveTab('curation')}
          >
            Curation Hub
          </button>
          <button 
            type="button"
            className={activeTab === 'analytics' ? 'li-admin-tab active' : 'li-admin-tab'}
            onClick={() => setActiveTab('analytics')}
          >
            Métricas & Analytics
          </button>
          <button 
            type="button"
            className={activeTab === 'activity' ? 'li-admin-tab active' : 'li-admin-tab'}
            onClick={() => setActiveTab('activity')}
          >
            Atividade Recente
          </button>
        </div>
      </header>

      {/* 3-Column LinkedIn Feed Style Layout */}
      <div className="li-three-columns">
        
        {/* Left Column: Metrics and Stats widget */}
        <aside className="li-column-left">
          <div className="li-sidebar-widget shadow-li">
            <h3>Painel do Criador</h3>
            <p className="desc">Desempenho editorial das referências</p>
            <hr className="divider" />
            
            <div className="li-metric-row">
              <span>Mapeadas</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="li-metric-row">
              <span>Aprovadas</span>
              <strong className="text-green">{stats.aprovados}</strong>
            </div>
            <div className="li-metric-row">
              <span>Divergentes</span>
              <strong className="text-amber">{stats.divergentes}</strong>
            </div>
            <div className="li-metric-row">
              <span>Rejeitadas</span>
              <strong className="text-red">{stats.rejeitadas}</strong>
            </div>
            <div className="li-metric-row">
              <span>Em Produção</span>
              <strong>{stats.emProducao}</strong>
            </div>
          </div>
        </aside>

        {/* Center Column: Major feed Curation elements */}
        <main className="li-column-center">
          {activeTab === 'curation' && (
            <>
              {/* Section: Aprovadas por Ambos */}
              <div className="li-feed-card shadow-li">
                <div className="card-header">
                  <h3>Aprovadas por Ambos</h3>
                  <span className="badge-pill success">Prontos para Sheets</span>
                </div>
                {approvedBoth.length === 0 ? (
                  <p className="li-empty-text">Nenhuma pauta aprovada por ambos ainda.</p>
                ) : (
                  <div className="li-feed-list">
                    {approvedBoth.map(item => (
                      <div key={item.id} className="li-feed-item">
                        <div className="item-meta">
                          <h4>{item.title}</h4>
                          <span>{item.category} • {item.contentType}</span>
                        </div>
                        <button 
                          type="button"
                          className="li-feed-action-btn"
                          onClick={() => onNavigateToIdeas && onNavigateToIdeas('todos')}
                        >
                          Ver Detalhes
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Divergentes */}
              <div className="li-feed-card shadow-li">
                <div className="card-header">
                  <h3>Divergência de Votos</h3>
                  <span className="badge-pill warning">Requer Conciliação</span>
                </div>
                {divergentIdeas.length === 0 ? (
                  <p className="li-empty-text">Nenhuma divergência identificada no radar.</p>
                ) : (
                  <div className="li-feed-list">
                    {divergentIdeas.map(item => (
                      <div key={item.id} className="li-feed-item">
                        <div className="item-meta">
                          <h4>{item.title}</h4>
                          <span>{item.category} • {item.contentType}</span>
                        </div>
                        <div className="item-voters-row">
                          <span className="voter-badge green">Victor: Gostou</span>
                          <span className="voter-badge red">Fernando: Rejeitou</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Sob Avaliação */}
              <div className="li-feed-card shadow-li">
                <div className="card-header">
                  <h3>Sob Avaliação Editorial</h3>
                  <span className="badge-pill info">Score &lt; 2</span>
                </div>
                {evaluatingIdeas.length === 0 ? (
                  <p className="li-empty-text">Nenhuma pauta sob avaliação aguardando.</p>
                ) : (
                  <div className="li-feed-list">
                    {evaluatingIdeas.map(item => (
                      <div key={item.id} className="li-feed-item">
                        <div className="item-meta">
                          <h4>{item.title}</h4>
                          <span>{item.category} • {item.contentType}</span>
                        </div>
                        <span className="score-tag">Score {item.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'analytics' && (
            <div className="li-feed-card shadow-li">
              <div className="card-header">
                <h3>Desempenho por Categoria</h3>
              </div>
              {categoryRanking.length === 0 ? (
                <p className="li-empty-text">Sem dados estatísticos de categorias no momento.</p>
              ) : (
                <div className="li-charts-list">
                  {categoryRanking.map(item => (
                    <div key={item.name} className="li-chart-item">
                      <div className="li-chart-label">
                        <span>{item.name}</span>
                        <strong>{item.score} pontos</strong>
                      </div>
                      <div className="li-chart-bar-outer">
                        <div className="li-chart-bar-inner" style={{ width: `${item.percentage}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="li-feed-card shadow-li">
              <div className="card-header">
                <h3>Atividade Recente de Curadoria</h3>
              </div>
              {votes.length === 0 ? (
                <p className="li-empty-text">Nenhuma votação recente registrada.</p>
              ) : (
                <div className="li-activity-feed">
                  {votes.slice(0, 10).map(v => {
                    const ideaTitle = ideas.find(i => i.id === v.ideaId)?.title || 'Pauta Mapeada';
                    return (
                      <div key={v.id} className="li-activity-item">
                        <div className="li-activity-avatar" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img 
                            src={USER_AVATARS[v.voterName] || USER_AVATARS.Felipe} 
                            alt={v.voterName} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} 
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(v.voterName)}&background=0a66c2&color=fff&bold=true`;
                            }}
                          />
                        </div>
                        <div className="li-activity-details">
                          <p>
                            <strong>{v.voterName}</strong> votou <strong>{v.vote === 'like' ? 'Gostei' : v.vote === 'maybe' ? 'Talvez' : 'Não Gostei'}</strong> em:
                          </p>
                          <span className="li-activity-pauta-title">"{ideaTitle}"</span>
                          {v.comment && <p className="li-activity-comment">"{v.comment}"</p>}
                          <span className="li-activity-time">{new Date(v.createdAt).toLocaleString('pt-BR')}</span>
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
          <div className="li-sidebar-widget shadow-li">
            <h3>Pendências por Votante</h3>
            <p className="desc">Ações pendentes na caixa de entrada</p>
            <hr className="divider" />
             
            <div className="li-pending-voters-list">
              <button 
                type="button"
                className="li-pending-voter-card victor"
                onClick={() => onNavigateToIdeas && onNavigateToIdeas('victor_pending')}
              >
                <div className="voter-info">
                  <div className="avatar" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img 
                      src={USER_AVATARS.Victor} 
                      alt="Victor" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=Victor&background=057642&color=fff&bold=true`;
                      }}
                    />
                  </div>
                  <div>
                    <h4>Victor</h4>
                    <p>Curador de Conteúdo</p>
                  </div>
                </div>
                <strong className="badge">{pendingVictor}</strong>
              </button>
 
              <button 
                type="button"
                className="li-pending-voter-card fernando"
                onClick={() => onNavigateToIdeas && onNavigateToIdeas('fernando_pending')}
              >
                <div className="voter-info">
                  <div className="avatar" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img 
                      src={USER_AVATARS.Fernando} 
                      alt="Fernando" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=Fernando&background=b26200&color=fff&bold=true`;
                      }}
                    />
                  </div>
                  <div>
                    <h4>Fernando</h4>
                    <p>Curador de Conteúdo</p>
                  </div>
                </div>
                <strong className="badge">{pendingFernando}</strong>
              </button>
            </div>
          </div>
        </aside>

      </div>
    </section>
  );
}

// ==================== ADMIN: NEW IDEA FORM ====================
function NewIdeaView({ updateState, setView, addToast }) {
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

  async function handleAutofill() {
    if (!form.linkedinUrl) {
      addToast('Insira uma URL válida primeiro!', 'error');
      return;
    }

    if (!form.linkedinUrl.toLowerCase().includes('linkedin.com')) {
      addToast('A URL precisa ser do LinkedIn (linkedin.com).', 'error');
      return;
    }
    
    setIsImporting(true);
    addToast('Buscando dados reais do post no LinkedIn...', 'success');

    try {
      const response = await fetch('https://xcihctupmfawtawbzwvm.supabase.co/functions/v1/scrape-linkedin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: form.linkedinUrl })
      });

      if (!response.ok) {
        throw new Error('Falha na resposta do servidor.');
      }

      const data = await response.json();
      if (!data || !data.success) {
        throw new Error(data?.error || 'Não foi possível extrair os dados do post.');
      }

      // Build a clean title from the description or parsed title
      let cleanTitle = '';
      if (data.description) {
        const firstLine = data.description.split('\n').find(l => l.trim().length > 5) || '';
        cleanTitle = firstLine.slice(0, 80).trim();
        if (firstLine.length > 80) cleanTitle += '...';
      }
      if (!cleanTitle) {
        cleanTitle = data.title ? data.title.split('|')[0].trim().slice(0, 80) : '';
      }

      // Smart category inference
      const lowerContent = ((data.description || '') + ' ' + (cleanTitle || '')).toLowerCase();
      let category = 'IA'; // default or smart match
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
      } else {
        category = 'LinkedIn';
      }

      setForm(prev => ({
        ...prev,
        title: cleanTitle || prev.title,
        sourceAuthor: data.author || prev.sourceAuthor,
        authorHeadline: data.authorHeadline || prev.authorHeadline,
        authorAvatar: data.authorAvatar || prev.authorAvatar,
        summary: data.description || prev.summary,
        imageUrl: data.image || prev.imageUrl,
        category: category,
        mockLikes: data.mockLikes || prev.mockLikes,
        mockCommentsCount: data.mockCommentsCount || prev.mockCommentsCount,
        mockRepostsCount: data.mockRepostsCount || prev.mockRepostsCount
      }));

      addToast('✅ Post real importado do LinkedIn com sucesso!', 'success');

    } catch (err) {
      console.error('LinkedIn scrape failed:', err);
      
      // Fallback: use the URL parser for basic metadata
      const parsed = parseLinkedInUrl(form.linkedinUrl);
      if (parsed) {
        setForm(prev => ({
          ...prev,
          title: prev.title || parsed.title,
          sourceAuthor: prev.sourceAuthor || parsed.author,
          category: parsed.category,
          mockLikes: parsed.mockLikes,
          mockCommentsCount: parsed.mockCommentsCount,
          mockRepostsCount: parsed.mockRepostsCount
        }));
        addToast('⚠️ Não foi possível ler o post completo. Dados básicos da URL foram extraídos. Cole o texto do post manualmente.', 'error');
      } else {
        addToast('❌ Falha ao importar. Verifique se o link é público e tente novamente.', 'error');
      }
    } finally {
      setIsImporting(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;

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

    setView('ideas');
  }

  return (
    <section>
      <div className="admin-view-header">
        <p className="eyebrow">Radar Editor</p>
        <h2>Cadastrar Referência</h2>
        <p>Cole o link do LinkedIn e importe automaticamente o autor, texto e imagem do post real.</p>
      </div>

      <form className="idea-form" onSubmit={submit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--linkedin-dark-gray)' }}>Link Original do Post (LinkedIn) *</span>
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
                {isImporting ? '⏳ Buscando post real...' : '🔗 Importar do LinkedIn'}
              </button>
            )}
          </div>
          <input 
            value={form.linkedinUrl} 
            onChange={e => update('linkedinUrl', e.target.value)} 
            placeholder="https://www.linkedin.com/posts/nome-autor_slug-do-post..." 
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
          Texto Completo do Post (Copie exatamente igual do LinkedIn) *
          <textarea 
            value={form.summary} 
            onChange={e => update('summary', e.target.value)} 
            placeholder="Cole aqui o texto completo do post do LinkedIn preservando emojis, quebras de linha e caracteres especiais para que Victor e Fernando leiam o post inteiro de forma idêntica..." 
            style={{ minHeight: '160px' }}
            required
          />
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
  currentUser 
}) {

  const [viewMode, setViewMode] = useState(currentUser === 'Felipe' ? 'table' : 'feed');
  const [commentingIdea, setCommentingIdea] = useState(null);
  const [customComment, setCustomComment] = useState('');
  const [selectedQuickComment, setSelectedQuickComment] = useState('');

  function handleDirectVote(ideaId, voteType) {
    if (currentUser === 'Felipe') {
      addToast('Apenas curadores (Victor/Fernando) podem votar!', 'error');
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
    if (currentUser === 'Felipe') {
      addToast('Apenas curadores (Victor/Fernando) podem comentar!', 'error');
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
          <p>{currentUser === 'Felipe' ? 'Revise notas de Victor/Fernando e alterne fluxos operacionais manualmente.' : 'Visualize e filtre as pautas do radar com base nos seus votos.'}</p>
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
              <button 
                type="button"
                className={curatorType === 'fernando' ? 'li-tab active' : 'li-tab'}
                onClick={() => handleCuratorTypeChange('fernando')}
              >
                Fernando
              </button>
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
                <div key={idea.id} className="li-feed-item-wrapper" style={{ display: 'flex', flexDirection: 'column', width: '100%', background: '#ffffff', borderRadius: '8px', border: '1px solid #e0e0e0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  
                  {/* Curation Info Ribbon Above Card */}
                  <div className="li-feed-curator-status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f3f6f8', padding: '12px 20px', borderBottom: '1px solid #e0e0e0', fontSize: '13px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`status-pill ${idea.computedStatus.replace(' outro voto', '')}`}>
                        {idea.computedStatus === 'em_producao' ? 'Em Produção' : 
                         idea.computedStatus === 'publicada' ? 'Publicada' : 
                         idea.computedStatus === 'arquivada' ? 'Arquivada' : idea.computedStatus}
                      </span>
                      {currentUser === 'Felipe' && (
                        <select 
                          className="status-select-td" 
                          value={idea.manualStatus || 'auto'}
                          onChange={e => handleUpdateManualStatus(idea.id, e.target.value)}
                          style={{ fontSize: '11px', padding: '2px 6px', border: '1px solid #dcdcdc', borderRadius: '4px' }}
                        >
                          <option value="auto">Automático (Votos)</option>
                          <option value="em_producao">Em Produção</option>
                          <option value="publicada">Publicada</option>
                          <option value="arquivada">Arquivada</option>
                        </select>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <img src={USER_AVATARS.Fernando} alt="Fernando" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} />
                      Fernando: <strong style={{ color: idea.fernandoVote === 'like' ? 'var(--vote-green)' : idea.fernandoVote === 'maybe' ? 'var(--vote-amber)' : idea.fernandoVote === 'dislike' ? 'var(--vote-red)' : 'var(--linkedin-mid-gray)' }}>{voteLabel(idea.fernandoVote)}</strong>
                    </span>
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
                <th>Tema / Título</th>
                <th>Categoria / Formato</th>
                <th>Victor</th>
                <th>Fernando</th>
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
                      <td className="idea-table-title">
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
                        <span style={{ fontWeight: 600, color: 'var(--linkedin-dark-gray)', display: 'block' }}>{idea.category}</span>
                        <span style={{ fontSize: '12px', color: 'var(--linkedin-mid-gray)', display: 'block' }}>{idea.contentType}</span>
                      </td>
                      <td>
                        <span className={`vote-badge-pill ${idea.victorVote || 'empty'}`}>
                          {idea.victorVote === 'like' ? '👍 Gostei' : idea.victorVote === 'maybe' ? '💡 Talvez' : idea.victorVote === 'dislike' ? '👎 Não gostei' : '⏳ Pendente'}
                        </span>
                      </td>
                      <td>
                        <span className={`vote-badge-pill ${idea.fernandoVote || 'empty'}`}>
                          {idea.fernandoVote === 'like' ? '👍 Gostei' : idea.fernandoVote === 'maybe' ? '💡 Talvez' : idea.fernandoVote === 'dislike' ? '👎 Não gostei' : '⏳ Pendente'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span className={`score-meter-pill ${scoreClass}`}>{idea.score}</span>
                          <span style={{ fontSize: '11px', color: 'var(--linkedin-mid-gray)', fontWeight: 600 }}>{idea.suggestedDecision}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className={`status-pill ${idea.computedStatus.replace(' outro voto', '')}`}>
                            {idea.computedStatus === 'em_producao' ? 'Em Produção' : 
                             idea.computedStatus === 'publicada' ? 'Publicada' : 
                             idea.computedStatus === 'arquivada' ? 'Arquivada' : idea.computedStatus}
                          </span>
                          {currentUser === 'Felipe' && (
                            <select 
                              className="status-select-td" 
                              value={idea.manualStatus || 'auto'}
                              onChange={e => handleUpdateManualStatus(idea.id, e.target.value)}
                            >
                              <option value="auto">Automático (Votos)</option>
                              <option value="em_producao">Em Produção</option>
                              <option value="publicada">Publicada</option>
                              <option value="arquivada">Arquivada</option>
                            </select>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <a href={idea.linkedinUrl} target="_blank" rel="noreferrer" className="action-icon-btn" title="Abrir no LinkedIn">
                            <ExternalLink size={12} />
                          </a>
                          {currentUser === 'Felipe' && (
                            <>
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
    const header = ['id_ideia', 'titulo', 'categoria', 'tipo_conteudo', 'voto_victor', 'voto_fernando', 'score', 'status', 'decisao_sugerida'];
    const rows = ideas.map(i => [
      i.id,
      i.title,
      i.category,
      i.contentType,
      voteLabel(i.victorVote),
      voteLabel(i.fernandoVote),
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

createRoot(document.getElementById('root')).render(<App />);
