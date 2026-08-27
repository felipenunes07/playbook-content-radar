// Escritas do pipeline comercial. Recebe o client por parâmetro e não importa nada
// do Deno — é o que permite rodar o caminho de escrita inteiro contra o
// fakeSupabase da harness (src/dataReliability), com o schema real sendo cobrado.
// O index.ts das functions só faz auth + roteamento em cima daqui.
//
// Invariantes que estas funções existem para garantir:
//   · Selecionar (checkbox "Prospectado") NUNCA cria touchpoint.
//   · A etapa "Em cadência" é consequência do 1º toque outbound, não de arrastar card.
//   · "Respondeu" sempre tem touchpoint inbound como evidência.
//   · lead_stage_events é append-only: só INSERT, nunca update/delete.
//   · Arquivar preserva touchpoints e eventos.

import {
  type Cadence, type Channel, type Direction, type Stage,
  computeNextActionAt, inboundEvidenceNeeded, isStage, nextTouchNumber,
  parseCadence, stageAfterCancellation, stageAfterTouch,
} from './pipeline.ts';

// Estrutural de propósito: serve tanto o SupabaseClient real quanto o fake.
export interface DbClient {
  from(table: string): any;
}

export interface PipelineRow {
  lead_id: string;
  stage: Stage;
  icp_id: string | null;
  owner: string | null;
  campaign: string | null;
  notes: string | null;
  next_action_at: string | null;
  lost_reason: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  entered_at: string;
}

function fail(message: string): never {
  throw new Error(message);
}

async function must<T>(promise: PromiseLike<{ data: T; error: any }>, context: string): Promise<T> {
  const { data, error } = await promise;
  if (error) fail(`${context}: ${error.message || error}`);
  return data;
}

export async function loadCadence(client: DbClient): Promise<Cadence> {
  const { data } = await client.from('pipeline_settings').select('cadence').eq('id', true).maybeSingle();
  return parseCadence(data?.cadence);
}

export async function loadPipeline(client: DbClient, leadId: string): Promise<PipelineRow | null> {
  const { data, error } = await client.from('lead_pipeline')
    .select('lead_id, stage, icp_id, owner, campaign, notes, next_action_at, lost_reason, archived_at, archive_reason, entered_at')
    .eq('lead_id', leadId).maybeSingle();
  if (error) fail(`Leitura do pipeline: ${error.message || error}`);
  return (data as PipelineRow) || null;
}

interface TouchRow { id: string; direction: Direction; touched_at: string; cancelled_at: string | null }
interface TouchSummary {
  out: number; inbound: number; hasInbound: boolean; lastOutAt: string | null;
  activeOut: TouchRow[];
}

// SEMPRE só os toques ativos: um toque anulado não conta na cadência, no silêncio
// nem no funil. O filtro fica aqui, num lugar só, porque espalhá-lo pelas ops era o
// caminho garantido pra uma delas esquecer e o card passar a mentir.
async function touchSummary(client: DbClient, leadId: string): Promise<TouchSummary> {
  const rows = await must<TouchRow[]>(
    client.from('lead_touchpoints').select('id, direction, touched_at, cancelled_at').eq('lead_id', leadId),
    'Leitura de touchpoints',
  );
  const active = (rows || []).filter((r) => !r.cancelled_at);
  const activeOut = active
    .filter((r) => r.direction === 'out')
    .sort((a, b) => String(a.touched_at).localeCompare(String(b.touched_at)));
  const inbound = active.filter((r) => r.direction === 'in').length;
  return {
    out: activeOut.length,
    inbound,
    hasInbound: inbound > 0,
    lastOutAt: activeOut.length ? String(activeOut[activeOut.length - 1].touched_at) : null,
    activeOut,
  };
}

// A numeração é POSIÇÃO entre os toques ativos. Anular o 1º de três tem que
// transformar os que sobraram em 1º e 2º — senão o card anuncia "3º contato" para
// alguém que recebeu dois.
async function renumberTouches(client: DbClient, activeOut: TouchRow[]) {
  for (let index = 0; index < activeOut.length; index += 1) {
    const { error } = await client.from('lead_touchpoints')
      .update({ touch_number: index + 1 }).eq('id', activeOut[index].id);
    if (error) fail(`Renumeração de contatos: ${error.message || error}`);
  }
}

async function recordStageEvent(client: DbClient, row: {
  leadId: string; from: Stage | null; to: string; actor?: string | null; note?: string | null; occurredAt?: string;
}) {
  const { error } = await client.from('lead_stage_events').insert({
    lead_id: row.leadId,
    from_stage: row.from,
    to_stage: row.to,
    occurred_at: row.occurredAt || new Date().toISOString(),
    actor: row.actor || null,
    note: row.note || null,
  });
  if (error) fail(`Registro de evento de etapa: ${error.message || error}`);
}

