import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3,
  ExternalLink, FilePenLine, Image, Search, Sparkles, ThumbsUp, UserRound,
} from 'lucide-react';
import './ideaProduction.css';
import victorPhoto from '../assets/victor.png';

const dateLabel = (value) => {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
};

const isLiked = (idea) => idea.victorVote === 'like' || idea.fernandoVote === 'like';
const hasMaterial = (idea) => Boolean(idea.finalPostText || idea.finalImageUrl);
const inProduction = (idea) => idea.computedStatus === 'em_producao' || hasMaterial(idea) || idea.scheduledAt;

export const stageOf = (idea) => {
  if (idea.scheduledAt) return 'scheduled';
  if (idea.manualStatus === 'fila') return 'queue';
  // O status operacional explícito tem prioridade sobre a existência de rascunho.
  // Salvar uma copy durante a produção não significa que Victor já deve revisá-la.
  if (idea.computedStatus === 'em_producao' || idea.manualStatus === 'em_producao') return 'production';
  if (hasMaterial(idea)) return 'review';
  if (inProduction(idea)) return 'production';
  return 'queue';
};

const stageMeta = {
  queue: { label: 'Fila priorizada', short: 'Fila', icon: Sparkles },
  production: { label: 'Em desenvolvimento', short: 'Produzindo', icon: FilePenLine },
  review: { label: 'Pronto para revisão', short: 'Revisão', icon: CheckCircle2 },
  scheduled: { label: 'Programados', short: 'Agenda', icon: CalendarDays },
};

function priorityOf(idea) {
  const consensus = idea.victorVote === 'like' && idea.fernandoVote === 'like' ? 40 : 20;
  const priority = idea.initialPriority === 'Alta' ? 20 : idea.initialPriority === 'Média' ? 10 : 0;
  const detail = idea.playbookAngle ? 8 : 0;
  return consensus + priority + detail;
}

function voteText(idea) {
  if (idea.victorVote === 'like' && idea.fernandoVote === 'like') return 'Victor e Fernando gostaram';
  if (idea.victorVote === 'like') return 'Victor gostou';
  return 'Fernando gostou';
}

