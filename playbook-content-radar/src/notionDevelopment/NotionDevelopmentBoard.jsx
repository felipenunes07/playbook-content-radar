import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Archive,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  Folder,
  GripVertical,
  ImagePlus,
  Inbox,
  LayoutDashboard,
  Library,
  Lightbulb,
  ListFilter,
  Magnet,
  PlaySquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import IdeaProductionWorkspace from '../production/IdeaProductionWorkspace.jsx';
import { DEVELOPMENT_STATUSES, PLATFORM_ORDER, normalizeNotionContentPage } from './normalize.js';
import './contentHub.css';

const BOARD_STATUSES = ['Not started', 'In progress', 'Em edição', 'Ready to publish', 'Programado', 'Published'];
const STATUS = {
  'Not started': { label: 'Ideias', hint: 'Ainda sem produção', tone: 'gray' },
  'In progress': { label: 'Produção', hint: 'Conteúdo em criação', tone: 'blue' },
  'Em edição': { label: 'Edição', hint: 'Ajustes e mídia', tone: 'purple' },
  'Ready to publish': { label: 'Revisão', hint: 'Aguardando aprovação', tone: 'green' },
  Programado: { label: 'Programado', hint: 'Com data definida', tone: 'amber' },
  Published: { label: 'Publicado', hint: 'Conteúdo no ar', tone: 'teal' },
  Cancelled: { label: 'Arquivado', hint: 'Fora do fluxo', tone: 'red' },
};

const NOTION_EMBED_URL = 'https://playbooklab.notion.site/ebd//383f8d62b79a8025a18ddb349e61cd7d';
const NOTION_PAGE_URL = 'https://playbooklab.notion.site/Felipe-Content-383f8d62b79a8025a18ddb349e61cd7d?pvs=73';

const FALLBACK_TEMPLATES = [
  { key: 'linkedin_post', name: 'Post LinkedIn', platform: 'LinkedIn', campaign: 'Editorial', sections: [
    { title: 'Explicacao', prompt: 'Contexto, objetivo e angulo do post.', done: false },
    { title: 'Copy', prompt: 'Texto final, hook e CTA.', done: false },
    { title: 'Midia', prompt: 'Imagem, carrossel, video ou referencia.', done: false },
  ] },
  { key: 'lead_magnet_post', name: 'Lead Magnet', platform: 'LinkedIn', campaign: 'Lead Magnet', sections: [
    { title: 'Checklist de entrega', prompt: 'Notion publico, Tally, n8n e Lead Shark.', done: false },
    { title: 'Explicacao', prompt: 'Contexto, objetivo e oferta.', done: false },
    { title: 'Copy do Post', prompt: 'Texto final com CTA.', done: false },
    { title: 'Midia do Post', prompt: 'Imagem, carrossel ou video.', done: false },
    { title: 'Notion Page', prompt: 'Material final e link publico.', done: false },
    { title: 'Link do Tally', prompt: 'Formulario e entrega.', done: false },
  ] },
  { key: 'youtube_video', name: 'Vídeo YouTube', platform: 'YouTube', campaign: 'Video', sections: [
    { title: 'Explicacao', prompt: 'Ideia central, publico e promessa.', done: false },
    { title: 'Script', prompt: 'Abertura, blocos e fechamento.', done: false },
    { title: 'Materiais de Apoio/Descricao', prompt: 'Links, capitulos e descricao.', done: false },
  ] },
];

function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  if (!value) return 'Sem data';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR', options);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function progressOf(sections = []) {
  const total = sections.length;
  const done = sections.filter((section) => section.done).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function templateFor(card, templates) {
  if (card.templateKey) return templates.find((item) => item.key === card.templateKey) || templates[0];
  if (card.platforms?.includes('YouTube')) return templates.find((item) => item.key === 'youtube_video') || templates[0];
  if (card.campaign?.includes('Lead Magnet')) return templates.find((item) => item.key === 'lead_magnet_post') || templates[0];
  return templates.find((item) => item.key === 'linkedin_post') || templates[0];
}