/**
 * Entrada no board — é o que o checkbox "Prospectado" dispara.
 *
 * Selecionar não é contatar: o card nasce em 'a_prospectar', devendo o 1º contato,
 * e NENHUM touchpoint é criado. `next_action_at` é hoje, então ele já aparece na
 * fila "Precisa de contato hoje".
 *
 * Reentrada (lead que tinha sido arquivado) preserva o `entered_at` original — a
 * coorte do funil não pode ser reescrita por um clique de correção.
 */
export async function enterPipeline(client: DbClient, input: {
  leadId: string; icpId?: string | null; owner?: string | null; actor?: string | null; now?: string;
}): Promise<PipelineRow> {
  const now = input.now || new Date().toISOString();
  const existing = await loadPipeline(client, input.leadId);

  if (existing) {
    if (!existing.archived_at) return existing; // já está na operação: nada a fazer
    const fromStage = existing.stage; // lido antes da escrita (ver nota em logTouch)
    const { error } = await client.from('lead_pipeline')
      .update({ archived_at: null, archive_reason: null, next_action_at: now.slice(0, 10) })
      .eq('lead_id', input.leadId);
    if (error) fail(`Reativação do card: ${error.message || error}`);
    await recordStageEvent(client, {
      leadId: input.leadId, from: fromStage, to: 'reativado', actor: input.actor,
      note: 'Voltou para a operação ativa; histórico anterior preservado.', occurredAt: now,
    });
    return (await loadPipeline(client, input.leadId))!;
  }

  const { error } = await client.from('lead_pipeline').insert({
    lead_id: input.leadId,
    stage: 'a_prospectar',
    icp_id: input.icpId || null,
    owner: input.owner || null,
    entered_at: now,
    next_action_at: now.slice(0, 10),
  });
  if (error) fail(`Entrada no pipeline: ${error.message || error}`);
  await recordStageEvent(client, {
    leadId: input.leadId, from: null, to: 'a_prospectar', actor: input.actor,
    note: 'Selecionado para a operação comercial (checkbox Prospectado). Sem contato ainda.',
    occurredAt: now,
  });
  return (await loadPipeline(client, input.leadId))!;
}

/**
 * Saída da operação ativa — o que desmarcar "Prospectado" dispara.
 * NÃO apaga nada: touchpoints e eventos ficam, e a saída em si vira evento.
 */
export async function archivePipeline(client: DbClient, input: {
  leadId: string; reason?: string | null; actor?: string | null; now?: string;
}): Promise<PipelineRow | null> {
  const now = input.now || new Date().toISOString();
  const existing = await loadPipeline(client, input.leadId);
  if (!existing || existing.archived_at) return existing;
  const fromStage = existing.stage; // lido antes da escrita (ver nota em logTouch)

  const { error } = await client.from('lead_pipeline')
    .update({ archived_at: now, archive_reason: input.reason || null, next_action_at: null })
    .eq('lead_id', input.leadId);
  if (error) fail(`Arquivamento do card: ${error.message || error}`);
  await recordStageEvent(client, {
    leadId: input.leadId, from: fromStage, to: 'arquivado', actor: input.actor,
    note: input.reason || 'Saiu da operação ativa. Touchpoints e movimentações preservados.',
    occurredAt: now,
  });
  return await loadPipeline(client, input.leadId);
}

/**
 * Registra um contato real. É a ÚNICA porta de entrada do marco "contatado".
 *
 * A etapa é derivada do toque (stageAfterTouch), nunca o contrário: o 1º outbound
 * move o card de "A prospectar" para "Em cadência" sozinho, e um inbound marca
 * "Respondeu" venha de onde vier.
 */
