import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import IdeaProductionWorkspace from '../production/IdeaProductionWorkspace.jsx';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  KanbanSquare,
  ImagePlus,
  LayoutList,
  Lightbulb,
  Magnet,
  PlaySquare,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { DEVELOPMENT_STATUSES, PLATFORM_ORDER, filterCardsByPlatform, groupCardsByStatus, normalizeNotionContentPage } from './normalize.js';
import './notionDevelopment.css';

const statusLabels = {
  'Not started': 'Nao iniciado',
  'In progress': 'Em progresso',
  'Em edicao': 'Em edicao',
  'Em edição': 'Em edicao',
  'Ready to publish': 'Pronto',
  Programado: 'Programado',
  Published: 'Publicado',
  Cancelled: 'Cancelado',
};

const statusDetails = {
  'Not started': 'Ideias e pautas',
  'In progress': 'Em producao',
  'Em edicao': 'Ajustes finais',
  'Em edição': 'Ajustes finais',
  'Ready to publish': 'Pode publicar',
  Programado: 'Agendado',
  Published: 'Publicado',
  Cancelled: 'Fora do plano',
};

const platformLabels = {
  all: 'Todas',
  LinkedIn: 'LinkedIn',
  YouTube: 'YouTube',
};

const templateFallbacks = [
  {
    key: 'linkedin_post',
    name: 'New LinkedIn Post',
    platform: 'LinkedIn',
    campaign: 'Editorial',
    sections: [
      { title: 'Explicacao', prompt: 'Ponto de vista, promessa e contexto do post.', done: false },
      { title: 'Hook', prompt: 'Primeira linha com tensao, contraste ou promessa.', done: false },
      { title: 'Texto', prompt: 'Rascunho principal do post.', done: false },
      { title: 'CTA', prompt: 'Proxima acao esperada.', done: false },
      { title: 'Materiais', prompt: 'Links, prints, provas e referencias.', done: false },
    ],
  },
  {
    key: 'lead_magnet_post',
    name: 'New Lead Magnet Post',
    platform: 'LinkedIn',
    campaign: 'Lead Magnet',
    sections: [
      { title: 'Oferta', prompt: 'O que a pessoa recebe e por que vale pedir.', done: false },
      { title: 'Dor', prompt: 'Problema concreto que esse material resolve.', done: false },
      { title: 'Prova', prompt: 'Resultado, exemplo ou print que sustenta.', done: false },
      { title: 'Post', prompt: 'Texto final com CTA claro.', done: false },
      { title: 'Entrega', prompt: 'Link, arquivo ou automacao de resposta.', done: false },
    ],
  },
  {
    key: 'youtube_video',
    name: 'New YouTube Video',
    platform: 'YouTube',
    campaign: 'Video',
    sections: [
      { title: 'Explicacao', prompt: 'Ideia central, publico e promessa do video.', done: false },
      { title: 'Script', prompt: 'Abertura, blocos, exemplos e fechamento.', done: false },
      { title: 'Materiais de Apoio/Descricao', prompt: 'Links, capitulos, descricao e arquivos.', done: false },
      { title: 'Titulo e Thumbnail', prompt: 'Opcoes de titulo e angulo visual.', done: false },
      { title: 'Checklist de Publicacao', prompt: 'Descricao, tags, cards, tela final e CTA.', done: false },
    ],
  },
];

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function TemplateIcon({ templateKey, size = 16 }) {
  if (templateKey === 'youtube_video') return <PlaySquare size={size} />;
  if (templateKey === 'lead_magnet_post') return <Magnet size={size} />;
  return <FileText size={size} />;
}

function sectionProgress(sections) {
  if (!Array.isArray(sections) || !sections.length) return { done: 0, total: 0, pct: 0 };
  const done = sections.filter((section) => section?.done).length;
  return { done, total: sections.length, pct: Math.round((done / sections.length) * 100) };
}

function inferTemplate(card, templates) {
  if (card?.templateKey) return templates.find((template) => template.key === card.templateKey) || templates[0];
  if (card?.platforms?.includes('YouTube')) return templates.find((template) => template.key === 'youtube_video') || templates[0];
  if (card?.campaign?.includes('Lead Magnet')) return templates.find((template) => template.key === 'lead_magnet_post') || templates[0];
  return templates.find((template) => template.key === 'linkedin_post') || templates[0];
}

