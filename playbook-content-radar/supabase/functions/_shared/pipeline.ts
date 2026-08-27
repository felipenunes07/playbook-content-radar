// Regras do pipeline comercial. Puro, sem I/O — é o que os testes exercitam.
// Ver docs/superpowers/plans/2026-08-27-kanban-e-funil-comercial.md
//
// Duas regras que não podem virar convenção (elas existem porque o Felipe foi
// explícito, e ambas são fáceis de quebrar sem perceber):
//
//   1. "Contatado" é derivado do PRIMEIRO touchpoint outbound, nunca de alguém ter
//      arrastado o card. Por isso `stageAfterTouch` deriva a etapa do toque, e não
//      o contrário. Marcar "Prospectado" NÃO cria touchpoint: selecionar ≠ contatar.
//   2. Marcar "Respondeu" na mão precisa deixar evidência — `inboundEvidenceNeeded`
//      diz quando gravar o touchpoint inbound junto, pra que o marco do funil tenha
//      lastro em vez de sair de uma movimentação sem prova.

export const STAGES = [
  'a_prospectar', 'em_cadencia', 'respondeu', 'reuniao',
  'proposta', 'cliente', 'perdido',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  a_prospectar: 'A prospectar',
  em_cadencia: 'Em cadência',
  respondeu: 'Respondeu',
  reuniao: 'Reunião agendada',
  proposta: 'Proposta / Negociação',
  cliente: 'Cliente',
  perdido: 'Perdido / Descartado',
};

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}

export type Direction = 'out' | 'in';
export const CHANNELS = ['linkedin', 'whatsapp', 'email', 'call'] as const;
export type Channel = (typeof CHANNELS)[number];

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}

// ── Cadência ────────────────────────────────────────────────────────────────
export interface CadenceStep { n: number; intervalo_dias: number; label: string }
export interface Cadence {
  steps: CadenceStep[];
  sem_resposta_atencao_dias: number;
  sem_resposta_alerta_dias: number;
  sugerir_descarte_apos_dias: number;
}

// Espelho do default da migration 20260827160000. Só é usado se a linha de
// pipeline_settings sumir — o valor que manda é sempre o do banco, editável sem deploy.
export const DEFAULT_CADENCE: Cadence = {
  steps: [
    { n: 1, intervalo_dias: 0, label: '1º contato' },
    { n: 2, intervalo_dias: 5, label: '2º contato' },
    { n: 3, intervalo_dias: 9, label: '3º contato' },
  ],
  sem_resposta_atencao_dias: 3,
  sem_resposta_alerta_dias: 7,
  sugerir_descarte_apos_dias: 21,
};

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

// Aceita o jsonb do banco vindo torto sem derrubar o board: cada campo inválido cai
// no default individualmente. Uma cadência meio quebrada é melhor que uma tela em
// branco, porque o operador ainda enxerga quem precisa de contato hoje.
export function parseCadence(raw: unknown): Cadence {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];

  const steps: CadenceStep[] = rawSteps
    .map((step, index) => {
      const s = (step && typeof step === 'object' ? step : {}) as Record<string, unknown>;
      return {
        n: positiveInt(s.n, index + 1) || index + 1,
        intervalo_dias: positiveInt(s.intervalo_dias, 0),
        label: typeof s.label === 'string' && s.label.trim() ? s.label.trim() : `${index + 1}º contato`,
      };
    })
    .filter((step) => step.n > 0)
    .sort((a, b) => a.n - b.n);

  return {
    steps: steps.length ? steps : DEFAULT_CADENCE.steps,
    sem_resposta_atencao_dias: positiveInt(source.sem_resposta_atencao_dias, DEFAULT_CADENCE.sem_resposta_atencao_dias),
    sem_resposta_alerta_dias: positiveInt(source.sem_resposta_alerta_dias, DEFAULT_CADENCE.sem_resposta_alerta_dias),
    sugerir_descarte_apos_dias: positiveInt(source.sugerir_descarte_apos_dias, DEFAULT_CADENCE.sugerir_descarte_apos_dias),
  };
}

export function totalTouches(cadence: Cadence): number {
  return cadence.steps.length;
}