function sectionsFor(card, templates) {
  if (card.sections?.length) return card.sections;
  return (templateFor(card, templates)?.sections || []).map((section) => ({ ...section, note: '', done: false }));
}

function ContentIcon({ templateKey, size = 15 }) {
  if (templateKey === 'youtube_video') return <PlaySquare size={size} />;
  if (templateKey === 'lead_magnet_post') return <Magnet size={size} />;
  return <FileText size={size} />;
}

function NotionEmbedView() {
  return <section className="hub-notion-embed">
    <header>
      <div><span>Calendário original</span><h2>Notion</h2></div>
      <a href={NOTION_PAGE_URL} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir no Notion</a>
    </header>
    <iframe title="Felipe Content no Notion" src={NOTION_EMBED_URL} allowFullScreen />
  </section>;
}

function Card({ card, onOpen, onPointerStart, onNativeStart, onMoveNext, onReturnToIdeas, drag = true, overlay = false }) {
  const progress = progressOf(card.sections);
  const draggable = useDraggable({ id: card.id, disabled: !drag });
  const style = draggable.transform ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)` } : undefined;
  return (
    <article ref={draggable.setNodeRef} style={style} draggable={drag} className={`hub-card ${overlay ? 'is-overlay' : ''} ${draggable.isDragging ? 'is-dragging' : ''}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/content-card', card.id); onNativeStart?.(card); }} onClick={() => !draggable.isDragging && onOpen(card)}>
      <div className="hub-card-line">
        <span className={`hub-platform ${card.platforms?.[0]?.toLowerCase() || 'none'}`}>{card.platforms?.[0] || 'Sem plataforma'}</span>
        {drag && <span className="hub-card-tools">{card.status !== 'Not started' && <button type="button" aria-label="Voltar para ideias" title="Voltar para ideias" onClick={(event) => { event.stopPropagation(); onReturnToIdeas?.(card); }}><ChevronLeft size={14} /></button>}<button type="button" aria-label="Avançar etapa" title="Avançar para a próxima etapa" onClick={(event) => { event.stopPropagation(); onMoveNext?.(card); }}><ChevronRight size={14} /></button><button className="hub-grip" type="button" aria-label="Arrastar card" onClick={(event) => event.stopPropagation()} onPointerDownCapture={() => onPointerStart?.(card)} {...draggable.listeners} {...draggable.attributes}><GripVertical size={15} /></button></span>}
      </div>
      <h3>{card.title}</h3>
      <div className="hub-card-meta">
        {card.assignee && <span><UserRound size={11} />{card.assignee}</span>}
        <span><CalendarDays size={11} />{formatDate(card.publishDate || card.deadline)}</span>
      </div>
      {(card.templateName || progress.total > 0) && <div className="hub-card-foot">
        <span><ContentIcon templateKey={card.templateKey} size={12} />{card.templateName || card.contentType}</span>
        {progress.total > 0 && <strong>{progress.done}/{progress.total}</strong>}
      </div>}
    </article>
  );
}

function Column({ status, cards, onOpen, onMoveNext, onReturnToIdeas, onPointerDrop, onPointerStart, onNativeStart, onNativeDrop }) {
  const drop = useDroppable({ id: status });
  const config = STATUS[status] || STATUS['Not started'];
  return (
    <section ref={drop.setNodeRef} data-hub-status={status} className={`hub-column tone-${config.tone} ${drop.isOver ? 'is-over' : ''}`} onPointerUpCapture={() => onPointerDrop?.(status)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => { event.preventDefault(); onNativeDrop?.(status); }}>
      <header><div><span>{config.label}</span><small>{config.hint}</small></div><strong>{cards.length}</strong></header>
      <div className="hub-column-list">
        {cards.map((card) => <Card key={card.id} card={card} onOpen={onOpen} onMoveNext={onMoveNext} onReturnToIdeas={onReturnToIdeas} onPointerStart={onPointerStart} onNativeStart={onNativeStart} />)}
        {!cards.length && <div className="hub-drop-empty">Solte um conteúdo aqui</div>}
      </div>
    </section>
  );
}