function templateSectionsForCard(card, templates) {
  if (Array.isArray(card?.sections) && card.sections.length) return card.sections;
  return (inferTemplate(card, templates)?.sections || []).map((section) => ({ ...section, note: '', done: false }));
}

function BoardCard({ card, onOpen, onDragStart, onPointerStart }) {
  const platform = card.platforms[0] || 'Sem plataforma';
  const progress = sectionProgress(card.sections);

  return (
    <article
      className={`nd-card ${card.assignedToFelipe ? 'is-felipe' : ''}`}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => onDragStart?.(event, card)}
      onPointerDown={() => onPointerStart?.(card)}
      onClick={() => onOpen(card)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(card);
      }}
    >
      <div className="nd-card-topline">
        <span className={`nd-platform-pill ${slug(platform)}`}>{card.platforms.join(' + ')}</span>
        <span className={card.publishDate ? 'nd-date-chip has-date' : 'nd-date-chip'}>{formatDate(card.publishDate)}</span>
      </div>
      <h3>{card.title}</h3>
      {card.templateName && (
        <div className="nd-template-line">
          <TemplateIcon templateKey={card.templateKey} size={13} />
          <span>{card.templateName}</span>
        </div>
      )}
      {(card.campaign.length > 0 || card.assignedToFelipe) && (
        <div className="nd-card-tags">
          {card.campaign.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
          {card.assignedToFelipe && <span className="felipe"><UserRound size={10} /> Felipe</span>}
        </div>
      )}
      {progress.total > 0 && (
        <div className="nd-card-sections">
          <div className="nd-progress">
            <span style={{ width: `${progress.pct}%` }} />
          </div>
          <small>{progress.done}/{progress.total} fases completas</small>
        </div>
      )}
      <div className="nd-card-actions" onClick={(event) => event.stopPropagation()}>
        {card.contentUrl && (
          <a href={card.contentUrl} target="_blank" rel="noreferrer">
            Conteudo <ExternalLink size={12} />
          </a>
        )}
        {card.notionUrl && (
          <a href={card.notionUrl} target="_blank" rel="noreferrer">
            Notion <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

function PlatformBoard({ cards, statuses, onOpen, onDragStart, onPointerStart, onDropStatus, onPointerDrop }) {
  const groups = ['LinkedIn', 'YouTube', 'Sem plataforma'];
  return (
    <div className="nd-platform-board">
      <div className="nd-matrix-head">
        <span>Plataforma</span>
        {statuses.map((status) => <strong key={status}>{statusLabels[status] || status}</strong>)}
      </div>
      {groups.map((group) => {
        const groupCards = cards.filter((card) => group === 'Sem plataforma'
          ? !card.platforms.length
          : card.platforms.includes(group));
        if (!groupCards.length) return null;
        return (
          <section className="nd-matrix-row" key={group}>
            <header><span className={`nd-platform-pill ${slug(group)}`}>{group}</span><small>{groupCards.length} cards</small></header>
            {statuses.map((status) => (
              <div
                className="nd-matrix-cell"
                key={status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDropStatus?.(event, status)}
                onPointerUp={() => onPointerDrop?.(status)}
              >
                {groupCards.filter((card) => card.status === status).map((card) => (
                  <BoardCard key={card.id} card={card} onOpen={onOpen} onDragStart={onDragStart} onPointerStart={onPointerStart} />
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function CalendarView({ cards, onOpen }) {
  const dated = [...cards].filter((card) => card.publishDate).sort((a, b) => a.publishDate.localeCompare(b.publishDate));
  return (
    <section className="nd-calendar-view">
      {dated.length ? dated.map((card) => (
        <button type="button" key={card.id} onClick={() => onOpen(card)}>
          <time>{formatDate(card.publishDate)}</time>
          <span className={`nd-platform-pill ${slug(card.platforms[0])}`}>{card.platforms[0] || 'Sem plataforma'}</span>
          <strong>{card.title}</strong>
          <small>{statusLabels[card.status] || card.status}</small>
        </button>
      )) : <div className="nd-empty"><Calendar size={15} /> Nenhum conteudo com data definida</div>}
    </section>
  );
}

function CreateModal({ templates, selectedTemplate, setSelectedTemplate, newTitle, setNewTitle, creating, onCreate, onClose }) {
  return (
    <div className="nd-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="nd-create-modal" role="dialog" aria-modal="true" aria-label="Novo conteudo" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>Novo conteudo</span>
            <h2>Escolha um template</h2>
          </div>
          <button type="button" className="nd-icon-button" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="nd-create-options">
          {templates.map((template) => (
            <button
              key={template.key}
              type="button"
              className={selectedTemplate === template.key ? 'active' : ''}
              onClick={() => setSelectedTemplate(template.key)}
            >
              <TemplateIcon templateKey={template.key} />
              <strong>{template.name}</strong>
              <span>{template.sections.length} fases</span>
            </button>
          ))}
        </div>

        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="Titulo do conteudo"
        />

        <div className="nd-create-preview">
          {(templates.find((template) => template.key === selectedTemplate)?.sections || []).map((section) => (
            <div key={section.title}>
              <strong>{section.title}</strong>
              <span>{section.prompt}</span>
            </div>
          ))}
        </div>

        <footer>
          <button type="button" className="nd-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="nd-primary" onClick={onCreate} disabled={creating}>
            <Plus size={15} />
            {creating ? 'Criando...' : 'Criar card'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CardDrawer({
  card, templates, draft, setDraft, saving, uploading, onUpload, onRemoveAttachment, onSave, onClose,
}) {
  const template = templates.find((item) => item.key === draft.templateKey) || inferTemplate(card, templates);
  const sections = draft.sections || [];
  const progress = sectionProgress(sections);

  function updateSection(index, patch) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) => (
        sectionIndex === index ? { ...section, ...patch } : section
      )),
    }));
  }

  function changeTemplate(templateKey) {
    const next = templates.find((item) => item.key === templateKey);
    if (!next) return;
    setDraft((current) => ({
      ...current,
      templateKey,
      sections: next.sections.map((section) => ({ ...section, note: '', done: false })),
    }));
  }

  return (
    <div className="nd-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="nd-drawer" role="dialog" aria-modal="true" aria-label="Detalhes do card" onClick={(event) => event.stopPropagation()}>
        <header className="nd-drawer-header">
          <div>
            <span>Espaço de produção</span>
            <input className="nd-editor-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </div>
          <button type="button" className="nd-icon-button" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="nd-editor-layout">
          <aside className="nd-editor-properties">
            <label>Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>{DEVELOPMENT_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}</select></label>
            <label>Template<select value={draft.templateKey} onChange={(event) => changeTemplate(event.target.value)}>{templates.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
            <label>Data<input type="date" value={draft.publishDate || ''} onChange={(event) => setDraft((current) => ({ ...current, publishDate: event.target.value }))} /></label>
            <div className="nd-editor-progress"><strong>{progress.pct}% concluído</strong><span>{progress.done} de {progress.total} etapas</span><div className="nd-progress"><i style={{ width: `${progress.pct}%` }} /></div></div>
            <div className="nd-editor-source"><span>Origem</span><strong>{card.notionSourceId || card.sourceType === 'notion' ? 'Importado do Notion' : 'Criado no sistema'}</strong></div>
          </aside>

          <main className="nd-editor-main" onPaste={onUpload}>
            <section className="nd-editor-brief">
              <h3>Briefing e conteúdo</h3>
              <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Escreva a ideia, objetivo, gancho, referências ou o rascunho principal..." />
            </section>

            <section className="nd-editor-media">
              <div><h3>Imagens e referências</h3><span>Cole uma imagem com Ctrl+V ou envie um arquivo.</span></div>
              <label className="nd-upload-button"><ImagePlus size={15} />{uploading ? 'Enviando...' : 'Adicionar imagem'}<input type="file" accept="image/*" onChange={onUpload} disabled={uploading} /></label>
              {draft.attachments.length > 0 && <div className="nd-media-grid">{draft.attachments.map((item, index) => <figure key={item.url}><img src={item.url} alt={item.name || 'Imagem do conteudo'} /><button type="button" aria-label="Remover imagem" onClick={() => onRemoveAttachment(item, index)}><Trash2 size={14} /></button></figure>)}</div>}
            </section>

            <section className="nd-section-editor">
              <div className="nd-section-heading"><div><h3>Etapas do template</h3><span>Marque, escreva e adapte cada etapa ao seu processo.</span></div><button type="button" onClick={() => setDraft((current) => ({ ...current, sections: [...current.sections, { title: 'Nova etapa', prompt: '', note: '', done: false }] }))}><Plus size={14} /> Etapa</button></div>
              {sections.map((section, index) => (
                <article key={`${index}-${section.title}`} className={section.done ? 'is-done' : ''}>
                  <label className="nd-section-check"><input type="checkbox" checked={Boolean(section.done)} onChange={(event) => updateSection(index, { done: event.target.checked })} /><input value={section.title} onChange={(event) => updateSection(index, { title: event.target.value })} aria-label="Nome da etapa" /></label>
                  <input className="nd-section-prompt" value={section.prompt || ''} onChange={(event) => updateSection(index, { prompt: event.target.value })} placeholder="Objetivo desta etapa" />
                  <textarea value={section.note || ''} onChange={(event) => updateSection(index, { note: event.target.value })} placeholder="Escreva aqui..." />
                  <button type="button" className="nd-remove-section" aria-label="Remover etapa" onClick={() => setDraft((current) => ({ ...current, sections: current.sections.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={14} /></button>
                </article>
              ))}
            </section>
          </main>
        </div>

        <footer className="nd-drawer-footer">
          <button type="button" className="nd-secondary" onClick={onClose}>Fechar</button>
          <button type="button" className="nd-primary" onClick={onSave} disabled={saving || uploading}><Save size={15} />{saving ? 'Salvando...' : 'Salvar card'}</button>
        </footer>
      </aside>
    </div>
  );
}

export default function NotionDevelopmentBoard({ client, ideas = [], currentUser, updateState, onOpenStudio, onSchedule }) {
  const [platform, setPlatform] = useState('all');
  const [viewMode, setViewMode] = useState('pipeline');
  const [cards, setCards] = useState([]);
  const [templates, setTemplates] = useState(templateFallbacks);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('lead_magnet_post');
  const [newTitle, setNewTitle] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [editorDraft, setEditorDraft] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pointerCardId, setPointerCardId] = useState('');
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (!client?.functions?.invoke) throw new Error('Supabase nao esta conectado no frontend.');
      const { data, error: functionError } = await client.functions.invoke('notion-development-board', {
        body: { owner: 'victor' },
      });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || 'A funcao do Notion nao retornou sucesso.');
      setCards((data.items || []).map(normalizeNotionContentPage));
      if (Array.isArray(data.templates) && data.templates.length) setTemplates(data.templates);
      setSource(data.source || null);
      if (data.warning) setNotice(data.warning);
    } catch (err) {
      setError(err?.message || String(err));
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const createFromTemplate = useCallback(async () => {
    setCreating(true);
    setError('');
    try {
      if (!client?.functions?.invoke) throw new Error('Supabase nao esta conectado no frontend.');
      const { data, error: functionError } = await client.functions.invoke('notion-development-board', {
        body: {
          owner: 'victor',
          action: 'create_item',
          templateKey: selectedTemplate,
          title: newTitle,
          assignedToFelipe: true,
        },
      });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || 'Nao consegui criar o card.');
      setNewTitle('');
      setCreateOpen(false);
      await loadBoard();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setCreating(false);
    }
  }, [client, loadBoard, newTitle, selectedTemplate]);

  const openCard = useCallback(async (card) => {
    let editableCard = card;
    try {
      if (card.sourceType === 'notion') {
        const { data, error: functionError } = await client.functions.invoke('notion-development-board', {
          body: { owner: 'victor', action: 'promote_item', id: card.id },
        });
        if (functionError) throw functionError;
        if (!data?.success) throw new Error(data?.error || 'Nao consegui importar este card.');
        editableCard = normalizeNotionContentPage(data.item);
        setCards((current) => [editableCard, ...current.filter((item) => item.id !== card.id)]);
      }
      setSelectedCard(editableCard);
      setEditorDraft({
        title: editableCard.title,
        status: editableCard.status,
        publishDate: editableCard.publishDate || '',
        templateKey: inferTemplate(editableCard, templates)?.key || 'linkedin_post',
        description: editableCard.description || '',
        sections: templateSectionsForCard(editableCard, templates),
        attachments: editableCard.attachments || [],
      });
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [client, templates]);

  const saveCardSections = useCallback(async () => {
    if (!selectedCard) return;
    setSaving(true);
    setError('');
    try {
      const { data, error: functionError } = await client.functions.invoke('notion-development-board', {
        body: {
          owner: 'victor',
          action: 'update_item',
          id: selectedCard.id,
          title: editorDraft.title,
          status: editorDraft.status,
          publishDate: editorDraft.publishDate || null,
          templateKey: editorDraft.templateKey,
          description: editorDraft.description,
          sections: editorDraft.sections,
          attachments: editorDraft.attachments,
        },
      });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || 'Nao consegui salvar o card.');
      const normalized = normalizeNotionContentPage(data.item);
      setCards((current) => current.map((card) => (card.id === normalized.id ? normalized : card)));
      setSelectedCard(normalized);
      setEditorDraft((current) => ({ ...current, sections: normalized.sections, attachments: normalized.attachments || [] }));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }, [client, editorDraft, selectedCard]);

  const uploadImage = useCallback(async (event) => {
    const file = event.clipboardData?.files?.[0] || event.target?.files?.[0];
    if (!file || !file.type.startsWith('image/') || !selectedCard) return;
    event.preventDefault?.();
    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data, error: functionError } = await client.functions.invoke('notion-development-board', { body: { owner: 'victor', action: 'upload_attachment', id: selectedCard.id, name: file.name, mimeType: file.type, base64 } });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || 'Nao consegui enviar a imagem.');
      setEditorDraft((current) => ({ ...current, attachments: [...current.attachments, data.attachment] }));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setUploading(false);
      if (event.target?.value) event.target.value = '';
    }
  }, [client, selectedCard]);

  const removeImage = useCallback(async (attachment, index) => {
    setEditorDraft((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }));
    if (!attachment?.path) return;
    try {
      const { data, error: functionError } = await client.functions.invoke('notion-development-board', { body: { owner: 'victor', action: 'delete_attachment', path: attachment.path } });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || 'Nao consegui remover a imagem.');
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [client]);

  const moveCard = useCallback(async (card, status) => {
    try {
      let editable = card;
      if (card.sourceType === 'notion') {
        const { data, error: promoteError } = await client.functions.invoke('notion-development-board', { body: { owner: 'victor', action: 'promote_item', id: card.id } });
        if (promoteError) throw promoteError;
        editable = normalizeNotionContentPage(data.item);
      }
      const { data, error: updateError } = await client.functions.invoke('notion-development-board', { body: { owner: 'victor', action: 'update_item', id: editable.id, status } });
      if (updateError) throw updateError;
      const updated = normalizeNotionContentPage(data.item);
      setCards((current) => [updated, ...current.filter((item) => item.id !== card.id && item.id !== updated.id)]);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [client]);

  const dragCard = useCallback((event, card) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-content-card', card.id);
  }, []);

  const dropCard = useCallback((event, status) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('application/x-content-card');
    const card = cards.find((item) => item.id === id);
    if (card && card.status !== status) moveCard(card, status);
  }, [cards, moveCard]);

  const pointerDropCard = useCallback((status) => {
    const card = cards.find((item) => item.id === pointerCardId);
    setPointerCardId('');
    if (card && card.status !== status) moveCard(card, status);
  }, [cards, moveCard, pointerCardId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const visibleCards = useMemo(() => filterCardsByPlatform(cards, platform), [cards, platform]);
  const grouped = useMemo(() => groupCardsByStatus(visibleCards), [visibleCards]);

  const boardStatuses = useMemo(() => DEVELOPMENT_STATUSES.filter((status) => {
    if ((grouped[status] || []).length) return true;
    return status !== 'Published';
  }), [grouped]);

  return (
    <div className="notion-development">
      <header className="nd-header">
        <div>
          <span className="nd-eyebrow">Victor Baggio</span>
          <h1>Produção de conteúdo</h1>
          <p>Planeje, produza e acompanhe cada peça em um só lugar.</p>
        </div>
        <div className="nd-header-actions">
          <button type="button" className="nd-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} />
            Novo conteudo
          </button>
          <button type="button" className="nd-refresh" onClick={loadBoard} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Atualizar
          </button>
        </div>
      </header>

      <div className="nd-toolbar">
        <div className="nd-view-tabs" role="tablist" aria-label="Visualizacao">
          {[
            ['pipeline', KanbanSquare, 'Quadro'],
            ['platform', LayoutList, 'Matriz por plataforma'],
            ['calendar', Calendar, 'Calendário'],
            ['ideas', Lightbulb, 'Ideias'],
          ].map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              className={viewMode === mode ? 'active' : ''}
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="nd-toolbar-side">
          <div className="nd-platform-tabs" role="group" aria-label="Filtrar por plataforma">
            {['all', ...PLATFORM_ORDER].map((item) => (
              <button key={item} type="button" className={platform === item ? 'active' : ''} onClick={() => setPlatform(item)}>
                {platformLabels[item] || item}
              </button>
            ))}
          </div>
          {source?.pageUrl && <a className="nd-open-notion" href={source.pageUrl} target="_blank" rel="noreferrer" aria-label="Abrir Notion"><ExternalLink size={14} /></a>}
        </div>
      </div>

      {error && (
        <div className="nd-error">
          <AlertCircle size={17} />
          <div>
            <strong>Nao consegui concluir a acao.</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {!error && notice && (
        <div className="nd-notice">
          <AlertCircle size={17} />
          <div>
            <strong>Sincronização com o Notion pausada</strong>
            <span>O quadro continua funcionando com os dados salvos no sistema.</span>
            <details><summary>Detalhes</summary><p>{notice}</p></details>
          </div>
        </div>
      )}

      {loading && !cards.length ? (
        <div className="nd-loading"><RefreshCw className="spin" size={18} /> Carregando calendario...</div>
      ) : (
        viewMode === 'ideas' ? <IdeaProductionWorkspace ideas={ideas} currentUser={currentUser} updateState={updateState} onOpenStudio={onOpenStudio} onSchedule={onSchedule} /> :
        viewMode === 'platform' ? <PlatformBoard cards={visibleCards} statuses={boardStatuses} onOpen={openCard} onDragStart={dragCard} onPointerStart={(card) => setPointerCardId(card.id)} onDropStatus={dropCard} onPointerDrop={pointerDropCard} /> :
        viewMode === 'calendar' ? <CalendarView cards={visibleCards} onOpen={openCard} /> :
        <section className="nd-board" aria-label="Kanban de desenvolvimento">
          {boardStatuses.map((status) => {
            const rows = grouped[status] || [];
            return (
              <div className={`nd-column status-${slug(status)}`} key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropCard(event, status)} onPointerUp={() => pointerDropCard(status)}>
                <div className="nd-column-header">
                  <div>
                    <strong>{statusLabels[status] || status}</strong>
                    <small>{statusDetails[status] || 'Etapa do calendario'}</small>
                  </div>
                  <span>{rows.length}</span>
                </div>
                <div className="nd-column-body">
                  {rows.length ? rows.map((card) => <BoardCard key={card.id} card={card} onOpen={openCard} onDragStart={dragCard} onPointerStart={(item) => setPointerCardId(item.id)} />) : (
                    <div className="nd-empty">
                      <Calendar size={15} />
                      Sem cards
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {createOpen && createPortal(
        <CreateModal
          templates={templates}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          creating={creating}
          onCreate={createFromTemplate}
          onClose={() => setCreateOpen(false)}
        />,
        document.body,
      )}

      {selectedCard && editorDraft && createPortal(
        <CardDrawer
          card={selectedCard}
          templates={templates}
          draft={editorDraft}
          setDraft={setEditorDraft}
          saving={saving}
          uploading={uploading}
          onUpload={uploadImage}
          onRemoveAttachment={removeImage}
          onSave={saveCardSections}
          onClose={() => setSelectedCard(null)}
        />,
        document.body,
      )}
    </div>
  );
}