// ── Datas ───────────────────────────────────────────────────────────────────
// Tudo em UTC e em 'YYYY-MM-DD': a coluna next_action_at é `date`, e converter via
// fuso local faria o card vencer um dia antes ou depois dependendo de onde a
// function roda.
export function toIsoDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida: ${String(value)}`);
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const base = Date.UTC(year, (month || 1) - 1, day || 1);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Quando deve sair o próximo toque.
 *
 * `intervalo_dias` conta a partir do toque ANTERIOR, não da entrada no board: se o
 * 1º contato atrasa três dias, o 2º não dispara junto — a cadência anda com a
 * realidade em vez de acumular atraso.
 *
 * Devolve null quando a cadência acabou (todos os toques previstos já saíram): o
 * card para de pedir contato e passa a ser decisão humana (avançar ou descartar).
 */
export function computeNextActionAt(input: {
  cadence: Cadence;
  touchesDone: number;
  lastTouchAt?: string | Date | null;
  enteredAt: string | Date;
}): string | null {
  const { cadence, touchesDone } = input;
  const nextStep = cadence.steps.find((step) => step.n === touchesDone + 1);
  if (!nextStep) return null;

  // Sem toque ainda: a régua parte da entrada no board (o card já nasce devendo o
  // 1º contato, então com intervalo 0 ele vence no mesmo dia).
  const anchor = touchesDone > 0 && input.lastTouchAt
    ? toIsoDate(input.lastTouchAt)
    : toIsoDate(input.enteredAt);

  return addDays(anchor, nextStep.intervalo_dias);
}

export function nextTouchNumber(touchesDone: number): number {
  return Math.max(0, Math.trunc(touchesDone)) + 1;
}

// ── Estados calculados: dois eixos independentes ────────────────────────────
// Silêncio mede a demora DO LEAD; follow-up mede a nossa. Um card pode estar sem
// resposta há 6 dias com o follow-up em dia — são perguntas diferentes, e juntar as
// duas num enum só apagaria justamente a que gera trabalho ("quem eu toco hoje").

export type SilenceState =
  | 'nunca_contatado' | 'respondeu' | 'aguardando_resposta'
  | 'sem_resposta_atencao' | 'sem_resposta_alerta';

export function silenceState(input: {
  cadence: Cadence;
  touchesDone: number;
  respondeu: boolean;
  diasSemResposta: number | null;
}): SilenceState {
  if (input.respondeu) return 'respondeu';
  if (input.touchesDone <= 0 || input.diasSemResposta === null) return 'nunca_contatado';
  if (input.diasSemResposta >= input.cadence.sem_resposta_alerta_dias) return 'sem_resposta_alerta';
  if (input.diasSemResposta >= input.cadence.sem_resposta_atencao_dias) return 'sem_resposta_atencao';
  return 'aguardando_resposta';
}

export type FollowUpState = 'nao_se_aplica' | 'em_dia' | 'vence_hoje' | 'atrasado';

export function followUpState(input: {
  stage: Stage;
  archived: boolean;
  respondeu: boolean;
  nextActionAt: string | null;
  today: string;
}): FollowUpState {
  const emOperacao = !input.archived
    && (input.stage === 'a_prospectar' || input.stage === 'em_cadencia')
    && !input.respondeu;
  if (!emOperacao) return 'nao_se_aplica';
  // Cadência esgotada (next_action_at null) não é atraso: é decisão pendente.
  if (!input.nextActionAt) return 'em_dia';
  const delta = daysBetween(input.nextActionAt, input.today);
  if (delta > 0) return 'atrasado';
  if (delta === 0) return 'vence_hoje';
  return 'em_dia';
}

/** A fila operacional da aba: "Precisa de contato hoje". */
export function needsContactToday(input: Parameters<typeof followUpState>[0]): boolean {
  const state = followUpState(input);
  return state === 'atrasado' || state === 'vence_hoje';
}

/**
 * Cadência esgotada e silêncio longo: o board sugere descarte, mas não descarta.
 * Quem tira alguém do jogo é gente, não cron — descarte automático apagaria lead
 * bom que só demorou a responder.
 */
export function shouldSuggestDiscard(input: {
  cadence: Cadence;
  touchesDone: number;
  respondeu: boolean;
  diasSemResposta: number | null;
}): boolean {
  if (input.respondeu) return false;
  if (input.touchesDone < totalTouches(input.cadence)) return false;
  if (input.diasSemResposta === null) return false;
  return input.diasSemResposta >= input.cadence.sugerir_descarte_apos_dias;
}

// ── Transições ──────────────────────────────────────────────────────────────

/**
 * A etapa que um toque IMPLICA — o coração da regra "contatado é derivado".
 *
 * - 1º toque outbound tira o card de "A prospectar" e o põe em "Em cadência".
 * - Qualquer toque inbound significa que a pessoa respondeu, e isso vale mais que
 *   a etapa em que o card estava.
 * - Etapa adiante de "Respondeu" (reunião, proposta, cliente) nunca regride por
 *   causa de um toque: continuar conversando com um cliente não o devolve à fila.
 */
export function stageAfterTouch(current: Stage, direction: Direction): Stage {
  if (direction === 'in') {
    return current === 'a_prospectar' || current === 'em_cadencia' ? 'respondeu' : current;
  }
  return current === 'a_prospectar' ? 'em_cadencia' : current;
}

/**
 * Marcar "Respondeu" na mão exige evidência: se ainda não há touchpoint inbound,
 * quem move a etapa grava um junto. Sem isso o marco `respondeu_em` do funil sairia
 * de uma movimentação sem prova — e a conversão passaria a medir cliques, não fatos.
 *
 * Só vale para 'respondeu'. As etapas seguintes (reunião, proposta, cliente) são
 * decisão comercial e têm evidência própria em lead_stage_events.
 */
export function inboundEvidenceNeeded(toStage: Stage, hasInbound: boolean): boolean {
  return toStage === 'respondeu' && !hasInbound;
}

/** Etapas que encerram a cadência: o card sai da fila de contato. */
export function isTerminalForCadence(stage: Stage): boolean {
  return stage === 'cliente' || stage === 'perdido';
}

// Etapas cuja posição é CONSEQUÊNCIA dos toques. As demais (reunião, proposta,
// cliente, perdido) são decisão comercial e nenhum recálculo mexe nelas.
const DERIVED_STAGES: readonly Stage[] = ['a_prospectar', 'em_cadencia', 'respondeu'];

/**
 * Onde o card deve estar depois de um toque ser ANULADO.
 *
 * Anular o único contato de um lead tem que devolvê-lo para "A prospectar" — senão
 * ele fica em "Em cadência" sem nenhum toque, e o funil segue contando um contato
 * que a pessoa disse que não aconteceu.
 *
 * Só recalcula dentro das etapas derivadas: se alguém já marcou reunião, nenhum
 * conserto de registro de contato tem autoridade pra desmarcar.
 */
export function stageAfterCancellation(
  current: Stage,
  active: { out: number; in: number },
): Stage {
  if (!DERIVED_STAGES.includes(current)) return current;
  if (active.in > 0) return 'respondeu';
  if (active.out > 0) return 'em_cadencia';
  return 'a_prospectar';
}
