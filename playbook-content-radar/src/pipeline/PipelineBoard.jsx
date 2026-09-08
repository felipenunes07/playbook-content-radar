import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  AlertTriangle, Ban, Building2, Calendar, Check, ExternalLink, GripVertical, Inbox,
  Mail, MessageCircle, MessageSquare, Pencil, Phone, Plus, RefreshCw, Send, User, X,
} from 'lucide-react';
import { loadContentMetrics } from '../contentMetrics/repository.js';
// Telefone e WhatsApp passam pelas MESMAS funções do resto do app: só MATCHED expõe
// número, e o link do wa.me só existe se o número está completo. Reusar aqui é o que
// garante que o card não vaze um telefone que a tela de Leads esconderia.
import { formatPhone, phoneToShow, whatsappLink } from '../contentMetrics/leadPhones.js';
// As regras vêm do MESMO módulo que a edge function usa. Reimplementar os limiares
// aqui era o caminho garantido pro board dizer "sem resposta há 7 dias" enquanto o
// servidor achava que ainda eram 3.
import {
  STAGES, STAGE_LABELS, followUpState, parseCadence, silenceState,
} from '../../supabase/functions/_shared/pipeline.ts';
import './pipelineBoard.css';

const COLUMN_HINTS = {
  a_prospectar: 'Selecionados, sem contato ainda',
  em_cadencia: 'Contato feito, aguardando resposta',
  respondeu: 'Respondeu — hora de avançar',
  reuniao: 'Reunião agendada',
  proposta: 'Proposta enviada / negociando',
  cliente: 'Contrato fechado',
  perdido: 'Trabalhado e não fechou',
};

const CHANNEL_LABELS = { linkedin: 'LinkedIn', whatsapp: 'WhatsApp', email: 'E-mail', call: 'Ligação' };

