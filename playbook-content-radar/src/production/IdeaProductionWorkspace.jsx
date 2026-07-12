import React, { useMemo } from 'react';
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, FilePenLine, Image, Inbox, Sparkles } from 'lucide-react';
import './ideaProduction.css';

const dateLabel = (value) => {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const isLiked = (idea) => idea.victorVote === 'like' || idea.fernandoVote === 'like';

function Reference({ idea }) {
  return (
    <div className="ipw-reference">
      {idea.imageUrl ? <img src={idea.imageUrl} alt="Referência original" /> : <div className="ipw-reference-empty"><Image size={16} /></div>}
      <div>
        <span>Referência original</span>
        <strong>{idea.sourceAuthor || 'Post salvo no Radar'}</strong>
        {idea.linkedinUrl && <a href={idea.linkedinUrl} target="_blank" rel="noreferrer">Abrir post <ExternalLink size={12} /></a>}
      </div>
    </div>
  );
}

function ProductionCard({ idea, onOpenStudio, onSchedule }) {
  const hasMaterial = Boolean(idea.finalPostText || idea.finalImageUrl);
  const isScheduled = Boolean(idea.scheduledAt);
  return (
    <article className="ipw-production-card">
      <div className="ipw-card-topline">
        <span className="ipw-category">{idea.category || 'Conteúdo'}</span>
        {isScheduled ? <span className="ipw-state scheduled"><CalendarDays size={12} /> {dateLabel(idea.scheduledAt)}</span> : hasMaterial ? <span className="ipw-state ready"><CheckCircle2 size={12} /> Pronto para revisão</span> : <span className="ipw-state writing"><FilePenLine size={12} /> Em adaptação</span>}
      </div>
      <h3>{idea.title}</h3>
      <p>{idea.playbookAngle || idea.summary || 'Defina o ângulo Playbook e transforme esta referência em uma pauta própria.'}</p>
      <Reference idea={idea} />
      <div className="ipw-card-footer">
        <button type="button" className="ipw-text-action" onClick={() => onOpenStudio(idea)}><Sparkles size={14} /> {hasMaterial ? 'Abrir material' : 'Adaptar conteúdo'}</button>
        {!isScheduled && <button type="button" className="ipw-icon-action" title="Programar publicação" onClick={() => onSchedule(idea)}><CalendarDays size={16} /></button>}
      </div>
    </article>
  );
}

export default function IdeaProductionWorkspace({ ideas, currentUser, updateState, onOpenStudio, onSchedule }) {
  const likedIdeas = useMemo(() => ideas.filter(isLiked), [ideas]);
  const productionIdeas = useMemo(() => likedIdeas.filter((idea) => idea.computedStatus === 'em_producao' || idea.finalPostText || idea.finalImageUrl || idea.scheduledAt), [likedIdeas]);
  const inboxIdeas = useMemo(() => likedIdeas.filter((idea) => !productionIdeas.some((production) => production.id === idea.id)), [likedIdeas, productionIdeas]);
  const readyIdeas = productionIdeas.filter((idea) => (idea.finalPostText || idea.finalImageUrl) && !idea.scheduledAt);
  const scheduledIdeas = productionIdeas.filter((idea) => idea.scheduledAt);

  const bringToProduction = (idea) => {
    updateState((previous) => ({
      ...previous,
      ideas: previous.ideas.map((item) => item.id === idea.id ? { ...item, manualStatus: 'em_producao' } : item),
    }));
  };

  return (
    <section className="idea-production-workspace">
      <header className="ipw-header">
        <div>
          <span className="ipw-eyebrow">Fluxo editorial</span>
          <h1>Produção a partir das ideias que gostamos</h1>
          <p>Traga uma referência votada, desenvolva a versão Playbook e deixe o material pronto para o Victor revisar e publicar.</p>
        </div>
        <div className="ipw-role-note"><span>{currentUser === 'Victor' ? 'Visão de revisão' : 'Visão de produção'}</span><strong>{currentUser}</strong></div>
      </header>

      <div className="ipw-summary" aria-label="Resumo da produção">
        <div><Inbox size={16} /><span>Na fila</span><strong>{inboxIdeas.length}</strong></div>
        <div><FilePenLine size={16} /><span>Em adaptação</span><strong>{productionIdeas.filter((idea) => !idea.finalPostText && !idea.scheduledAt).length}</strong></div>
        <div><CheckCircle2 size={16} /><span>Para revisar</span><strong>{readyIdeas.length}</strong></div>
        <div><CalendarDays size={16} /><span>Programados</span><strong>{scheduledIdeas.length}</strong></div>
      </div>

      <div className="ipw-layout">
        <aside className="ipw-inbox">
          <div className="ipw-section-heading"><div><span>Banco de referências</span><h2>Ideias com “Gostei”</h2></div><strong>{inboxIdeas.length}</strong></div>
          <p className="ipw-section-copy">Cada pauta aqui recebeu pelo menos um voto positivo. Escolha as que devem virar material da Playbook.</p>
          <div className="ipw-inbox-list">
            {inboxIdeas.length ? inboxIdeas.map((idea) => (
              <article key={idea.id} className="ipw-inbox-item">
                <span>{idea.category || 'Conteúdo'}</span>
                <h3>{idea.title}</h3>
                <small>{idea.victorVote === 'like' ? 'Victor gostou' : ''}{idea.victorVote === 'like' && idea.fernandoVote === 'like' ? ' · ' : ''}{idea.fernandoVote === 'like' ? 'Fernando gostou' : ''}</small>
                <button type="button" onClick={() => bringToProduction(idea)}><Sparkles size={14} /> Trazer para produção</button>
              </article>
            )) : <div className="ipw-empty"><CheckCircle2 size={17} /> Todas as ideias curtidas já estão no fluxo.</div>}
          </div>
        </aside>

        <main className="ipw-board">
          <div className="ipw-section-heading"><div><span>Material da Playbook</span><h2>Desenvolvimento e publicação</h2></div></div>
          {!productionIdeas.length ? (
            <div className="ipw-board-empty"><Sparkles size={22} /><strong>Comece por uma referência aprovada</strong><p>Use “Trazer para produção” para abrir uma pauta com o post original sempre à vista.</p></div>
          ) : (
            <div className="ipw-columns">
              <section><div className="ipw-column-title"><span>Em adaptação</span><strong>{productionIdeas.filter((idea) => !idea.finalPostText && !idea.scheduledAt).length}</strong></div><div className="ipw-card-list">{productionIdeas.filter((idea) => !idea.finalPostText && !idea.scheduledAt).map((idea) => <ProductionCard key={idea.id} idea={idea} onOpenStudio={onOpenStudio} onSchedule={onSchedule} />)}</div></section>
              <section><div className="ipw-column-title"><span>Pronto para Victor</span><strong>{readyIdeas.length}</strong></div><div className="ipw-card-list">{readyIdeas.map((idea) => <ProductionCard key={idea.id} idea={idea} onOpenStudio={onOpenStudio} onSchedule={onSchedule} />)}</div></section>
              <section><div className="ipw-column-title"><span>Programados</span><strong>{scheduledIdeas.length}</strong></div><div className="ipw-card-list">{scheduledIdeas.map((idea) => <ProductionCard key={idea.id} idea={idea} onOpenStudio={onOpenStudio} onSchedule={onSchedule} />)}</div></section>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