export async function logTouch(client: DbClient, input: {
  leadId: string; direction: Direction; channel?: Channel; note?: string | null;
  actor?: string | null; touchedAt?: string; cadence?: Cadence; now?: string;
}): Promise<{ pipeline: PipelineRow; touchNumber: number | null; stageChanged: boolean }> {
  const now = input.now || new Date().toISOString();
  const touchedAt = input.touchedAt || now;
  const pipeline = await loadPipeline(client, input.leadId);
  if (!pipeline) fail('Lead não está no pipeline — marque como Prospectado antes de registrar contato');
  if (pipeline.archived_at) fail('Card arquivado: reative antes de registrar contato');
  // Capturado ANTES de qualquer escrita: um client que devolva a própria linha (em
  // vez de cópia) faria `pipeline.stage` já refletir o update, e o from_stage da
  // auditoria sairia igual ao to_stage — quebrando o encadeamento do histórico.
  const fromStage = pipeline.stage;
  const enteredAt = pipeline.entered_at;

  const cadence = input.cadence || await loadCadence(client);
  const before = await touchSummary(client, input.leadId);
  const touchNumber = input.direction === 'out' ? nextTouchNumber(before.out) : null;

  const { error: touchError } = await client.from('lead_touchpoints').insert({
    lead_id: input.leadId,
    direction: input.direction,
    channel: input.channel || 'linkedin',
    touch_number: touchNumber,
    touched_at: touchedAt,
    note: input.note || null,
    created_by: input.actor || null,
  });
  if (touchError) fail(`Registro de contato: ${touchError.message || touchError}`);

  const nextStage = stageAfterTouch(fromStage, input.direction);
  const stageChanged = nextStage !== fromStage;

  // Toque outbound reprograma a régua a partir DELE. Etapa fora da cadência
  // (respondeu em diante) não tem próximo contato programado — vira decisão humana.
  const outDone = before.out + (input.direction === 'out' ? 1 : 0);
  const nextActionAt = (nextStage === 'a_prospectar' || nextStage === 'em_cadencia')
    ? computeNextActionAt({
        cadence, touchesDone: outDone,
        lastTouchAt: input.direction === 'out' ? touchedAt : before.lastOutAt,
        enteredAt,
      })
    : null;

  const patch: Record<string, unknown> = { next_action_at: nextActionAt };
  if (stageChanged) patch.stage = nextStage;
  const { error: updateError } = await client.from('lead_pipeline').update(patch).eq('lead_id', input.leadId);
  if (updateError) fail(`Atualização do card: ${updateError.message || updateError}`);

  if (stageChanged) {
    await recordStageEvent(client, {
      leadId: input.leadId, from: fromStage, to: nextStage, actor: input.actor,
      note: input.direction === 'out'
        ? `Derivado do ${touchNumber}º contato outbound.`
        : 'Derivado de resposta recebida.',
      occurredAt: touchedAt,
    });
  }

  return { pipeline: (await loadPipeline(client, input.leadId))!, touchNumber, stageChanged };
}

/**
 * Move o card na mão.
 *
 * Mover para "Respondeu" sem evidência grava o touchpoint inbound junto — senão o
 * marco `respondeu_em` do funil sairia de um clique, e a conversão passaria a medir
 * movimentação de card em vez de fato.
 */
export async function moveStage(client: DbClient, input: {
  leadId: string; toStage: string; actor?: string | null; note?: string | null;
  lostReason?: string | null; cadence?: Cadence; now?: string;
}): Promise<{ pipeline: PipelineRow; moved: boolean; inboundRecorded: boolean }> {
  const now = input.now || new Date().toISOString();
  if (!isStage(input.toStage)) fail(`Etapa inválida: ${input.toStage}`);
  const toStage: Stage = input.toStage;

  const pipeline = await loadPipeline(client, input.leadId);
  if (!pipeline) fail('Lead não está no pipeline');
  if (pipeline.archived_at) fail('Card arquivado: reative antes de mover');
  // Ver a nota em logTouch: a etapa de origem é lida antes de qualquer escrita.
  const fromStage = pipeline.stage;
  const enteredAt = pipeline.entered_at;
  // Clicar na etapa em que já está é no-op — reentrada de verdade (voltar e avançar
  // de novo) continua gerando evento, que é o que "preservar reentradas" significa.
  if (fromStage === toStage) return { pipeline, moved: false, inboundRecorded: false };

  const before = await touchSummary(client, input.leadId);
  let inboundRecorded = false;
  if (inboundEvidenceNeeded(toStage, before.hasInbound)) {
    const { error } = await client.from('lead_touchpoints').insert({
      lead_id: input.leadId, direction: 'in', channel: 'linkedin', touch_number: null,
      touched_at: now, created_by: input.actor || null,
      note: 'Evidência do marco: registrado ao marcar "Respondeu" na mão.',
    });
    if (error) fail(`Registro da evidência de resposta: ${error.message || error}`);
    inboundRecorded = true;
  }

  const cadence = input.cadence || await loadCadence(client);
  // Voltar para a cadência (ex.: respondeu → em_cadencia) reprograma a régua a
  // partir do último toque real; avançar para fora dela zera o próximo contato.
  const nextActionAt = (toStage === 'a_prospectar' || toStage === 'em_cadencia')
    ? computeNextActionAt({
        cadence, touchesDone: before.out, lastTouchAt: before.lastOutAt, enteredAt,
      })
    : null;

  const patch: Record<string, unknown> = { stage: toStage, next_action_at: nextActionAt };
  if (toStage === 'perdido') patch.lost_reason = input.lostReason || null;
  const { error } = await client.from('lead_pipeline').update(patch).eq('lead_id', input.leadId);
  if (error) fail(`Movimentação de etapa: ${error.message || error}`);

  await recordStageEvent(client, {
    leadId: input.leadId, from: fromStage, to: toStage,
    actor: input.actor, note: input.note, occurredAt: now,
  });

  return { pipeline: (await loadPipeline(client, input.leadId))!, moved: true, inboundRecorded };
}