const SILENCE_BADGE = {
  nunca_contatado: { label: 'Nunca contatado', tone: 'neutral' },
  aguardando_resposta: { label: 'Aguardando resposta', tone: 'calm' },
  sem_resposta_atencao: { label: 'Sem resposta', tone: 'warn' },
  sem_resposta_alerta: { label: 'Sem resposta', tone: 'alert' },
  respondeu: null,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysAgoLabel(value) {
  if (!value) return null;
  const diff = Math.round((Date.now() - Date.parse(value)) / 86400000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  return `há ${diff} dias`;
}

// O lucide desta versão não traz ícone de marca; o logo do LinkedIn vai inline pra
// manter o link inconfundível (os outros canais usam ícones lucide normais).
function LinkedinGlyph({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

// URL do perfil: usa a que veio enriquecida e, se faltar, remonta pelo slug do /in/.
function linkedinUrl(row) {
  if (row.profile_url) return row.profile_url;
  if (row.public_identifier) return `https://www.linkedin.com/in/${row.public_identifier}`;
  return '';
}

// ── Links diretos de contato ──────────────────────────────────────────────────
// Ficam FORA do botão que abre o card (aninhar link/botão dentro de <button> é HTML
// inválido) e param a propagação do ponteiro: sem isso, arrastar em cima de um link
// dispararia o drag do card em vez de abrir o contato.
function ContactLinks({ row, className = '' }) {
  const linkedin = linkedinUrl(row);
  const phone = phoneToShow(row); // '' fora de MATCHED
  const wa = whatsappLink(row);
  const email = row.email || '';
  if (!linkedin && !phone && !wa && !email) return null;

  const stop = (e) => e.stopPropagation();
  return (
    <div className={`pb-contacts ${className}`} onPointerDown={stop} onClick={stop}>
      {linkedin && (
        <a className="pb-contact linkedin" href={linkedin} target="_blank" rel="noreferrer"
          title="Abrir perfil no LinkedIn" aria-label="LinkedIn">
          <LinkedinGlyph size={13} />
        </a>
      )}
      {wa && (
        <a className="pb-contact whatsapp" href={wa} target="_blank" rel="noreferrer"
          title={`WhatsApp · ${formatPhone(phone)}`} aria-label="WhatsApp">
          <MessageCircle size={13} />
        </a>
      )}
      {phone && (
        <a className="pb-contact phone" href={`tel:${phone}`}
          title={`Ligar · ${formatPhone(phone)}`} aria-label="Telefone">
          <Phone size={13} />
        </a>
      )}
      {email && (
        <a className="pb-contact email" href={`mailto:${email}`}
          title={`E-mail · ${email}`} aria-label="E-mail">
          <Mail size={13} />
        </a>
      )}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
function LeadCard({ row, cadence, icpName, postLabel, onOpen, onQuickTouch, busy, overlay = false }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging,
  } = useDraggable({ id: row.lead_id, data: { row }, disabled: overlay });
  const style = transform && !overlay
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const silence = silenceState({
    cadence,
    touchesDone: row.toques || 0,
    respondeu: Boolean(row.respondeu),
    diasSemResposta: row.dias_sem_resposta ?? null,
  });
  const followUp = followUpState({
    stage: row.stage, archived: Boolean(row.archived_at), respondeu: Boolean(row.respondeu),
    nextActionAt: row.next_action_at, today: todayIso(),
  });
  const badge = SILENCE_BADGE[silence];
  const totalSteps = cadence.steps.length;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`pb-card ${isDragging ? 'dragging' : ''} ${overlay ? 'overlay' : ''} ${followUp === 'atrasado' ? 'overdue' : ''}`}
    >
      {/* Alça dedicada: o arrasto vive SÓ aqui. Antes o card inteiro era draggable e
          também um botão que abre o modal — qualquer micro-movimento no clique virava
          arrasto. Separar os dois é o que faz o drag parar de "engasgar". */}
      {!overlay && (
        <div
          className="pb-drag-handle"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          title="Arraste para mover de etapa"
          aria-label="Mover card"
        >
          <GripVertical size={13} />
        </div>
      )}

      <button type="button" className="pb-card-open" onClick={() => onOpen(row)} title="Abrir detalhes">
        <header className="pb-card-head">
          <strong>{row.full_name || 'Sem nome'}</strong>
          {row.owner && <span className="pb-owner" title={`Responsável: ${row.owner}`}>{row.owner.split(' ')[0]}</span>}
        </header>
        <p className="pb-card-sub">
          {row.job_title || 'Cargo desconhecido'}
          {row.company_name ? ` · ${row.company_name}` : ''}
          {row.company_size ? ` (${row.company_size})` : ''}
        </p>
        <div className="pb-card-tags">
          {icpName && <span className="pb-tag">{icpName}</span>}
          {postLabel && <span className="pb-tag muted" title={postLabel}>{postLabel}</span>}
        </div>

        <div className="pb-cadence" title={`${row.toques} de ${totalSteps} contatos da cadência`}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span key={i} className={i < (row.toques || 0) ? 'dot on' : 'dot'} />
          ))}
          <span className="pb-cadence-label">
            {row.toques ? `${row.toques}º contato feito` : 'sem contato'}
          </span>
        </div>

        <footer className="pb-card-foot">
          <span title="Último contato">
            <Send size={11} /> {row.ultimo_toque ? daysAgoLabel(row.ultimo_toque) : '—'}
          </span>
          <span title="Próximo contato" className={followUp === 'atrasado' ? 'late' : ''}>
            <Calendar size={11} /> {formatDate(row.next_action_at)}
            {followUp === 'atrasado' && ` (+${row.dias_followup_atrasado}d)`}
          </span>
        </footer>

        {badge && (
          <div className={`pb-badge ${badge.tone}`}>
            {badge.tone === 'alert' && <AlertTriangle size={11} />}
            {badge.label}
            {row.dias_sem_resposta != null && ` há ${row.dias_sem_resposta}d`}
          </div>
        )}
      </button>

      {!overlay && <ContactLinks row={row} />}

      {!overlay && (
        <div className="pb-card-actions">
          <button type="button" disabled={busy} onClick={() => onQuickTouch(row, 'out')}
            title="Registrar contato enviado (avança a cadência)">
            <Send size={12} /> Contato
          </button>
          <button type="button" disabled={busy} onClick={() => onQuickTouch(row, 'in')}
            title="Registrar resposta recebida">
            <Inbox size={12} /> Respondeu
          </button>
        </div>
      )}
    </article>
  );
}