function WorkListItem({ idea, selected, onSelect }) {
  const stage = stageOf(idea);
  const StageIcon = stageMeta[stage].icon;
  return (
    <button type="button" className={`ipw-work-item ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <span className="ipw-work-thumb">
        {idea.imageUrl ? <img src={idea.imageUrl} alt="" /> : <span>{(idea.category || 'P').slice(0, 1)}</span>}
      </span>
      <span className="ipw-work-copy">
        <span className="ipw-work-meta"><span>{idea.category || 'Conteúdo'}</span><span className={`ipw-stage-text ${stage}`}><StageIcon size={11} /> {stageMeta[stage].short}</span></span>
        <strong>{idea.title}</strong>
        <small>{stage === 'queue' ? voteText(idea) : idea.sourceAuthor || 'Referência salva'}</small>
      </span>
      <ChevronRight size={16} className="ipw-chevron" />
    </button>
  );
}

function VoteProof({ idea }) {
  return (
    <div className="ipw-vote-proof">
      <span className={idea.victorVote === 'like' ? 'liked' : ''}><UserRound size={13} /> Victor {idea.victorVote === 'like' && <Check size={11} />}</span>
      <span className={idea.fernandoVote === 'like' ? 'liked' : ''}><UserRound size={13} /> Fernando {idea.fernandoVote === 'like' && <Check size={11} />}</span>
    </div>
  );
}

function ReviewDesk({ idea, currentUser, onOpenStudio }) {
  const copy = idea.finalPostText || 'A copy ainda não foi concluída.';
  const creative = idea.finalImageUrl || idea.imageUrl;
  return (
    <div className="ipw-review-desk">
      <section className="ipw-review-post">
        <header><span>O que será publicado</span><strong>Preview do post do Victor</strong><small>Leia o post como ele aparecerá no LinkedIn.</small></header>
        <button type="button" className="ipw-linkedin-review" onClick={() => onOpenStudio(idea)}>
          <div className="ipw-linkedin-head"><img src={victorPhoto} alt="Victor Baggio" /><span><strong>Victor Baggio</strong><small>Founder da Playbook Lab · Agora</small></span><b>•••</b></div>
          <p>{copy}</p>
          {creative && <img className="ipw-review-creative" src={creative} alt="Criativo selecionado para o post" />}
          <footer><span>♡ Reagir</span><span>◯ Comentar</span><span>↗ Compartilhar</span></footer>
        </button>
      </section>

      <aside className="ipw-review-decision">
        <span>Decisão do Victor</span>
        <h3>Revise, ajuste ou aprove</h3>
        <p>Este é o pacote final. Clique em qualquer item para abrir o estúdio exatamente no material que precisa analisar.</p>
        <button type="button" className="ipw-review-item" onClick={() => onOpenStudio(idea)}><CheckCircle2 size={17} /><span><strong>Copy final</strong><small>{copy.length} caracteres prontos para leitura</small></span><ArrowRight size={15} /></button>
        <button type="button" className="ipw-review-item" onClick={() => onOpenStudio(idea)}><CheckCircle2 size={17} /><span><strong>Criativo selecionado</strong><small>{creative ? 'Imagem incluída no post' : 'Post somente em texto'}</small></span><ArrowRight size={15} /></button>
        <button type="button" className="ipw-review-open" onClick={() => onOpenStudio(idea)}><FilePenLine size={16} /> Abrir revisão completa</button>
        {idea.linkedinUrl && <a className="ipw-review-reference" href={idea.linkedinUrl} target="_blank" rel="noreferrer">Ver referência original <ExternalLink size={13} /></a>}
        <small className="ipw-review-hint">{currentUser === 'Victor' ? 'Escolha a combinação no estúdio para aprovar ou pedir ajuste.' : 'Victor pode abrir este pacote e registrar a decisão.'}</small>
      </aside>
    </div>
  );
}

function EditorialInspector({ idea, currentUser, onBring, onReturnToQueue, onOpenStudio, onSchedule, onSendToReview }) {
  if (!idea) return null;
  const stage = stageOf(idea);
  const StageIcon = stageMeta[stage].icon;
  const material = hasMaterial(idea);

  return (
    <AnimatePresence mode="wait">
      <motion.article
        key={idea.id}
        className="ipw-inspector"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: .18 }}
      >
        <header className="ipw-inspector-header">
          <div className="ipw-inspector-title">
            <span className={`ipw-stage-badge ${stage}`}><StageIcon size={13} /> {stageMeta[stage].label}</span>
            <h2>{idea.title}</h2>
            <div className="ipw-source-line">
              <span>Referência de <strong>{idea.sourceAuthor || 'autor não identificado'}</strong></span>
              {idea.linkedinUrl && <a href={idea.linkedinUrl} target="_blank" rel="noreferrer">Ver original <ExternalLink size={12} /></a>}
            </div>
          </div>
          <VoteProof idea={idea} />
        </header>

        {stage === 'review' ? <ReviewDesk idea={idea} currentUser={currentUser} onOpenStudio={onOpenStudio} /> : <div className="ipw-editorial-grid">
          <section className="ipw-original-pane">
            <div className="ipw-pane-label"><span>01</span><div><strong>O que chamou atenção</strong><small>Referência original</small></div></div>
            {idea.imageUrl && <div className="ipw-original-image"><img src={idea.imageUrl} alt="Imagem do post original" /></div>}
            <div className="ipw-original-copy">{idea.summary || 'O conteúdo original ainda não tem resumo. Abra a referência para analisar a estrutura e a mensagem.'}</div>
            {idea.linkedinUrl && <a className="ipw-inline-link" href={idea.linkedinUrl} target="_blank" rel="noreferrer">Ler o post completo <ArrowRight size={13} /></a>}
          </section>

          <section className="ipw-playbook-pane">
            <div className="ipw-pane-label"><span>02</span><div><strong>Como vira conteúdo Playbook</strong><small>Direção e material produzido</small></div></div>
            <div className="ipw-angle-block">
              <span>Ângulo editorial</span>
              <p>{idea.playbookAngle || 'O ângulo ainda não foi definido. Use o estúdio para transformar a referência em uma opinião própria, com exemplo e CTA.'}</p>
            </div>
            {material ? (
              <div className="ipw-draft-preview">
                <div><CheckCircle2 size={15} /><span>Material disponível para {currentUser === 'Victor' ? 'sua revisão' : 'revisão do Victor'}</span></div>
                <p>{idea.finalPostText || 'A imagem final foi preparada. A copy ainda precisa ser concluída.'}</p>
                {idea.finalImageUrl && <img src={idea.finalImageUrl} alt="Material final" />}
              </div>
            ) : (
              <button type="button" className="ipw-empty-draft" onClick={() => stage === 'queue' ? onBring(idea, true) : onOpenStudio(idea)}>
                <Sparkles size={20} />
                <strong>{stage === 'production' ? 'Continuar desenvolvimento' : 'Começar a adaptação'}</strong>
                <span>{stage === 'production' ? 'Organize o material, prepare os criativos e deixe a copy para o fechamento.' : 'Abra o estúdio com a referência ao lado e monte o pacote Playbook.'}</span>
                {stage === 'production' && <div className="ipw-production-steps"><span><b>1</b> Material</span><span><b>2</b> Criativos</span><span><b>3</b> Copy final</span></div>}
              </button>
            )}
          </section>
        </div>}

        <footer className="ipw-inspector-actions">
          <div>
            <span>Próxima ação</span>
            <strong>{stage === 'queue' ? 'Transformar a referência em pauta própria' : stage === 'production' ? 'Fechar material e criativos; gerar a copy por último' : stage === 'review' ? 'Revisar e escolher uma data' : `Publicação em ${dateLabel(idea.scheduledAt)}`}</strong>
          </div>
          <div className="ipw-action-buttons">
            {stage === 'queue' ? (
              <button type="button" className="ipw-primary-action" onClick={() => onBring(idea, true)}><Sparkles size={15} /> Desenvolver esta ideia</button>
            ) : (
              <button type="button" className="ipw-primary-action" onClick={() => onOpenStudio(idea)}><FilePenLine size={15} /> {material ? 'Abrir material' : 'Continuar adaptação'}</button>
            )}
            {stage !== 'queue' && stage !== 'scheduled' && <button type="button" className="ipw-secondary-action" onClick={() => onSchedule(idea)}><CalendarDays size={15} /> Programar</button>}
            {stage === 'production' && material && <button type="button" className="ipw-review-action" onClick={() => onSendToReview(idea)}><CheckCircle2 size={15} /> Enviar para revisão</button>}
            {stage !== 'queue' && stage !== 'scheduled' && <button type="button" className="ipw-return-action" onClick={() => onReturnToQueue(idea)}><ArrowRight size={15} /> Voltar para fila de ideias</button>}
          </div>
        </footer>
      </motion.article>
    </AnimatePresence>
  );
}

export default function IdeaProductionWorkspace({ ideas, currentUser, updateState, onOpenStudio, onSchedule }) {
  const [activeStage, setActiveStage] = useState('queue');
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');

  const likedIdeas = useMemo(() => ideas.filter(isLiked).sort((a, b) => priorityOf(b) - priorityOf(a)), [ideas]);
  const grouped = useMemo(() => ({
    queue: likedIdeas.filter((idea) => stageOf(idea) === 'queue'),
    production: likedIdeas.filter((idea) => stageOf(idea) === 'production'),
    review: likedIdeas.filter((idea) => stageOf(idea) === 'review'),
    scheduled: likedIdeas.filter((idea) => stageOf(idea) === 'scheduled'),
  }), [likedIdeas]);

  const visibleIdeas = useMemo(() => grouped[activeStage].filter((idea) => {
    const haystack = `${idea.title} ${idea.sourceAuthor} ${idea.category}`.toLowerCase();
    return haystack.includes(query.toLowerCase().trim());
  }), [activeStage, grouped, query]);

  const selectedIdea = visibleIdeas.find((idea) => idea.id === selectedId) || visibleIdeas[0] || null;

  useEffect(() => {
    if (selectedIdea && selectedIdea.id !== selectedId) setSelectedId(selectedIdea.id);
  }, [selectedIdea, selectedId]);

  const bringToProduction = (idea, openAfter = false) => {
    updateState((previous) => ({
      ...previous,
      ideas: previous.ideas.map((item) => item.id === idea.id ? { ...item, manualStatus: 'em_producao' } : item),
    }));
    if (openAfter) onOpenStudio({ ...idea, manualStatus: 'em_producao', computedStatus: 'em_producao' });
  };

  const returnToQueue = (idea) => {
    updateState((previous) => ({
      ...previous,
      ideas: previous.ideas.map((item) => item.id === idea.id ? { ...item, manualStatus: 'fila' } : item),
    }));
    setActiveStage('queue');
    setSelectedId(idea.id);
  };

  const sendToReview = (idea) => {
    updateState((previous) => ({
      ...previous,
      ideas: previous.ideas.map((item) => item.id === idea.id ? { ...item, manualStatus: 'aprovado' } : item),
    }));
    setActiveStage('review');
    setSelectedId(idea.id);
  };

  const nextMessage = grouped.review.length
    ? `${grouped.review.length} ${grouped.review.length === 1 ? 'material espera' : 'materiais esperam'} a revisão do Victor`
    : grouped.production.length
      ? `${grouped.production.length} ${grouped.production.length === 1 ? 'pauta está' : 'pautas estão'} em desenvolvimento`
      : `${grouped.queue.length} ideias curtidas aguardam seleção`;

  return (
    <section className={`idea-production-workspace is-${activeStage}`}>
      <header className="ipw-command-header">
        <div>
          <span className="ipw-eyebrow">Sala de produção</span>
          <h1>Do radar ao post publicado</h1>
          <p>{nextMessage}. Selecione uma pauta para ver a referência e desenvolver a versão Playbook.</p>
        </div>
        <div className="ipw-user-mode"><span>{currentUser === 'Victor' ? 'Revisando como' : 'Produzindo como'}</span><strong>{currentUser}</strong></div>
      </header>

      <nav className="ipw-stage-nav" aria-label="Etapas da produção">
        {Object.entries(stageMeta).map(([key, meta]) => {
          const Icon = meta.icon;
          return <button type="button" key={key} className={activeStage === key ? 'active' : ''} onClick={() => { setActiveStage(key); setSelectedId(null); setQuery(''); }}><Icon size={15} /><span>{meta.label}</span><strong>{grouped[key].length}</strong></button>;
        })}
      </nav>

      <div className="ipw-workspace">
        <aside className="ipw-work-rail">
          <div className="ipw-rail-header">
            <div><span>{stageMeta[activeStage].short}</span><strong>{activeStage === 'queue' ? 'Melhores oportunidades' : stageMeta[activeStage].label}</strong></div>
            <span>{visibleIdeas.length}</span>
          </div>
          <label className="ipw-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pauta, autor ou tema" /></label>
          <div className="ipw-work-list">
            {visibleIdeas.length ? visibleIdeas.map((idea) => <WorkListItem key={idea.id} idea={idea} selected={selectedIdea?.id === idea.id} onSelect={() => setSelectedId(idea.id)} />) : (
              <div className="ipw-list-empty"><CheckCircle2 size={20} /><strong>Nada nesta etapa</strong><span>{query ? 'Tente outra busca.' : 'Quando uma pauta avançar, ela aparecerá aqui.'}</span></div>
            )}
          </div>
        </aside>

        <main className="ipw-focus-area">
          {selectedIdea ? <EditorialInspector idea={selectedIdea} currentUser={currentUser} onBring={bringToProduction} onReturnToQueue={returnToQueue} onSendToReview={sendToReview} onOpenStudio={onOpenStudio} onSchedule={onSchedule} /> : (
            <div className="ipw-focus-empty"><Sparkles size={24} /><strong>Etapa concluída</strong><span>Não há materiais para mostrar aqui agora.</span></div>
          )}
        </main>
      </div>
    </section>
  );
}