function BoardView({ cards, onOpen, onMove }) {
  const [activeCard, setActiveCard] = useState(null);
  const pointerCard = useRef(null);
  const nativeCard = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const finishPointer = (status) => {
    const card = pointerCard.current;
    pointerCard.current = null;
    if (card && card.status !== status) onMove(card, status);
  };
  const finishNative = (status) => {
    const card = nativeCard.current;
    nativeCard.current = null;
    pointerCard.current = null;
    if (card && card.status !== status) onMove(card, status);
  };
  const moveNext = (card) => {
    const position = BOARD_STATUSES.indexOf(card.status);
    if (position >= 0 && position < BOARD_STATUSES.length - 1) onMove(card, BOARD_STATUSES[position + 1]);
  };
  const returnToIdeas = (card) => onMove(card, 'Not started');
  useEffect(() => {
    const finishAtPointer = (event) => {
      const card = pointerCard.current;
      if (!card) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-hub-status]');
      const status = target?.getAttribute('data-hub-status');
      pointerCard.current = null;
      if (status && card.status !== status) onMove(card, status);
    };
    window.addEventListener('pointerup', finishAtPointer, true);
    return () => window.removeEventListener('pointerup', finishAtPointer, true);
  }, [onMove]);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => setActiveCard(cards.find((card) => card.id === active.id) || null)} onDragCancel={() => { pointerCard.current = null; setActiveCard(null); }} onDragEnd={({ active, over }) => { const card = cards.find((item) => item.id === active.id); setActiveCard(null); if (pointerCard.current && card && over?.id && card.status !== over.id) { pointerCard.current = null; onMove(card, String(over.id)); } }}>
      <div className="hub-board">{BOARD_STATUSES.map((status) => <Column key={status} status={status} cards={cards.filter((card) => card.status === status)} onOpen={onOpen} onMoveNext={moveNext} onReturnToIdeas={returnToIdeas} onPointerStart={(card) => { pointerCard.current = card; }} onPointerDrop={finishPointer} onNativeStart={(card) => { nativeCard.current = card; }} onNativeDrop={finishNative} />)}</div>
      <DragOverlay>{activeCard ? <Card card={activeCard} onOpen={() => {}} drag={false} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function TodayView({ cards, onOpen, onCreate }) {
  const today = isoDate(new Date());
  const week = new Date(); week.setDate(week.getDate() + 7);
  const due = cards.filter((card) => card.deadline && card.deadline <= today && !['Published', 'Cancelled'].includes(card.status));
  const review = cards.filter((card) => card.status === 'Ready to publish');
  const active = cards.filter((card) => ['In progress', 'Em edição'].includes(card.status));
  const upcoming = cards.filter((card) => card.publishDate && card.publishDate >= today && card.publishDate <= isoDate(week));
  const groups = [
    ['Atenção agora', due, CircleAlert],
    ['Em produção', active, RefreshCw],
    ['Para revisar', review, Check],
    ['Próximos 7 dias', upcoming, CalendarDays],
  ];
  return <div className="hub-today">
    <section className="hub-focus"><div><span>Central editorial</span><h2>O que precisa andar hoje</h2><p>Prazos, produção e revisão em uma fila única.</p></div><button type="button" onClick={onCreate}><Plus size={16} />Novo conteúdo</button></section>
    <div className="hub-today-grid">{groups.map(([title, rows, Icon]) => <section key={title} className="hub-worklist"><header><div><Icon size={15} /><strong>{title}</strong></div><span>{rows.length}</span></header>{rows.length ? rows.slice(0, 6).map((card) => <button type="button" key={card.id} onClick={() => onOpen(card)}><span className={`hub-status-dot tone-${STATUS[card.status]?.tone || 'gray'}`} /><div><strong>{card.title}</strong><small>{card.creator} · {card.platforms?.[0] || 'Sem plataforma'}</small></div><time>{formatDate(card.deadline || card.publishDate)}</time></button>) : <div className="hub-work-empty">Nada pendente aqui</div>}</section>)}</div>
  </div>;
}

function CalendarView({ cards, onOpen }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear(); const month = cursor.getMonth();
  const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7) cells.push(null);
  return <section className="hub-calendar"><header><div><button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button><h2>{cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2><button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button></div><button type="button" onClick={() => setCursor(new Date())}>Hoje</button></header><div className="hub-weekdays">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <span key={day}>{day}</span>)}</div><div className="hub-month-grid">{cells.map((date, index) => { const key = date ? isoDate(date) : `empty-${index}`; const dayCards = date ? cards.filter((card) => (card.publishDate || card.deadline) === key) : []; return <div key={key} className={!date ? 'is-empty' : key === isoDate(new Date()) ? 'is-today' : ''}>{date && <time>{date.getDate()}</time>}{dayCards.slice(0, 3).map((card) => <button type="button" key={card.id} onClick={() => onOpen(card)} className={`tone-${STATUS[card.status]?.tone || 'gray'}`}>{card.title}</button>)}{dayCards.length > 3 && <small>+{dayCards.length - 3} conteúdos</small>}</div>; })}</div></section>;
}