// ── Coluna ──────────────────────────────────────────────────────────────────
function Column({ stage, rows, icpById, postById, ...cardProps }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section ref={setNodeRef} className={`pb-column ${stage} ${isOver ? 'over' : ''}`}>
      <header className="pb-column-head">
        <div>
          <h2>{STAGE_LABELS[stage]}</h2>
          <p>{COLUMN_HINTS[stage]}</p>
        </div>
        <span className="pb-column-count">{rows.length}</span>
      </header>
      <div className="pb-column-body">
        {rows.map((row) => (
          <LeadCard
            key={row.lead_id}
            row={row}
            icpName={icpById.get(row.icp_id)}
            postLabel={postById.get(row.first_seen_post_id)?.hook?.slice(0, 42)}
            {...cardProps}
          />
        ))}
        {!rows.length && <div className="pb-column-empty">Solte um lead aqui</div>}
      </div>
    </section>
  );
}

// ── Painel de detalhe ───────────────────────────────────────────────────────
function LeadDrawer({ row, touchpoints, cadence, icpName, postLabel, onClose, onAction, busy }) {
  const [notes, setNotes] = useState(row.notes || '');
  const [nextAction, setNextAction] = useState(row.next_action_at || '');
  const [touchNote, setTouchNote] = useState('');
  const [channel, setChannel] = useState('linkedin');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    setNotes(row.notes || '');
    setNextAction(row.next_action_at || '');
    setEditing(null);
  }, [row.lead_id, row.notes, row.next_action_at]);

  // Fecha com Esc — como todo modal, a tecla mais previsível pra sair.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ativos = touchpoints.filter((t) => !t.cancelled_at);

  return (
    <div className="pb-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="pb-drawer" role="dialog" aria-modal="true">
      <header className="pb-drawer-head">
        <button type="button" className="pb-drawer-close" onClick={onClose} title="Fechar"><X size={16} /></button>
        <div>
          <strong>{row.full_name || 'Sem nome'}</strong>
          <span>{row.job_title || '—'}{row.company_name ? ` · ${row.company_name}` : ''}</span>
        </div>
      </header>

      <ContactLinks row={row} className="drawer" />

      <div className="pb-drawer-meta">
        <div><User size={12} /> {row.owner || 'sem responsável'}</div>
        <div><Building2 size={12} /> {icpName || 'sem ICP'}</div>
        {postLabel && <div title={postLabel}><MessageSquare size={12} /> {postLabel}</div>}
        {row.first_seen_post_id && row.post_url && (
          <a href={row.post_url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> post de origem</a>
        )}
      </div>

      {/* Observações do lead: livre, não vira evento. */}
      <section className="pb-drawer-block">
        <h3>Observações</h3>
        <textarea
          value={notes}
          placeholder="O que não pertence a um contato específico: contexto da empresa, momento, quem decide…"
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
        <button type="button" className="pb-btn" disabled={busy || notes === (row.notes || '')}
          onClick={() => onAction('set_notes', { notes })}>
          <Check size={12} /> Salvar observações
        </button>
      </section>

      <section className="pb-drawer-block">
        <h3>Próximo contato</h3>
        <div className="pb-inline">
          <input type="date" value={nextAction || ''} onChange={(e) => setNextAction(e.target.value)} />
          <button type="button" className="pb-btn" disabled={busy}
            onClick={() => onAction('set_next_action', { nextActionAt: nextAction || null })}>
            Reagendar
          </button>
        </div>
        <small>A cadência calcula sozinha a cada contato; reagendar sobrescreve.</small>
      </section>

      {/* Registrar contato */}
      <section className="pb-drawer-block">
        <h3>Registrar contato</h3>
        <div className="pb-inline">
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {Object.entries(CHANNEL_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <input type="text" value={touchNote} placeholder="nota (opcional)" onChange={(e) => setTouchNote(e.target.value)} />
        </div>
        <div className="pb-inline">
          <button type="button" className="pb-btn primary" disabled={busy}
            onClick={() => { onAction('log_touch', { direction: 'out', channel, note: touchNote || null }); setTouchNote(''); }}>
            <Send size={12} /> Enviei
          </button>
          <button type="button" className="pb-btn" disabled={busy}
            onClick={() => { onAction('log_touch', { direction: 'in', channel, note: touchNote || null }); setTouchNote(''); }}>
            <Inbox size={12} /> Respondeu
          </button>
        </div>
      </section>

      {/* Timeline — inclui anulados, porque é auditoria */}
      <section className="pb-drawer-block">
        <h3>Histórico <small>{ativos.length} contato(s) válido(s)</small></h3>
        {!touchpoints.length && <p className="pb-empty-note">Nenhum contato registrado ainda.</p>}
        <ol className="pb-timeline">
          {touchpoints.map((t) => (
            <li key={t.id} className={`${t.direction} ${t.cancelled_at ? 'cancelled' : ''}`}>
              <div className="pb-timeline-head">
                <strong>
                  {t.direction === 'out' ? `${t.touch_number ? `${t.touch_number}º contato` : 'Contato'}` : 'Resposta'}
                </strong>
                <span>{CHANNEL_LABELS[t.channel] || t.channel} · {formatDate(t.touched_at)}</span>
              </div>
              {t.note && <p>{t.note}</p>}
              {t.cancelled_at && (
                <p className="pb-cancelled-note">
                  <Ban size={11} /> Anulado{t.cancel_reason ? `: ${t.cancel_reason}` : ''} — mantido para auditoria
                </p>
              )}
              {!t.cancelled_at && (
                <div className="pb-timeline-actions">
                  {editing === t.id ? (
                    <EditTouch touch={t} busy={busy} onCancel={() => setEditing(null)}
                      onSave={(patch) => { onAction('update_touch', { touchId: t.id, ...patch }); setEditing(null); }} />
                  ) : (
                    <>
                      <button type="button" onClick={() => setEditing(t.id)} disabled={busy}>
                        <Pencil size={11} /> Editar
                      </button>
                      <button type="button" className="danger" disabled={busy}
                        onClick={() => {
                          const reason = window.prompt('Por que anular este contato? (fica registrado)');
                          if (reason === null) return;
                          onAction('cancel_touch', { touchId: t.id, reason: reason || null });
                        }}>
                        <Ban size={11} /> Anular
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="pb-drawer-block">
        <h3>Tirar da operação</h3>
        <button type="button" className="pb-btn danger" disabled={busy}
          onClick={() => {
            const reason = window.prompt('Motivo (opcional). O histórico é preservado.');
            if (reason === null) return;
            onAction('archive', { reason: reason || null });
          }}>
          <X size={12} /> Arquivar card
        </button>
        <small>Arquivar preserva contatos e movimentações. Diferente de “Perdido”, que conta como perda no funil.</small>
      </section>
    </aside>
    </div>
  );
}

function EditTouch({ touch, onSave, onCancel, busy }) {
  const [note, setNote] = useState(touch.note || '');
  const [date, setDate] = useState(String(touch.touched_at || '').slice(0, 10));
  return (
    <div className="pb-edit-touch">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input type="text" value={note} placeholder="nota" onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="pb-btn" disabled={busy}
        onClick={() => onSave({
          note,
          // Só manda a data se realmente mudou: mudar data renumera e reprograma.
          touchedAt: date && date !== String(touch.touched_at || '').slice(0, 10)
            ? new Date(`${date}T12:00:00Z`).toISOString()
            : undefined,
        })}>
        Salvar
      </button>
      <button type="button" onClick={onCancel}>Cancelar</button>
    </div>
  );
}

// ── Novo card manual ──────────────────────────────────────────────────────────
// Só nome é obrigatório. O card entra em "A prospectar", sem contato — igualzinho
// ao que o checkbox "Prospectado" faz na aba Leads ICP, só que sem o lead ter vindo
// de um comentário. Serve para quando a pessoa chegou por fora do funil.
function AddLeadModal({ owners, icpProfiles, busy, onClose, onCreate }) {
  const [form, setForm] = useState({
    fullName: '', jobTitle: '', companyName: '', profileUrl: '', owner: '', icpId: '',
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSave = form.fullName.trim() && !busy;
  return (
    <div className="pb-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="pb-drawer" role="dialog" aria-modal="true">
        <header className="pb-drawer-head">
          <button type="button" className="pb-drawer-close" onClick={onClose} title="Fechar"><X size={16} /></button>
          <div>
            <strong>Novo card</strong>
            <span>Entra em “A prospectar”, ainda sem contato</span>
          </div>
        </header>

        <section className="pb-drawer-block" style={{ borderTop: 0 }}>
          <label className="pb-field">
            <span>Nome *</span>
            <input type="text" value={form.fullName} autoFocus placeholder="Nome completo" onChange={set('fullName')} />
          </label>
          <label className="pb-field">
            <span>Cargo</span>
            <input type="text" value={form.jobTitle} placeholder="Ex.: Head de Vendas" onChange={set('jobTitle')} />
          </label>
          <label className="pb-field">
            <span>Empresa</span>
            <input type="text" value={form.companyName} placeholder="Ex.: Acme" onChange={set('companyName')} />
          </label>
          <label className="pb-field">
            <span>LinkedIn (URL)</span>
            <input type="url" value={form.profileUrl} placeholder="https://www.linkedin.com/in/…" onChange={set('profileUrl')} />
          </label>
          <label className="pb-field">
            <span>Responsável</span>
            <input type="text" list="pb-owner-options" value={form.owner} placeholder="Quem vai tocar" onChange={set('owner')} />
            <datalist id="pb-owner-options">{owners.map((o) => <option key={o} value={o} />)}</datalist>
          </label>
          <label className="pb-field">
            <span>ICP</span>
            <select value={form.icpId} onChange={set('icpId')}>
              <option value="">Sem ICP</option>
              {icpProfiles.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>

          <button type="button" className="pb-btn primary" disabled={!canSave} onClick={() => onCreate(form)}>
            <Plus size={13} /> Adicionar card
          </button>
        </section>
      </aside>
    </div>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────
export default function PipelineBoard({ client, currentUser = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [icpFilter, setIcpFilter] = useState('');
  const [queueFilter, setQueueFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const refresh = useCallback(async ({ force = true } = {}) => {
    const result = await loadContentMetrics({ supabase: client, mode: 'pipeline', force });
    if (result.loadError) { setError(result.warning || 'Não foi possível carregar o pipeline.'); setLoading(false); return; }
    setData(result); setError(''); setLoading(false);
  }, [client]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const cadence = useMemo(() => parseCadence(data?.pipelineCadence), [data?.pipelineCadence]);
  const icpById = useMemo(
    () => new Map((data?.icpProfiles || []).map((i) => [i.id, i.name])),
    [data?.icpProfiles],
  );
  const postById = useMemo(
    () => new Map((data?.linkedin || []).map((p) => [p.id, p])),
    [data?.linkedin],
  );
  const touchesByLead = useMemo(() => {
    const map = new Map();
    for (const t of data?.touchpoints || []) {
      if (!map.has(t.lead_id)) map.set(t.lead_id, []);
      map.get(t.lead_id).push(t);
    }
    return map;
  }, [data?.touchpoints]);

  // Cards ativos. Arquivado nunca aparece no board — ele saiu da operação, e é por
  // isso que arquivar não é o mesmo que perder.
  const rows = useMemo(() => (data?.pipeline || []).filter((r) => !r.archived_at), [data?.pipeline]);

  const owners = useMemo(
    () => [...new Set(rows.map((r) => r.owner).filter(Boolean))].sort(),
    [rows],
  );

  const visible = useMemo(() => rows.filter((row) => {
    if (ownerFilter && row.owner !== ownerFilter) return false;
    if (icpFilter && row.icp_id !== icpFilter) return false;
    if (queueFilter === 'hoje' && !row.precisa_contato_hoje) return false;
    if (queueFilter === 'sem3' && !(row.dias_sem_resposta >= cadence.sem_resposta_atencao_dias)) return false;
    if (queueFilter === 'sem7' && !(row.dias_sem_resposta >= cadence.sem_resposta_alerta_dias)) return false;
    return true;
  }), [rows, ownerFilter, icpFilter, queueFilter, cadence]);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, []]));
    for (const row of visible) (map[row.stage] ||= []).push(row);
    // Dentro da coluna, quem está mais atrasado sobe: a ordem do board é a ordem
    // do trabalho, não alfabética.
    for (const stage of STAGES) {
      map[stage].sort((a, b) => String(a.next_action_at || '9999').localeCompare(String(b.next_action_at || '9999')));
    }
    return map;
  }, [visible]);

  const filaHoje = useMemo(() => rows.filter((r) => r.precisa_contato_hoje).length, [rows]);
  const selected = useMemo(() => rows.find((r) => r.lead_id === selectedId) || null, [rows, selectedId]);

  const call = useCallback(async (action, payload) => {
    if (!client?.functions?.invoke) { setNotice('Indisponível no modo offline.'); return null; }
    setBusy(true); setNotice('');
    try {
      const { data: res, error: fnError } = await client.functions.invoke('lead-pipeline', {
        body: { manual: true, action, actor: currentUser || null, ...payload },
      });
      if (fnError) throw fnError;
      if (!res?.success) throw new Error(res?.error || `Falha em ${action}`);
      await refresh();
      return res;
    } catch (e) {
      setNotice(`Falha: ${e?.message || e}`);
      await refresh().catch(() => {});
      return null;
    } finally {
      setBusy(false);
    }
  }, [client, currentUser, refresh]);

  const quickTouch = useCallback(async (row, direction) => {
    const res = await call('log_touch', { leadId: row.lead_id, direction });
    if (res?.stageChanged) {
      setNotice(`${row.full_name}: card movido para "${STAGE_LABELS[res.stage]}".`);
    }
  }, [call]);

  const moveStage = useCallback(async (row, toStage) => {
    if (row.stage === toStage) return;
    const extra = {};
    if (toStage === 'perdido') {
      const reason = window.prompt('Motivo da perda (entra no funil como perda):');
      if (reason === null) return;
      extra.lostReason = reason || null;
    }
    // Atualização otimista: o card muda de coluna NA HORA. O call() faz refresh() no
    // fim, com sucesso ou falha, então o servidor reconcilia sozinho — se a escrita
    // falhar, o card volta e o aviso de erro aparece. Sem isto, o card só se mexia
    // depois da ida à rede: era esse atraso que dava o efeito de "vai e volta".
    setData((prev) => (prev ? {
      ...prev,
      pipeline: (prev.pipeline || []).map((r) => (
        r.lead_id === row.lead_id ? { ...r, stage: toStage } : r
      )),
    } : prev));
    const res = await call('move_stage', { leadId: row.lead_id, toStage, ...extra });
    if (res?.inboundRecorded) {
      setNotice(`${row.full_name}: resposta registrada junto, para o marco do funil ter evidência.`);
    }
  }, [call]);

  if (loading) return <div className="pb-loading"><RefreshCw size={16} className="spin" /> Carregando pipeline…</div>;
  if (error) return <div className="pb-error"><AlertTriangle size={16} /> {error}</div>;

  const cardProps = {
    cadence, busy,
    onOpen: (row) => setSelectedId(row.lead_id),
    onQuickTouch: quickTouch,
  };

  return (
    <div className="pb-wrap">
      <header className="pb-header">
        <div>
          <span className="pb-eyebrow">Playbook Lab · Comercial</span>
          <h1>Kanban de prospecção</h1>
          <p>
            O lead entra aqui quando é marcado como <strong>Prospectado</strong> na aba Leads ICP —
            selecionado para a operação, ainda devendo o primeiro contato.
          </p>
        </div>
        <div className="pb-header-side">
          <button type="button" className="pb-btn primary" onClick={() => setShowAdd(true)} disabled={busy}>
            <Plus size={13} /> Adicionar card
          </button>
          <button type="button" className="pb-btn" onClick={() => refresh()} disabled={busy}>
            <RefreshCw size={13} className={busy ? 'spin' : ''} /> Atualizar
          </button>
          <span className="pb-count">{rows.length} no board</span>
        </div>
      </header>

      <div className="pb-toolbar">
        <button type="button" className={`pb-chip queue ${queueFilter === 'hoje' ? 'active' : ''}`}
          onClick={() => setQueueFilter(queueFilter === 'hoje' ? '' : 'hoje')}
          title="Nunca contatados + follow-up vencido">
          Precisa de contato hoje <b>{filaHoje}</b>
        </button>
        <button type="button" className={`pb-chip ${queueFilter === 'sem3' ? 'active' : ''}`}
          onClick={() => setQueueFilter(queueFilter === 'sem3' ? '' : 'sem3')}>
          Sem resposta +{cadence.sem_resposta_atencao_dias}d
        </button>
        <button type="button" className={`pb-chip ${queueFilter === 'sem7' ? 'active' : ''}`}
          onClick={() => setQueueFilter(queueFilter === 'sem7' ? '' : 'sem7')}>
          Sem resposta +{cadence.sem_resposta_alerta_dias}d
        </button>

        <span className="pb-toolbar-sep" />

        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={icpFilter} onChange={(e) => setIcpFilter(e.target.value)}>
          <option value="">Todos os ICPs</option>
          {(data?.icpProfiles || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {(ownerFilter || icpFilter || queueFilter) && (
          <button type="button" className="pb-chip clear" onClick={() => { setOwnerFilter(''); setIcpFilter(''); setQueueFilter(''); }}>
            <X size={11} /> limpar filtros
          </button>
        )}
      </div>

      {notice && <div className="pb-notice">{notice}<button type="button" onClick={() => setNotice('')}><X size={12} /></button></div>}

      <div className="pb-layout">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={({ active }) => setActiveRow(rows.find((r) => r.lead_id === active.id) || null)}
          onDragCancel={() => setActiveRow(null)}
          onDragEnd={({ active, over }) => {
            const row = rows.find((r) => r.lead_id === active.id);
            setActiveRow(null);
            if (row && over?.id && STAGES.includes(String(over.id))) moveStage(row, String(over.id));
          }}
        >
          <div className="pb-board">
            {STAGES.map((stage) => (
              <Column key={stage} stage={stage} rows={byStage[stage] || []}
                icpById={icpById} postById={postById} {...cardProps} />
            ))}
          </div>
          <DragOverlay>
            {activeRow && <LeadCard row={activeRow} cadence={cadence} overlay
              onOpen={() => {}} onQuickTouch={() => {}} busy />}
          </DragOverlay>
        </DndContext>

        {selected && (
          <LeadDrawer
            row={selected}
            touchpoints={touchesByLead.get(selected.lead_id) || []}
            cadence={cadence}
            icpName={icpById.get(selected.icp_id)}
            postLabel={postById.get(selected.first_seen_post_id)?.hook?.slice(0, 60)}
            busy={busy}
            onClose={() => setSelectedId('')}
            onAction={(action, payload) => call(action, { leadId: selected.lead_id, ...payload })}
          />
        )}
      </div>

      {showAdd && (
        <AddLeadModal
          owners={owners}
          icpProfiles={data?.icpProfiles || []}
          busy={busy}
          onClose={() => setShowAdd(false)}
          onCreate={async (form) => {
            const res = await call('create_lead', {
              fullName: form.fullName.trim(),
              jobTitle: form.jobTitle || null,
              companyName: form.companyName || null,
              profileUrl: form.profileUrl || null,
              owner: form.owner || null,
              icpId: form.icpId || null,
            });
            if (res?.success) {
              setShowAdd(false);
              setNotice(res.reused
                ? `${form.fullName}: já estava na base e foi trazido para o board.`
                : `${form.fullName}: card criado em “A prospectar”.`);
            }
          }}
        />
      )}
    </div>
  );
}
