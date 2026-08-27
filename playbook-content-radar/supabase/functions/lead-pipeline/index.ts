import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';
import { CHANNELS, STAGES, isChannel, parseCadence } from '../_shared/pipeline.ts';
import {
  archivePipeline, cancelTouch, enterPipeline, loadCadence, logTouch, moveStage,
  setCampaign, setNextAction, setNotes, setOwner, updateTouch,
} from '../_shared/pipelineOps.ts';

// Operações do Kanban comercial. A entrada no board NÃO passa por aqui — ela é
// disparada pelo checkbox "Prospectado" na aba Leads ICP, que continua chamando
// `lead-outreach` (action set_status). Aqui ficam as ações do board em si.
// Ver docs/superpowers/plans/2026-08-27-kanban-e-funil-comercial.md
//
//   { action: 'log_touch', leadId, direction, channel?, note?, touchedAt? }
//   { action: 'update_touch', leadId, touchId, note?, channel?, touchedAt? }
//   { action: 'cancel_touch', leadId, touchId, reason? }  // anula, não apaga
//   { action: 'move_stage', leadId, toStage, note?, lostReason? }
//   { action: 'set_next_action', leadId, nextActionAt }   // null = limpar
//   { action: 'set_owner', leadId, owner }
//   { action: 'set_campaign', leadId, campaign }
//   { action: 'set_notes', leadId, notes }                // observações do lead
//   { action: 'archive', leadId, reason? }                // tira da operação, não apaga
//   { action: 'unarchive', leadId }
//   { action: 'get_settings' } | { action: 'save_settings', cadence }
//
// Tudo aqui é escrita pequena (uma linha, dois inserts), longe da parede de ~150s
// que mata o worker no plano free — a lógica pesada é a de leitura, e ela vive nas
// views v_lead_pipeline / v_lead_funnel.

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await request.json().catch(() => ({}));
    const expectedSecret = Deno.env.get('COLLECTOR_SHARED_SECRET');
    const hasSecret = Boolean(expectedSecret) && request.headers.get('x-collector-secret') === expectedSecret;
    if (!hasSecret && body?.manual !== true) throw new Error('Execução não autorizada');

    const client = adminClient();
    const action = String(body.action || '');
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : null;

    if (action === 'get_settings') {
      const cadence = await loadCadence(client);
      return json({ success: true, cadence, stages: STAGES, channels: CHANNELS });
    }

    if (action === 'save_settings') {
      // parseCadence normaliza antes de gravar: um jsonb torto salvo aqui viraria
      // fila de follow-up errada pra todo mundo, não só pra quem editou.
      const cadence = parseCadence(body.cadence);
      const { error } = await client.from('pipeline_settings')
        .upsert({ id: true, cadence }, { onConflict: 'id' });
      if (error) throw error;
      return json({ success: true, cadence });
    }

    const leadId = String(body.leadId || '');
    if (!leadId) throw new Error('leadId é obrigatório');

    if (action === 'log_touch') {
      const direction = String(body.direction || '');
      if (direction !== 'out' && direction !== 'in') throw new Error(`Direção inválida: ${direction}`);
      const channel = body.channel === undefined || body.channel === null ? 'linkedin' : body.channel;
      if (!isChannel(channel)) throw new Error(`Canal inválido: ${channel}`);
      const result = await logTouch(client, {
        leadId, direction, channel, actor,
        note: typeof body.note === 'string' ? body.note : null,
        touchedAt: typeof body.touchedAt === 'string' ? body.touchedAt : undefined,
      });
      return json({
        success: true, leadId, touchNumber: result.touchNumber,
        stage: result.pipeline.stage, stageChanged: result.stageChanged,
        nextActionAt: result.pipeline.next_action_at,
      });
    }

    if (action === 'move_stage') {
      const result = await moveStage(client, {
        leadId, toStage: String(body.toStage || ''), actor,
        note: typeof body.note === 'string' ? body.note : null,
        lostReason: typeof body.lostReason === 'string' ? body.lostReason : null,
      });
      return json({
        success: true, leadId, stage: result.pipeline.stage, moved: result.moved,
        // O front avisa que a evidência foi criada: o operador precisa saber que o
        // marco do funil ganhou lastro, não que "só arrastou o card".
        inboundRecorded: result.inboundRecorded,
        nextActionAt: result.pipeline.next_action_at,
      });
    }

    if (action === 'set_next_action') {
      const raw = body.nextActionAt;
      const nextActionAt = raw === null || raw === '' ? null : String(raw);
      const row = await setNextAction(client, { leadId, nextActionAt });
      return json({ success: true, leadId, nextActionAt: row?.next_action_at ?? null });
    }

    if (action === 'set_owner') {
      const row = await setOwner(client, { leadId, owner: typeof body.owner === 'string' ? body.owner : null });
      return json({ success: true, leadId, owner: row?.owner ?? null });
    }

    if (action === 'set_campaign') {
      const row = await setCampaign(client, { leadId, campaign: typeof body.campaign === 'string' ? body.campaign : null });
      return json({ success: true, leadId, campaign: row?.campaign ?? null });
    }

    if (action === 'set_notes') {
      const row = await setNotes(client, { leadId, notes: typeof body.notes === 'string' ? body.notes : null });
      return json({ success: true, leadId, notes: row?.notes ?? null });
    }

    if (action === 'update_touch') {
      const touchId = String(body.touchId || '');
      if (!touchId) throw new Error('touchId é obrigatório');
      if (body.direction !== undefined) {
        // Trocar out↔in mudaria o marco que o registro sustenta no funil. O caminho
        // é anular e registrar de novo, pra auditoria mostrar a correção.
        throw new Error('A direção do contato não é editável — anule o contato e registre um novo');
      }
      if (body.channel !== undefined && !isChannel(body.channel)) throw new Error(`Canal inválido: ${body.channel}`);
      const result = await updateTouch(client, {
        leadId, touchId,
        note: body.note !== undefined ? (typeof body.note === 'string' ? body.note : null) : undefined,
        channel: body.channel !== undefined ? body.channel : undefined,
        touchedAt: typeof body.touchedAt === 'string' ? body.touchedAt : undefined,
      });
      return json({
        success: true, leadId, touchId, renumbered: result.renumbered,
        nextActionAt: result.pipeline.next_action_at,
      });
    }

    if (action === 'cancel_touch') {
      const touchId = String(body.touchId || '');
      if (!touchId) throw new Error('touchId é obrigatório');
      const result = await cancelTouch(client, {
        leadId, touchId, actor,
        reason: typeof body.reason === 'string' ? body.reason : null,
      });
      return json({
        success: true, leadId, touchId,
        // O front precisa avisar quando o card voltou de etapa: anular o único
        // contato devolve o lead pra "A prospectar", e isso não pode ser silencioso.
        stage: result.pipeline.stage, stageChanged: result.stageChanged,
        nextActionAt: result.pipeline.next_action_at,
      });
    }

    if (action === 'archive') {
      const row = await archivePipeline(client, {
        leadId, actor, reason: typeof body.reason === 'string' ? body.reason : null,
      });
      return json({ success: true, leadId, archivedAt: row?.archived_at ?? null });
    }

    if (action === 'unarchive') {
      const row = await enterPipeline(client, { leadId, actor });
      return json({ success: true, leadId, stage: row.stage, archivedAt: row.archived_at });
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (error) {
    const message = errorMessage(error);
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