function LibraryView({ cards, onOpen }) {
  const [folder, setFolder] = useState('Todos');
  const folders = ['Todos', ...new Set(cards.map((card) => card.folder || card.platforms?.[0] || 'Conteúdos'))];
  const rows = folder === 'Todos' ? cards : cards.filter((card) => (card.folder || card.platforms?.[0]) === folder);
  return <div className="hub-library"><aside><strong>Pastas</strong>{folders.map((item) => <button type="button" key={item} className={folder === item ? 'active' : ''} onClick={() => setFolder(item)}><Folder size={14} />{item}<span>{item === 'Todos' ? cards.length : cards.filter((card) => (card.folder || card.platforms?.[0]) === item).length}</span></button>)}</aside><section><header><div><span>Biblioteca</span><h2>{folder}</h2></div><small>{rows.length} conteúdos</small></header><div className="hub-table"><div className="hub-table-head"><span>Conteúdo</span><span>Criador</span><span>Plataforma</span><span>Status</span><span>Data</span></div>{rows.map((card) => <button type="button" key={card.id} onClick={() => onOpen(card)}><span><ContentIcon templateKey={card.templateKey} /><strong>{card.title}</strong></span><span>{card.creator}</span><span>{card.platforms?.join(', ')}</span><span><i className={`tone-${STATUS[card.status]?.tone || 'gray'}`} />{STATUS[card.status]?.label || card.status}</span><time>{formatDate(card.publishDate || card.deadline)}</time></button>)}</div></section></div>;
}