/** Reagendamento manual do próximo contato (sobrescreve o cálculo da cadência). */
export async function setNextAction(client: DbClient, input: {
  leadId: string; nextActionAt: string | null;
}): Promise<PipelineRow | null> {
  if (input.nextActionAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextActionAt)) {
    fail(`Data inválida (esperado YYYY-MM-DD): ${input.nextActionAt}`);
  }
  const { error } = await client.from('lead_pipeline')
    .update({ next_action_at: input.nextActionAt }).eq('lead_id', input.leadId);
  if (error) fail(`Reagendamento: ${error.message || error}`);
  return await loadPipeline(client, input.leadId);
}

/** Responsável pelo card. Existe desde o dia 1 mesmo com board compartilhado. */
export async function setOwner(client: DbClient, input: {
  leadId: string; owner: string | null;
}): Promise<PipelineRow | null> {
  const { error } = await client.from('lead_pipeline')
    .update({ owner: input.owner || null }).eq('lead_id', input.leadId);
  if (error) fail(`Troca de responsável: ${error.message || error}`);
  return await loadPipeline(client, input.leadId);
}

/** Campanha: texto livre, preenchido na mão. Nunca inferida por match de URL. */
export async function setCampaign(client: DbClient, input: {
  leadId: string; campaign: string | null;
}): Promise<PipelineRow | null> {
  const { error } = await client.from('lead_pipeline')
    .update({ campaign: input.campaign?.trim() || null }).eq('lead_id', input.leadId);
  if (error) fail(`Troca de campanha: ${error.message || error}`);
  return await loadPipeline(client, input.leadId);
}

/**
 * Observações do LEAD — o que não pertence a nenhum contato específico
 * ("empresa em fusão", "só depois do Q4"). Editável livremente; não é evento e
 * não entra em marco nenhum do funil.
 */
export async function setNotes(client: DbClient, input: {
  leadId: string; notes: string | null;
}): Promise<PipelineRow | null> {
  const { error } = await client.from('lead_pipeline')
    .update({ notes: input.notes?.trim() || null }).eq('lead_id', input.leadId);
  if (error) fail(`Gravação de observações: ${error.message || error}`);
  return await loadPipeline(client, input.leadId);
}

/**
 * Corrige um contato já registrado (nota, data ou canal).
 *
 * `direction` NÃO é editável de propósito: trocar out↔in mudaria o significado do
 * registro e o marco que ele sustenta no funil. Para isso, anule e registre de novo
 * — assim a auditoria mostra que houve correção, em vez de reescrever o passado.
 *
 * Mudar a data reordena a cadência, então renumera e reprograma o próximo contato.
 */
export async function updateTouch(client: DbClient, input: {
  leadId: string; touchId: string; note?: string | null; touchedAt?: string;
  channel?: Channel; cadence?: Cadence;
}): Promise<{ pipeline: PipelineRow; renumbered: boolean }> {
  const pipeline = await loadPipeline(client, input.leadId);
  if (!pipeline) fail('Lead não está no pipeline');

  const { data: touch, error: readError } = await client.from('lead_touchpoints')
    .select('id, lead_id, direction, touched_at, cancelled_at').eq('id', input.touchId).maybeSingle();
  if (readError) fail(`Leitura do contato: ${readError.message || readError}`);
  if (!touch) fail('Contato não encontrado');
  if (touch.lead_id !== input.leadId) fail('Contato pertence a outro lead');
  if (touch.cancelled_at) fail('Contato anulado não pode ser editado — registre um novo');
  // Lido antes da escrita: com um client que devolve a própria linha, comparar
  // depois do update daria "nada mudou" e a cadência não seria reprogramada.
  const touchedAtAntes = touch.touched_at;

  const patch: Record<string, unknown> = {};
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.touchedAt !== undefined) patch.touched_at = input.touchedAt;
  if (!Object.keys(patch).length) fail('Nada para editar');

  const { error } = await client.from('lead_touchpoints').update(patch).eq('id', input.touchId);
  if (error) fail(`Edição do contato: ${error.message || error}`);

  const dateChanged = input.touchedAt !== undefined && input.touchedAt !== touchedAtAntes;
  if (!dateChanged) return { pipeline, renumbered: false };

  const after = await touchSummary(client, input.leadId);
  await renumberTouches(client, after.activeOut);
  await reprogramNextAction(client, {
    leadId: input.leadId, stage: pipeline.stage, enteredAt: pipeline.entered_at,
    summary: after, cadence: input.cadence || await loadCadence(client),
  });
  return { pipeline: (await loadPipeline(client, input.leadId))!, renumbered: true };
}

