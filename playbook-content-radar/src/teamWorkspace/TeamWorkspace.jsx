import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  AlertCircle,
  BookOpenText,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  LayoutDashboard,
  Lightbulb,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Video,
  Wifi,
  X
} from 'lucide-react';
import './teamWorkspace.css';

const STATUSES = [
  { id: 'todo', label: 'Pra fazer', description: 'Tudo que precisa de atenção', icon: Circle },
  { id: 'doing', label: 'Fazendo', description: 'O que está em andamento', icon: Clock3 },
  { id: 'done', label: 'Feito', description: 'Trabalho concluído', icon: CheckCircle2 }
];

const NOTE_KINDS = {
  day: { label: 'Meu dia', icon: CalendarDays },
  meeting: { label: 'Reunião', icon: Video },
  idea: { label: 'Ideia', icon: Lightbulb }
};

const priorityLabel = { low: 'Baixa', normal: 'Normal', high: 'Alta' };
const TEAM_WORKSPACE_ROOT_ID = 'team-workspace-root';

function createId() {
  return globalThis.crypto?.randomUUID?.() || `team-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function upsertById(rows, row) {
  const exists = rows.some((item) => item.id === row.id);
  return exists ? rows.map((item) => item.id === row.id ? { ...item, ...row } : item) : [row, ...rows];
}

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${date}T12:00:00`))
    .replace('.', '');
}