function CreateDialog({ templates, ideas, onClose, onCreate, onCreateFromIdea, busy }) {
  const approvedIdeas = useMemo(() => ideas.filter((idea) => idea.victorVote === 'like' || idea.fernandoVote === 'like'), [ideas]);
  const [mode, setMode] = useState(approvedIdeas.length ? 'idea' : 'blank');
  const [templateKey, setTemplateKey] = useState('linkedin_post');
  const [title, setTitle] = useState('');
  const [ideaSearch, setIdeaSearch] = useState('');
  const [selectedIdeaId, setSelectedIdeaId] = useState(approvedIdeas[0]?.id || '');
  const visibleIdeas = approvedIdeas.filter((idea) => `${idea.title} ${idea.sourceAuthor || ''} ${idea.category || ''}`.toLowerCase().includes(ideaSearch.toLowerCase()));
  const selectedIdea = approvedIdeas.find((idea) => idea.id === selectedIdeaId);
  return <div className="hub-modal-layer" onMouseDown={onClose}><section className="hub-create" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Novo conteúdo</span><h2>Escolha a origem</h2></div><button type="button" onClick={onClose}><X size={17} /></button></header><div className="hub-create-source"><button type="button" className={mode === 'idea' ? 'active' : ''} onClick={() => setMode('idea')}><Lightbulb size={15} />Usar ideia aprovada<strong>{approvedIdeas.length}</strong></button><button type="button" className={mode === 'blank' ? 'active' : ''} onClick={() => setMode('blank')}><Plus size={15} />Criar do zero</button></div>{mode === 'idea' ? <div className="hub-idea-picker"><label><Search size={14} /><input value={ideaSearch} onChange={(event) => setIdeaSearch(event.target.value)} placeholder="Buscar nas ideias curtidas" /></label><div>{visibleIdeas.length ? visibleIdeas.map((idea) => <button type="button" key={idea.id} className={selectedIdeaId === idea.id ? 'active' : ''} onClick={() => setSelectedIdeaId(idea.id)}>{idea.imageUrl ? <img src={idea.imageUrl} alt="" /> : <span className="hub-idea-placeholder"><Lightbulb size={15} /></span>}<div><strong>{idea.title}</strong><small>{idea.sourceAuthor || idea.category || 'Radar de ideias'}</small><em>{idea.victorVote === 'like' ? 'Victor curtiu' : ''}{idea.victorVote === 'like' && idea.fernandoVote === 'like' ? ' · ' : ''}{idea.fernandoVote === 'like' ? 'Fernando curtiu' : ''}</em></div>{selectedIdeaId === idea.id && <Check size={16} />}</button>) : <div className="hub-no-ideas"><Inbox size={18} />Nenhuma ideia curtida encontrada.</div>}</div></div> : <><div className="hub-template-options">{templates.map((template) => <button type="button" key={template.key} className={templateKey === template.key ? 'active' : ''} onClick={() => setTemplateKey(template.key)}><ContentIcon templateKey={template.key} size={19} /><strong>{template.name}</strong><span>{template.platform} · {template.sections.length} blocos</span></button>)}</div><label>Título<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome da pauta ou conteúdo" /></label></>}<footer><button type="button" onClick={onClose}>Cancelar</button>{mode === 'idea' ? <button type="button" className="primary" disabled={busy || !selectedIdea} onClick={() => onCreateFromIdea(selectedIdea)}><Lightbulb size={15} />{busy ? 'Criando...' : 'Usar esta ideia'}</button> : <button type="button" className="primary" disabled={busy} onClick={() => onCreate(templateKey, title)}><Plus size={15} />{busy ? 'Criando...' : 'Criar conteúdo'}</button>}</footer></section></div>;
}

function Editor({ card, templates, draft, setDraft, onClose, onSave, onReturnToIdeas, onUpload, onRemoveImage, saving, uploading }) {
  const progress = progressOf(draft.sections);
  const setSection = (index, patch) => setDraft((current) => ({ ...current, sections: current.sections.map((section, position) => position === index ? { ...section, ...patch } : section) }));
  const applyTemplate = (key) => { const template = templates.find((item) => item.key === key); if (template) setDraft((current) => ({ ...current, templateKey: key, contentType: template.name, sections: template.sections.map((section) => ({ ...section, note: '', done: false })) })); };
  return <div className="hub-modal-layer" onMouseDown={onClose}><section className="hub-editor" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} onPaste={onUpload}><header><div className="hub-editor-heading"><span>{card.creator} / {draft.folder || 'Conteúdos'}</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></div><div><button type="button" onClick={onClose}><X size={17} /></button></div></header><div className="hub-editor-body"><aside><label>Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>{DEVELOPMENT_STATUSES.map((status) => <option key={status} value={status}>{STATUS[status]?.label || status}</option>)}</select></label><label>Template<select value={draft.templateKey} onChange={(event) => applyTemplate(event.target.value)}>{templates.map((template) => <option key={template.key} value={template.key}>{template.name}</option>)}</select></label><label>Responsável<input value={draft.assignee} onChange={(event) => setDraft((current) => ({ ...current, assignee: event.target.value }))} /></label><label>Prioridade<select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}><option>Alta</option><option>Media</option><option>Baixa</option></select></label><label>Pasta<input value={draft.folder} onChange={(event) => setDraft((current) => ({ ...current, folder: event.target.value }))} /></label><label>Prazo<input type="date" value={draft.deadline || ''} onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} /></label><label>Publicação<input type="date" value={draft.publishDate || ''} onChange={(event) => setDraft((current) => ({ ...current, publishDate: event.target.value }))} /></label><div className="hub-editor-progress"><span><strong>{progress.pct}%</strong> concluído</span><i><b style={{ width: `${progress.pct}%` }} /></i></div>{card.notionUrl && <a href={card.notionUrl} target="_blank" rel="noreferrer">Abrir original no Notion <ExternalLink size={12} /></a>}</aside><main><section className="hub-doc-block"><h3>Briefing</h3><textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Objetivo, público, ângulo, referências e observações..." /></section><section className="hub-doc-block"><div className="hub-block-title"><div><h3>Materiais</h3><span>Cole uma imagem com Ctrl+V ou envie um arquivo.</span></div><label><ImagePlus size={15} />{uploading ? 'Enviando...' : 'Adicionar'}<input type="file" accept="image/*" onChange={onUpload} /></label></div>{draft.attachments.length ? <div className="hub-media">{draft.attachments.map((item, index) => <figure key={item.url}><img src={item.url} alt={item.name || 'Material'} /><button type="button" onClick={() => onRemoveImage(item, index)}><Trash2 size={14} /></button></figure>)}</div> : <div className="hub-media-empty"><ImagePlus size={18} />Imagens, thumbnails, carrosséis e referências ficam aqui.</div>}</section><section className="hub-doc-block"><div className="hub-block-title"><div><h3>Conteúdo e etapas</h3><span>Estrutura baseada no template, totalmente editável.</span></div><button type="button" onClick={() => setDraft((current) => ({ ...current, sections: [...current.sections, { title: 'Novo bloco', prompt: '', note: '', done: false }] }))}><Plus size={14} />Bloco</button></div><div className="hub-sections">{draft.sections.map((section, index) => <article key={`${section.title}-${index}`} className={section.done ? 'done' : ''}><div><input type="checkbox" checked={Boolean(section.done)} onChange={(event) => setSection(index, { done: event.target.checked })} /><input value={section.title} onChange={(event) => setSection(index, { title: event.target.value })} /><button type="button" onClick={() => setDraft((current) => ({ ...current, sections: current.sections.filter((_, position) => position !== index) }))}><Trash2 size={13} /></button></div><input value={section.prompt || ''} onChange={(event) => setSection(index, { prompt: event.target.value })} placeholder="Orientação deste bloco" /><textarea value={section.note || ''} onChange={(event) => setSection(index, { note: event.target.value })} placeholder="Escreva aqui..." /></article>)}</div></section></main></div><footer><button type="button" onClick={onClose}>Fechar</button><button type="button" className="primary" onClick={onSave} disabled={saving || uploading}><Save size={15} />{saving ? 'Salvando...' : 'Salvar alterações'}</button></footer></section></div>;
}

export default function NotionDevelopmentBoard({ client, ideas = [], currentUser, updateState, onOpenStudio, onSchedule }) {
  const [cards, setCards] = useState([]);
  const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
  const [view, setView] = useState('today');
  const [platform, setPlatform] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const invoke = useCallback(async (body) => {
    const { data, error: functionError } = await client.functions.invoke('notion-development-board', { body: { owner: 'victor', ...body } });
    if (functionError) throw functionError;
    if (!data?.success) throw new Error(data?.error || 'A operação não foi concluída.');
    return data;
  }, [client]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await invoke({}); setCards((data.items || []).map(normalizeNotionContentPage)); if (data.templates?.length) setTemplates(data.templates); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setLoading(false); }
  }, [invoke]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => cards.filter((card) => {
    if (platform !== 'all' && !card.platforms?.includes(platform)) return false;
    if (search && !`${card.title} ${card.campaign?.join(' ')}`.toLowerCase().includes(search.toLowerCase())) return false;
    return card.status !== 'Cancelled';
  }), [cards, platform, search]);

  const createItem = async (templateKey, title) => {
    setCreating(true);
    try { const data = await invoke({ action: 'create_item', templateKey, title, assignedToFelipe: true }); const card = normalizeNotionContentPage(data.item); setCards((current) => [card, ...current]); setCreateOpen(false); openCard(card); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setCreating(false); }
  };

  const createFromApprovedIdea = async (idea) => {
    if (!idea) return;
    setCreating(true);
    try {
      const signal = `${idea.category || ''} ${idea.format || ''} ${idea.title || ''}`.toLowerCase();
      const templateKey = signal.includes('youtube') || signal.includes('video') ? 'youtube_video' : signal.includes('lead magnet') ? 'lead_magnet_post' : 'linkedin_post';
      const created = await invoke({ action: 'create_item', templateKey, title: idea.title, assignedToFelipe: true });
      const description = [
        idea.playbookAngle ? `Angulo Playbook: ${idea.playbookAngle}` : '',
        idea.summary || '',
        idea.sourceAuthor ? `Referencia: ${idea.sourceAuthor}` : '',
        idea.linkedinUrl || '',
      ].filter(Boolean).join('\n\n');
      const attachments = idea.imageUrl ? [{ url: idea.imageUrl, name: 'Referencia original', type: 'image/external' }] : [];
      const updated = await invoke({ action: 'update_item', id: created.item.id, description, attachments, folder: 'Ideias aprovadas', priority: 'Media', assignee: 'Felipe' });
      const card = normalizeNotionContentPage(updated.item);
      setCards((current) => [card, ...current]);
      if (updateState) updateState((previous) => ({ ...previous, ideas: previous.ideas.map((item) => item.id === idea.id ? { ...item, manualStatus: 'em_producao' } : item) }));
      setCreateOpen(false);
      await openCard(card);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setCreating(false);
    }
  };

  const openCard = async (card) => {
    try {
      let editable = card;
      if (card.sourceType === 'notion') { const data = await invoke({ action: 'promote_item', id: card.id }); editable = normalizeNotionContentPage(data.item); setCards((current) => [editable, ...current.filter((item) => item.id !== card.id)]); }
      const template = templateFor(editable, templates);
      setSelected(editable);
      setDraft({ title: editable.title, status: editable.status, templateKey: template?.key || 'linkedin_post', description: editable.description || '', sections: sectionsFor(editable, templates), attachments: editable.attachments || [], assignee: editable.assignee || 'Felipe', priority: editable.priority || 'Media', folder: editable.folder || editable.platforms?.[0] || 'Conteúdos', deadline: editable.deadline || '', publishDate: editable.publishDate || '', contentType: editable.contentType || 'Post' });
    } catch (err) { setError(err?.message || String(err)); }
  };

  const save = async () => {
    setSaving(true);
    try { const data = await invoke({ action: 'update_item', id: selected.id, title: draft.title, status: draft.status, templateKey: draft.templateKey, description: draft.description, sections: draft.sections, attachments: draft.attachments, assignee: draft.assignee, priority: draft.priority, folder: draft.folder, deadline: draft.deadline || null, publishDate: draft.publishDate || null, contentType: draft.contentType }); const updated = normalizeNotionContentPage(data.item); setCards((current) => current.map((card) => card.id === updated.id ? updated : card)); setSelected(updated); setDraft((current) => ({ ...current, sections: updated.sections, attachments: updated.attachments || [] })); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setSaving(false); }
  };

  const move = async (card, status) => {
    const previous = cards;
    setCards((current) => current.map((item) => item.id === card.id ? { ...item, status } : item));
    try { let editable = card; if (card.sourceType === 'notion') { const promoted = await invoke({ action: 'promote_item', id: card.id }); editable = normalizeNotionContentPage(promoted.item); } const data = await invoke({ action: 'update_item', id: editable.id, status }); const updated = normalizeNotionContentPage(data.item); setCards((current) => [updated, ...current.filter((item) => item.id !== card.id && item.id !== updated.id)]); }
    catch (err) { setCards(previous); setError(err?.message || String(err)); }
  };

  const upload = async (event) => {
    const file = event.clipboardData?.files?.[0] || event.target?.files?.[0];
    if (!file?.type?.startsWith('image/') || !selected) return;
    event.preventDefault?.(); setUploading(true);
    try { const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); const data = await invoke({ action: 'upload_attachment', id: selected.id, name: file.name, mimeType: file.type, base64 }); setDraft((current) => ({ ...current, attachments: [...current.attachments, data.attachment] })); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setUploading(false); }
  };

  const removeImage = async (attachment, index) => {
    setDraft((current) => ({ ...current, attachments: current.attachments.filter((_, position) => position !== index) }));
    if (attachment.path) invoke({ action: 'delete_attachment', path: attachment.path }).catch((err) => setError(err?.message || String(err)));
  };

  const views = [
    ['today', LayoutDashboard, 'Hoje'],
    ['board', ListFilter, 'Quadro'],
    ['calendar', CalendarDays, 'Calendário'],
    ['library', Library, 'Biblioteca'],
    ['ideas', Lightbulb, 'Ideias aprovadas'],
    ['notion', ExternalLink, 'Notion'],
  ];

  return <div className="content-hub">
    <header className="hub-header"><div><span>Playbook Content OS</span><h1>Central de conteúdo</h1></div><div className="hub-actions"><button type="button" onClick={load} aria-label="Atualizar"><RefreshCw size={15} className={loading ? 'spin' : ''} /></button><button type="button" className="primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Novo conteúdo</button></div></header>
    <div className="hub-toolbar"><nav>{views.map(([key, Icon, label]) => <button type="button" key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}><Icon size={15} />{label}</button>)}</nav><div className="hub-filters"><label><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conteúdo" /></label><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">Todas as plataformas</option>{PLATFORM_ORDER.map((item) => <option key={item}>{item}</option>)}</select></div></div>
    {error && <div className="hub-error"><CircleAlert size={16} /><span>{error}</span><button type="button" onClick={() => setError('')}><X size={14} /></button></div>}
    {loading && !cards.length ? <div className="hub-loading"><RefreshCw className="spin" size={18} />Carregando central...</div> : <main className="hub-workspace">
      {view === 'today' && <TodayView cards={filtered} onOpen={openCard} onCreate={() => setCreateOpen(true)} />}
      {view === 'board' && <BoardView cards={filtered} onOpen={openCard} onMove={move} />}
      {view === 'calendar' && <CalendarView cards={filtered} onOpen={openCard} />}
      {view === 'library' && <LibraryView cards={filtered} onOpen={openCard} />}
      {view === 'ideas' && <IdeaProductionWorkspace ideas={ideas} currentUser={currentUser} updateState={updateState} onOpenStudio={onOpenStudio} onSchedule={onSchedule} />}
      {view === 'notion' && <NotionEmbedView />}
    </main>}
    {createOpen && createPortal(<CreateDialog templates={templates} ideas={ideas} onClose={() => setCreateOpen(false)} onCreate={createItem} onCreateFromIdea={createFromApprovedIdea} busy={creating} />, document.body)}
    {selected && draft && createPortal(<Editor card={selected} templates={templates} draft={draft} setDraft={setDraft} onClose={() => { setSelected(null); setDraft(null); }} onSave={save} onUpload={upload} onRemoveImage={removeImage} saving={saving} uploading={uploading} />, document.body)}
  </div>;
}