/**
 * Anula um contato registrado por engano. NÃO apaga: a linha fica, marcada.
 *
 * Anular sai caro em cascata, e é por isso que passa por aqui em vez de um update
 * solto: o toque some das contagens, a numeração dos que sobraram muda, o próximo
 * contato é reprogramado e — se o card estava numa etapa DERIVADA de toque — ele
 * volta para onde os toques ativos dizem que ele está. Anular o único contato de um
 * lead devolve o card para "A prospectar", senão o funil seguiria contando um
 * contato que não aconteceu.
 */
export async function cancelTouch(client: DbClient, input: {
  leadId: string; touchId: string; reason?: string | null; actor?: string | null;
  cadence?: Cadence; now?: string;
}): Promise<{ pipeline: PipelineRow; stageChanged: boolean }> {
  const now = input.now || new Date().toISOString();
  const pipeline = await loadPipeline(client, input.leadId);
  if (!pipeline) fail('Lead não está no pipeline');
  const fromStage = pipeline.stage;
  const enteredAt = pipeline.entered_at;

  const { data: touch, error: readError } = await client.from('lead_touchpoints')
    .select('id, lead_id, direction, cancelled_at').eq('id', input.touchId).maybeSingle();
  if (readError) fail(`Leitura do contato: ${readError.message || readError}`);
  if (!touch) fail('Contato não encontrado');
  if (touch.lead_id !== input.leadId) fail('Contato pertence a outro lead');
  if (touch.cancelled_at) return { pipeline, stageChanged: false }; // já anulado: no-op

  const { error } = await client.from('lead_touchpoints').update({
    cancelled_at: now,
    cancelled_by: input.actor || null,
    cancel_reason: input.reason || null,
    touch_number: null,
  }).eq('id', input.touchId);
  if (error) fail(`Anulação do contato: ${error.message || error}`);

  const after = await touchSummary(client, input.leadId);
  await renumberTouches(client, after.activeOut);

  const nextStage = stageAfterCancellation(fromStage, { out: after.out, in: after.inbound });
  const stageChanged = nextStage !== fromStage;
  const cadence = input.cadence || await loadCadence(client);
  await reprogramNextAction(client, {
    leadId: input.leadId, stage: nextStage, enteredAt, summary: after, cadence,
    alsoSetStage: stageChanged ? nextStage : undefined,
  });

  if (stageChanged) {
    await recordStageEvent(client, {
      leadId: input.leadId, from: fromStage, to: nextStage, actor: input.actor,
      note: `Recalculado após anulação de um contato${input.reason ? `: ${input.reason}` : ''}.`,
      occurredAt: now,
    });
  }

  return { pipeline: (await loadPipeline(client, input.leadId))!, stageChanged };
}

// Recalcula next_action_at a partir dos toques ATIVOS (e, opcionalmente, grava a
// etapa junto, pra não fazer dois updates na mesma linha).
async function reprogramNextAction(client: DbClient, input: {
  leadId: string; stage: Stage; enteredAt: string; summary: TouchSummary;
  cadence: Cadence; alsoSetStage?: Stage;
}) {
  const dentroDaCadencia = input.stage === 'a_prospectar' || input.stage === 'em_cadencia';
  const nextActionAt = dentroDaCadencia
    ? computeNextActionAt({
        cadence: input.cadence, touchesDone: input.summary.out,
        lastTouchAt: input.summary.lastOutAt, enteredAt: input.enteredAt,
      })
    : null;
  const patch: Record<string, unknown> = { next_action_at: nextActionAt };
  if (input.alsoSetStage) patch.stage = input.alsoSetStage;
  const { error } = await client.from('lead_pipeline').update(patch).eq('lead_id', input.leadId);
  if (error) fail(`Reprogramação do próximo contato: ${error.message || error}`);
}