function relativeTime(value) {
  if (!value) return 'agora';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 45) return 'agora';
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function UserAvatar({ name, avatars, size = 28 }) {
  return (
    <img
      className="tw-avatar"
      src={avatars?.[name]}
      alt={name}
      title={name}
      style={{ width: size, height: size }}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=172554&color=fff&bold=true`;
      }}
    />
  );
}

function TaskCard({ task, avatars, onEdit, onDelete, onToggleDone, overlay = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pointerStartRef = useRef(null);
  const draggedRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: overlay
  });
  const style = transform && !overlay
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`tw-task-card ${task.status === 'done' ? 'completed' : ''} ${isDragging ? 'dragging' : ''} ${overlay ? 'overlay' : ''}`}
      onPointerDownCapture={(event) => { pointerStartRef.current = { x: event.clientX, y: event.clientY }; draggedRef.current = false; }}
      onPointerUpCapture={(event) => {
        if (!pointerStartRef.current) return;
        draggedRef.current = Math.hypot(event.clientX - pointerStartRef.current.x, event.clientY - pointerStartRef.current.y) > 6;
        pointerStartRef.current = null;
      }}
      onClick={() => {
        if (draggedRef.current) { draggedRef.current = false; return; }
        onEdit?.(task);
      }}
      {...(!overlay ? listeners : {})}
      {...(!overlay ? attributes : {})}
      role="group"
      aria-label={`Tarefa ${task.title}. Arraste para mover.`}
    >
      <div className="tw-task-card-top">
        <span className={`tw-priority ${task.priority}`}>{priorityLabel[task.priority] || 'Normal'}</span>
        {!overlay && (
          <div className="tw-card-menu-wrap">
            <button type="button" className="tw-card-menu-trigger" aria-label={`Opções de ${task.title}`} aria-expanded={menuOpen} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }}><MoreHorizontal size={17} /></button>
            {menuOpen && (
              <div className="tw-card-menu" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => { setMenuOpen(false); onEdit?.(task); }}><Pencil size={13} /> Editar</button>
                <button type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete?.(task); }}><Trash2 size={13} /> Excluir</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="tw-task-title-row">
        <button
          type="button"
          className={`tw-task-check ${task.status === 'done' ? 'checked' : ''}`}
          aria-label={task.status === 'done' ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onToggleDone?.(task); }}
        >
          {task.status === 'done' && <Check size={13} strokeWidth={3} />}
        </button>
        <h3>{task.title}</h3>
      </div>
      {task.description && <p>{task.description}</p>}
      <footer>
        <div className="tw-card-person">
          <UserAvatar name={task.assignee} avatars={avatars} size={25} />
          <span>{task.assignee}</span>
        </div>
        {task.due_date && (
          <span className={`tw-due ${new Date(`${task.due_date}T23:59:59`) < new Date() && task.status !== 'done' ? 'late' : ''}`}>
            <CalendarDays size={13} /> {formatDate(task.due_date)}
          </span>
        )}
      </footer>
    </article>
  );
}

function KanbanColumn({ column, tasks, avatars, onEdit, onDelete, onToggleDone, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const Icon = column.icon;
  return (
    <section ref={setNodeRef} className={`tw-column ${column.id} ${isOver ? 'over' : ''}`}>
      <header className="tw-column-header">
        <div className="tw-column-title">
          <span className="tw-column-icon"><Icon size={16} /></span>
          <div><h2>{column.label}</h2><p>{column.description}</p></div>
        </div>
        <span className="tw-column-count">{tasks.length}</span>
      </header>
      <div className="tw-column-body">
        {tasks.map((task) => <TaskCard key={task.id} task={task} avatars={avatars} onEdit={onEdit} onDelete={onDelete} onToggleDone={onToggleDone} />)}
        {tasks.length === 0 && (
          <div className="tw-column-empty"><Check size={18} /><span>Solte uma tarefa aqui</span></div>
        )}
      </div>
      <button type="button" className="tw-column-add" onClick={() => onAdd(column.id)}>
        <Plus size={15} /> Adicionar tarefa
      </button>
    </section>
  );
}

function TaskModal({ task, initialStatus, currentUser, onClose, onSave, onDelete, busy }) {
  const [form, setForm] = useState(() => ({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || initialStatus || 'todo',
    priority: task?.priority || 'normal',
    assignee: task?.assignee || 'Felipe',
    due_date: task?.due_date || ''
  }));

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="tw-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="tw-task-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => { event.preventDefault(); if (form.title.trim()) onSave(form); }}
      >
        <header>
          <div><span>{task ? 'Editar tarefa' : 'Nova tarefa'}</span><h2>{task ? 'Atualize os detalhes' : 'O que precisa ser feito?'}</h2></div>
          <button type="button" className="tw-icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>
        </header>
        <label className="tw-field tw-field-wide">
          <span>Título</span>
          <input autoFocus value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Ex.: Preparar pauta da reunião" maxLength={180} />
        </label>
        <label className="tw-field tw-field-wide">
          <span>Detalhes</span>
          <textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Contexto, links e o resultado esperado…" rows={4} />
        </label>
        <div className="tw-form-grid">
          <label className="tw-field"><span>Responsável</span><select value={form.assignee} onChange={(event) => update('assignee', event.target.value)}><option>Felipe</option><option>Victor</option><option>Fernando</option></select></label>
          <label className="tw-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}>{STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label className="tw-field"><span>Prioridade</span><select value={form.priority} onChange={(event) => update('priority', event.target.value)}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option></select></label>
          <label className="tw-field"><span>Prazo</span><input type="date" value={form.due_date} onChange={(event) => update('due_date', event.target.value)} /></label>
        </div>
        <div className="tw-modal-meta">Criada por {task?.created_by || currentUser}</div>
        <footer>
          {task ? <button type="button" className="tw-delete-button" disabled={busy} onClick={() => onDelete(task)}><Trash2 size={15} /> Excluir</button> : <span />}
          <div><button type="button" className="tw-secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="tw-primary-button" disabled={busy || !form.title.trim()}>{busy ? 'Salvando…' : 'Salvar tarefa'}</button></div>
        </footer>
      </form>
    </div>
  );
}

function Notebook({ notes, activeId, setActiveId, draft, onDraftChange, onCreate, onDelete, saveState, avatars }) {
  const active = notes.find((note) => note.id === activeId);
  const checklist = Array.isArray(draft.checklist) ? draft.checklist : [];
  const updateChecklist = (id, patch) => onDraftChange({ ...draft, checklist: checklist.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const addChecklistItem = () => onDraftChange({ ...draft, checklist: [...checklist, { id: createId(), text: '', done: false }] });
  const removeChecklistItem = (id) => onDraftChange({ ...draft, checklist: checklist.filter((item) => item.id !== id) });

  return (
    <div className="tw-notebook">
      <aside className="tw-notes-list">
        <div className="tw-notes-list-head">
          <div><span>Caderno</span><strong>{notes.length} {notes.length === 1 ? 'nota' : 'notas'}</strong></div>
          <button type="button" className="tw-icon-button" onClick={onCreate} aria-label="Criar anotação"><Plus size={18} /></button>
        </div>
        <div className="tw-notes-scroll">
          {notes.map((note) => {
            const meta = NOTE_KINDS[note.kind] || NOTE_KINDS.day;
            const Icon = meta.icon;
            return (
              <button key={note.id} type="button" className={`tw-note-row ${activeId === note.id ? 'active' : ''}`} onClick={() => setActiveId(note.id)}>
                <span className={`tw-note-kind ${note.kind}`}><Icon size={14} /></span>
                <span className="tw-note-row-copy"><strong>{note.title || 'Sem título'}</strong><small>{note.content?.trim().split('\n')[0] || note.checklist?.find((item) => !item.done)?.text || 'Comece a escrever…'}</small><em>{relativeTime(note.updated_at)} · {note.updated_by}</em></span>
              </button>
            );
          })}
          {notes.length === 0 && <div className="tw-notes-empty"><BookOpenText size={25} /><strong>Seu caderno começa aqui</strong><span>Crie uma nota para o dia, reunião ou ideia.</span></div>}
        </div>
      </aside>

      <section className="tw-editor">
        {active ? (
          <>
            <header className="tw-editor-topbar">
              <div className="tw-kind-picker">
                {Object.entries(NOTE_KINDS).map(([key, meta]) => {
                  const Icon = meta.icon;
                  return <button key={key} type="button" className={draft.kind === key ? 'active' : ''} onClick={() => onDraftChange({ ...draft, kind: key })}><Icon size={14} /> {meta.label}</button>;
                })}
              </div>
              <div className={`tw-save-state ${saveState}`}><span className="tw-save-dot" />{saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Erro ao salvar' : 'Salvo ao vivo'}</div>
            </header>
            <div className="tw-paper">
              <input className="tw-note-title" value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Título da anotação" maxLength={180} />
              <div className="tw-note-byline"><UserAvatar name={active.updated_by} avatars={avatars} size={22} /><span>Editado por {active.updated_by} · {relativeTime(active.updated_at)}</span></div>
              <textarea className="tw-note-content" value={draft.content} onChange={(event) => onDraftChange({ ...draft, content: event.target.value })} placeholder={'Escreva livremente…\n\n• Decisões da reunião\n• Próximos passos\n• Ideias e lembretes'} />
              <section className="tw-checklist" aria-label="Lista de tarefas da anotação">
                <div className="tw-checklist-head">
                  <strong>To-dos</strong>
                  {checklist.length > 0 && <span>{checklist.filter((item) => item.done).length}/{checklist.length} concluídos</span>}
                </div>
                <div className="tw-checklist-items">
                  {checklist.map((item) => (
                    <div key={item.id} className={`tw-checklist-item ${item.done ? 'done' : ''}`}>
                      <button type="button" className={`tw-note-check ${item.done ? 'checked' : ''}`} aria-label={item.done ? 'Marcar como pendente' : 'Marcar como concluído'} onClick={() => updateChecklist(item.id, { done: !item.done })}>{item.done && <Check size={13} strokeWidth={3} />}</button>
                      <input value={item.text} onChange={(event) => updateChecklist(item.id, { text: event.target.value })} placeholder="Digite uma tarefa…" />
                      <button type="button" className="tw-checklist-remove" aria-label="Remover item" onClick={() => removeChecklistItem(item.id)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <button type="button" className="tw-checklist-add" onClick={addChecklistItem}><Plus size={14} /> Adicionar item</button>
              </section>
            </div>
            <footer className="tw-editor-footer">
              <span><Wifi size={13} /> Quem estiver nesta página vê suas mudanças ao vivo</span>
              <button type="button" className="tw-note-delete" onClick={() => onDelete(active)}><Trash2 size={14} /> Excluir nota</button>
            </footer>
          </>
        ) : (
          <div className="tw-editor-placeholder"><div><BookOpenText size={30} /><h2>Um lugar para pensar</h2><p>Registre reuniões, decisões, ideias e tudo que você precisa lembrar.</p><button type="button" className="tw-primary-button" onClick={onCreate}><Plus size={15} /> Criar primeira nota</button></div></div>
        )}
      </section>
    </div>
  );
}

export default function TeamWorkspace({ client, currentUser, avatars = {} }) {
  const [section, setSection] = useState('kanban');
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [draft, setDraft] = useState({ title: '', content: '', kind: 'day', checklist: [] });
  const [activeTask, setActiveTask] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [connection, setConnection] = useState('connecting');
  const [onlineUsers, setOnlineUsers] = useState([currentUser]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [remoteCursors, setRemoteCursors] = useState({});
  const workspaceRef = useRef(null);
  const channelRef = useRef(null);
  const lastCursorSentRef = useRef(0);
  const saveTimerRef = useRef(null);
  const activeNoteIdRef = useRef(null);
  const tasksRef = useRef([]);
  const notesRef = useRef([]);
  const saveStateRef = useRef('saved');
  const lastRemoteUpdateRef = useRef('');
  const sessionIdRef = useRef(`${currentUser}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  activeNoteIdRef.current = activeNoteId;
  tasksRef.current = tasks;
  notesRef.current = notes;
  saveStateRef.current = saveState;

  const persistWorkspace = async (nextTasks = tasksRef.current, nextNotes = notesRef.current) => {
    const { error: persistError } = await client
      .from('idea_development_workspaces')
      .update({ copy_variants: nextTasks, attachments: nextNotes, updated_by: currentUser, updated_at: new Date().toISOString() })
      .eq('idea_id', TEAM_WORKSPACE_ROOT_ID);
    return persistError;
  };

  const loadWorkspace = async () => {
    setLoading(true);
    setError('');
    let result = await client
      .from('idea_development_workspaces')
      .select('copy_variants, attachments, updated_at')
      .eq('idea_id', TEAM_WORKSPACE_ROOT_ID)
      .maybeSingle();

    if (!result.data && !result.error) {
      const rootIdea = {
        id: TEAM_WORKSPACE_ROOT_ID,
        title: 'Espaço compartilhado do time',
        linkedin_url: 'workspace://tarefas-e-notas',
        source_author: 'Playbook Lab',
        author_headline: 'Registro interno do sistema',
        summary: 'Base técnica das tarefas e anotações compartilhadas.',
        playbook_angle: 'Não exibir na curadoria.',
        category: 'Interno',
        content_type: 'Sistema',
        initial_priority: 'baixa',
        internal_notes: 'system:team-workspace',
        status: 'arquivado',
        mock_likes: 0,
        mock_comments_count: 0,
        mock_reposts_count: 0
      };
      const { error: ideaError } = await client.from('ideas').upsert(rootIdea, { onConflict: 'id' });
      if (!ideaError) {
        await client.from('idea_development_workspaces').insert({ idea_id: TEAM_WORKSPACE_ROOT_ID, copy_variants: [], attachments: [], canvas_blocks: [], feedback: [], updated_by: currentUser });
        result = await client.from('idea_development_workspaces').select('copy_variants, attachments, updated_at').eq('idea_id', TEAM_WORKSPACE_ROOT_ID).maybeSingle();
      } else result = { data: null, error: ideaError };
    }

    if (result.error || !result.data) setError('Não foi possível abrir o espaço compartilhado agora. Tente atualizar a página.');
    else {
      const loadedTasks = Array.isArray(result.data.copy_variants) ? result.data.copy_variants : [];
      const loadedNotes = Array.isArray(result.data.attachments) ? result.data.attachments : [];
      setTasks(loadedTasks);
      setNotes(loadedNotes);
      lastRemoteUpdateRef.current = result.data.updated_at || '';
      setActiveNoteId((current) => current || loadedNotes[0]?.id || null);
    }
    setLoading(false);
  };

  useEffect(() => { loadWorkspace(); }, []);

  useEffect(() => {
    const channel = client
      .channel('team-workspace-live', { config: { presence: { key: sessionIdRef.current } } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'idea_development_workspaces', filter: `idea_id=eq.${TEAM_WORKSPACE_ROOT_ID}` }, ({ new: next }) => {
        lastRemoteUpdateRef.current = next.updated_at || '';
        if (Array.isArray(next.copy_variants)) setTasks(next.copy_variants);
        if (Array.isArray(next.attachments)) setNotes(next.attachments);
      })
      .on('broadcast', { event: 'note-draft' }, ({ payload }) => {
        if (!payload || payload.sessionId === sessionIdRef.current) return;
        const incoming = { id: payload.id, title: payload.title, content: payload.content, kind: payload.kind, checklist: payload.checklist || [], updated_by: payload.updatedBy, updated_at: payload.updatedAt };
        setNotes((rows) => upsertById(rows, incoming));
        if (activeNoteIdRef.current === payload.id) setDraft({ title: payload.title, content: payload.content, kind: payload.kind, checklist: payload.checklist || [] });
      })
      .on('broadcast', { event: 'tasks-sync' }, ({ payload }) => {
        if (!payload || payload.sessionId === sessionIdRef.current || !Array.isArray(payload.tasks)) return;
        setTasks(payload.tasks);
      })
      .on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
        if (!payload || payload.sessionId === sessionIdRef.current) return;
        setRemoteCursors((current) => ({ ...current, [payload.sessionId]: payload }));
      })
      .on('broadcast', { event: 'cursor-leave' }, ({ payload }) => {
        if (!payload || payload.sessionId === sessionIdRef.current) return;
        setRemoteCursors((current) => { const next = { ...current }; delete next[payload.sessionId]; return next; });
      })
      .on('presence', { event: 'sync' }, () => {
        const sessions = Object.values(channel.presenceState()).flat();
        const users = sessions.map((entry) => entry.user).filter(Boolean);
        setOnlineUsers([...new Set(users)]);
        setOnlineCount(Math.max(1, sessions.length));
      })
      .subscribe(async (status) => {
        setConnection(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'connecting');
        if (status === 'SUBSCRIBED') await channel.track({ user: currentUser, sessionId: sessionIdRef.current, online_at: new Date().toISOString() });
      });

    channelRef.current = channel;
    return () => { channelRef.current = null; client.removeChannel(channel); };
  }, [client, currentUser]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 3500;
      setRemoteCursors((current) => {
        const active = Object.entries(current).filter(([, cursor]) => Number(cursor.updatedAt) >= cutoff);
        return active.length === Object.keys(current).length ? current : Object.fromEntries(active);
      });
    }, 1500);
    return () => window.clearInterval(interval);
  }, []);

  // Se o WebSocket estiver temporariamente indisponível, esta leitura leve mantém
  // as telas próximas em sincronia sem exigir refresh manual.
  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (saveStateRef.current === 'saving') return;
      const { data } = await client
        .from('idea_development_workspaces')
        .select('copy_variants, attachments, updated_at')
        .eq('idea_id', TEAM_WORKSPACE_ROOT_ID)
        .maybeSingle();
      if (!data || !data.updated_at || data.updated_at === lastRemoteUpdateRef.current) return;
      lastRemoteUpdateRef.current = data.updated_at;
      if (Array.isArray(data.copy_variants)) setTasks(data.copy_variants);
      if (Array.isArray(data.attachments)) {
        setNotes(data.attachments);
        const active = data.attachments.find((note) => note.id === activeNoteIdRef.current);
        if (active) setDraft({ title: active.title || '', content: active.content || '', kind: active.kind || 'day', checklist: Array.isArray(active.checklist) ? active.checklist : [] });
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [client]);

  const selectedNote = notes.find((note) => note.id === activeNoteId);
  useEffect(() => {
    if (selectedNote) setDraft({ title: selectedNote.title || '', content: selectedNote.content || '', kind: selectedNote.kind || 'day', checklist: Array.isArray(selectedNote.checklist) ? selectedNote.checklist : [] });
  }, [activeNoteId]);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const grouped = useMemo(() => Object.fromEntries(STATUSES.map((status) => [status.id, tasks.filter((task) => task.status === status.id).sort((a, b) => Number(b.position) - Number(a.position))])), [tasks]);

  const openNewTask = (status = 'todo') => setModal({ type: 'new', status });
  const openTask = (task) => setModal({ type: 'edit', task });
  const broadcastTasks = (nextTasks) => channelRef.current?.send({ type: 'broadcast', event: 'tasks-sync', payload: { tasks: nextTasks, sessionId: sessionIdRef.current } });

  const saveTask = async (form) => {
    setBusy(true);
    setError('');
    const now = new Date().toISOString();
    const payload = { ...form, title: form.title.trim(), description: form.description.trim(), due_date: form.due_date || null, updated_at: now, position: Date.now() };
    const savedTask = modal.type === 'edit'
      ? { ...modal.task, ...payload }
      : { id: createId(), created_at: now, created_by: currentUser, ...payload };
    const previous = tasksRef.current;
    const nextTasks = upsertById(previous, savedTask);
    setTasks(nextTasks);
    broadcastTasks(nextTasks);
    const saveError = await persistWorkspace(nextTasks, notesRef.current);
    if (saveError) { setTasks(previous); broadcastTasks(previous); setError('Não consegui salvar essa tarefa. Tente novamente.'); }
    else setModal(null);
    setBusy(false);
  };

  const deleteTask = async (task) => {
    if (!window.confirm(`Excluir a tarefa “${task.title}”?`)) return;
    setBusy(true);
    const previous = tasksRef.current;
    const nextTasks = previous.filter((row) => row.id !== task.id);
    setTasks(nextTasks);
    broadcastTasks(nextTasks);
    const deleteError = await persistWorkspace(nextTasks, notesRef.current);
    if (deleteError) { setTasks(previous); broadcastTasks(previous); setError('Não consegui excluir essa tarefa.'); }
    else setModal(null);
    setBusy(false);
  };

  const moveTask = async (task, status) => {
    if (!task || task.status === status) return;
    const previous = task;
    const next = { ...task, status, position: Date.now(), updated_at: new Date().toISOString() };
    const nextTasks = upsertById(tasksRef.current, next);
    setTasks(nextTasks);
    broadcastTasks(nextTasks);
    const moveError = await persistWorkspace(nextTasks, notesRef.current);
    if (moveError) { const restored = upsertById(tasksRef.current, previous); setTasks(restored); broadcastTasks(restored); setError('A tarefa não foi movida. Tente novamente.'); }
  };

  const toggleTaskDone = (task) => moveTask(task, task.status === 'done' ? 'todo' : 'done');

  const createNote = async () => {
    setError('');
    const now = new Date().toISOString();
    const note = { id: createId(), title: 'Nova anotação', content: '', kind: 'day', checklist: [], created_by: currentUser, updated_by: currentUser, created_at: now, updated_at: now };
    const previous = notesRef.current;
    const nextNotes = upsertById(previous, note);
    setNotes(nextNotes);
    setActiveNoteId(note.id);
    setSection('notes');
    const createError = await persistWorkspace(tasksRef.current, nextNotes);
    if (createError) { setNotes(previous); setActiveNoteId(previous[0]?.id || null); setError('Não consegui criar a anotação. Tente novamente.'); }
  };

  const changeDraft = (next) => {
    if (!activeNoteId) return;
    const updatedAt = new Date().toISOString();
    setDraft(next);
    setSaveState('saving');
    const nextNotes = notesRef.current.map((note) => note.id === activeNoteId ? { ...note, ...next, updated_by: currentUser, updated_at: updatedAt } : note);
    setNotes(nextNotes);
    channelRef.current?.send({ type: 'broadcast', event: 'note-draft', payload: { id: activeNoteId, ...next, updatedBy: currentUser, updatedAt, sessionId: sessionIdRef.current } });
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const saveError = await persistWorkspace(tasksRef.current, nextNotes);
      setSaveState(saveError ? 'error' : 'saved');
    }, 550);
  };

  const deleteNote = async (note) => {
    if (!window.confirm(`Excluir a anotação “${note.title || 'Sem título'}”?`)) return;
    clearTimeout(saveTimerRef.current);
    const previous = notesRef.current;
    const remaining = previous.filter((item) => item.id !== note.id);
    setNotes(remaining);
    setActiveNoteId(remaining[0]?.id || null);
    const deleteError = await persistWorkspace(tasksRef.current, remaining);
    if (deleteError) { setNotes(previous); setActiveNoteId(note.id); setError('Não consegui excluir a anotação.'); }
    else {
      setSaveState('saved');
    }
  };

  const completed = tasks.filter((task) => task.status === 'done').length;

  const shareCursor = (event) => {
    if (!channelRef.current || Date.now() - lastCursorSentRef.current < 45) return;
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return;
    lastCursorSentRef.current = Date.now();
    channelRef.current.send({
      type: 'broadcast',
      event: 'cursor-move',
      payload: {
        sessionId: sessionIdRef.current,
        user: currentUser,
        x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
        updatedAt: Date.now()
      }
    });
  };

  const stopSharingCursor = () => channelRef.current?.send({ type: 'broadcast', event: 'cursor-leave', payload: { sessionId: sessionIdRef.current } });

  return (
    <div ref={workspaceRef} className="tw-workspace" onPointerMove={shareCursor} onPointerLeave={stopSharingCursor}>
      <div className="tw-remote-cursors" aria-hidden="true">
        {Object.values(remoteCursors).map((cursor) => (
          <div key={cursor.sessionId} className="tw-remote-cursor" style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}>
            <svg viewBox="0 0 24 24"><path d="M4.2 2.8 19 12.2l-6.7 1.1-3.6 6.2z" /></svg>
            <span>{cursor.user}</span>
          </div>
        ))}
      </div>
      <header className="tw-hero">
        <div className="tw-hero-copy">
          <span className="tw-eyebrow">Espaço do time</span>
          <h1>Tarefas & anotações</h1>
          <p>Um lugar simples para todo mundo saber o que precisa acontecer — e registrar o que não pode se perder.</p>
        </div>
        <div className="tw-live-panel">
          <div className="tw-presence-stack">
            {onlineUsers.slice(0, 3).map((name) => <span key={name} className="tw-presence-avatar"><UserAvatar name={name} avatars={avatars} size={31} /><i /></span>)}
          </div>
          <div><strong>{onlineCount > 1 ? `${onlineCount} sessões ao vivo` : `${onlineUsers[0] || currentUser} está aqui`}</strong><span className={`tw-connection ${connection}`}><i />{connection === 'live' ? 'Tudo sincronizado ao vivo' : connection === 'error' ? 'Conexão interrompida' : 'Conectando…'}</span></div>
        </div>
      </header>

      <div className="tw-toolbar">
        <div className="tw-tabs" role="tablist" aria-label="Tarefas e caderno">
          <button type="button" role="tab" aria-selected={section === 'kanban'} className={section === 'kanban' ? 'active' : ''} onClick={() => setSection('kanban')}><LayoutDashboard size={16} /> Kanban <span>{tasks.length}</span></button>
          <button type="button" role="tab" aria-selected={section === 'notes'} className={section === 'notes' ? 'active' : ''} onClick={() => setSection('notes')}><BookOpenText size={16} /> Caderno <span>{notes.length}</span></button>
        </div>
        <div className="tw-toolbar-actions">
          {section === 'kanban' && tasks.length > 0 && <span className="tw-progress-copy"><CheckCircle2 size={15} /> {completed} de {tasks.length} concluídas</span>}
          <button type="button" className="tw-primary-button" onClick={section === 'kanban' ? () => openNewTask('todo') : createNote}><Plus size={15} /> {section === 'kanban' ? 'Nova tarefa' : 'Nova anotação'}</button>
        </div>
      </div>

      {error && <div className="tw-error"><AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Fechar aviso"><X size={16} /></button></div>}

      {loading ? (
        <div className="tw-loading"><span /><p>Preparando o espaço compartilhado…</p></div>
      ) : section === 'kanban' ? (
        <DndContext sensors={sensors} onDragStart={({ active }) => setActiveTask(tasks.find((task) => task.id === active.id) || null)} onDragCancel={() => setActiveTask(null)} onDragEnd={({ active, over }) => { const task = tasks.find((item) => item.id === active.id); setActiveTask(null); if (task && over && STATUSES.some((status) => status.id === over.id)) moveTask(task, String(over.id)); }}>
          <div className="tw-board">{STATUSES.map((column) => <KanbanColumn key={column.id} column={column} tasks={grouped[column.id]} avatars={avatars} onEdit={openTask} onDelete={deleteTask} onToggleDone={toggleTaskDone} onAdd={openNewTask} />)}</div>
          <DragOverlay>{activeTask ? <TaskCard task={activeTask} avatars={avatars} overlay /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <Notebook notes={notes} activeId={activeNoteId} setActiveId={setActiveNoteId} draft={draft} onDraftChange={changeDraft} onCreate={createNote} onDelete={deleteNote} saveState={saveState} avatars={avatars} />
      )}

      {modal && <TaskModal task={modal.task} initialStatus={modal.status} currentUser={currentUser} onClose={() => setModal(null)} onSave={saveTask} onDelete={deleteTask} busy={busy} />}
    </div>
  );
}

export { STATUSES, NOTE_KINDS, upsertById };
