// END-TO-END do pipeline comercial contra o fakeSupabase (schema real cobrado a
// cada escrita). Prova o que o Felipe pediu antes de qualquer UI: que a partir das
// linhas gravadas conseguimos RECONSTRUIR a jornada inteira —
//   entrada → prospectado → primeiro contato → resposta → reunião → proposta → cliente
//
// LIMITE HONESTO DESTE ARQUIVO: não há Postgres no CI, então as views SQL
// (v_lead_funnel, v_lead_pipeline) não são executadas aqui. O que estes testes
// garantem é que o caminho de ESCRITA produz as linhas de onde os marcos saem, e
// `reconstructFunnel` abaixo espelha o min()/filter() da view pra provar que a
// reconstrução fecha. Divergência entre o espelho e o SQL só aparece rodando a
// migration num banco — por isso o espelho é curto e fica coloado na view.

import { describe, expect, it, beforeEach } from 'vitest';
import { createFakeSupabase } from './fakeSupabase.js';
import {
  archivePipeline, cancelTouch, enterPipeline, logTouch, moveStage,
  setNextAction, setNotes, setOwner, updateTouch,
} from '../../supabase/functions/_shared/pipelineOps.ts';
import { DEFAULT_CADENCE } from '../../supabase/functions/_shared/pipeline.ts';

const LEAD = 'lead-ana';
const ICP = 'icp-comercial';

function seed() {
  return createFakeSupabase({
    leads: [{
      id: LEAD, public_identifier: 'ana-souza', full_name: 'Ana Souza',
      company_name: 'Acme', company_size: 450, job_title: 'Head de Growth',
      qualification_status: 'qualified', qualification_icp_id: ICP, score: 82,
      enrichment_status: 'enriched', first_seen_post_id: 'post-36-skills',
      created_at: '2026-08-01T09:00:00.000Z',
    }],
    lead_qualifications: [{
      lead_id: LEAD, icp_id: ICP, status: 'qualified', score: 82,
      decided_by: 'llm', decided_at: '2026-08-03T10:00:00.000Z',
    }],
    lead_outreach: [{ lead_id: LEAD, status: 'new' }],
    pipeline_settings: [{ id: true, cadence: DEFAULT_CADENCE }],
  });
}

// Espelho de public.v_lead_funnel: mesmos min()/filter, mesma regra de derivação.
// contatado_em SÓ sai de touchpoint outbound — nunca de movimentação de etapa.
function reconstructFunnel(db, leadId) {
  const lead = db._dump('leads').find((r) => r.id === leadId);
  const pipeline = db._dump('lead_pipeline').find((r) => r.lead_id === leadId) || null;
  const touches = db._dump('lead_touchpoints').filter((r) => r.lead_id === leadId);
  const events = db._dump('lead_stage_events').filter((r) => r.lead_id === leadId);
  const quals = db._dump('lead_qualifications')
    .filter((r) => r.lead_id === leadId && ['qualified', 'review'].includes(r.status));

  // Toque anulado não conta em marco nenhum — igual ao `cancelled_at is null` da view.
  const ativos = touches.filter((t) => !t.cancelled_at);
  const min = (rows, field) => rows.reduce(
    (acc, r) => (r[field] && (!acc || r[field] < acc) ? r[field] : acc), null,
  );
  const firstStage = (stage) => min(events.filter((e) => e.to_stage === stage), 'occurred_at');

  return {
    entrou_em: lead?.created_at || null,
    aprovado_em: min(quals, 'decided_at'),
    prospectado_em: pipeline?.entered_at || null,
    contatado_em: min(ativos.filter((t) => t.direction === 'out'), 'touched_at'),
    // Só do touchpoint inbound ativo — sem fallback no evento de etapa, que é
    // append-only e manteria uma resposta anulada viva no funil pra sempre.
    respondeu_em: min(ativos.filter((t) => t.direction === 'in'), 'touched_at'),
    reuniao_em: firstStage('reuniao'),
    proposta_em: firstStage('proposta'),
    cliente_em: firstStage('cliente'),
    perdido_em: firstStage('perdido'),
    stage: pipeline?.stage || null,
    archived_at: pipeline?.archived_at || null,
  };
}

describe('jornada completa reconstruída a partir das linhas gravadas', () => {
  let db;
  beforeEach(() => { db = seed(); });

  it('entrada → prospectado → 1º contato → resposta → reunião → proposta → cliente', async () => {
    await enterPipeline(db, { leadId: LEAD, icpId: ICP, owner: 'Victor Baggio', actor: 'Victor', now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', actor: 'Victor', touchedAt: '2026-08-28T14:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'in', actor: 'Victor', touchedAt: '2026-08-29T09:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'reuniao', actor: 'Victor', now: '2026-09-02T10:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'proposta', actor: 'Victor', now: '2026-09-08T10:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'cliente', actor: 'Victor', now: '2026-09-19T10:00:00.000Z' });

    const funil = reconstructFunnel(db, LEAD);

    // Os oito marcos, todos datados e na ordem.
    expect(funil).toMatchObject({
      entrou_em: '2026-08-01T09:00:00.000Z',
      aprovado_em: '2026-08-03T10:00:00.000Z',
      prospectado_em: '2026-08-27T12:00:00.000Z',
      contatado_em: '2026-08-28T14:00:00.000Z',
      respondeu_em: '2026-08-29T09:00:00.000Z',
      reuniao_em: '2026-09-02T10:00:00.000Z',
      proposta_em: '2026-09-08T10:00:00.000Z',
      cliente_em: '2026-09-19T10:00:00.000Z',
      stage: 'cliente',
    });

    const ordem = [
      funil.entrou_em, funil.aprovado_em, funil.prospectado_em, funil.contatado_em,
      funil.respondeu_em, funil.reuniao_em, funil.proposta_em, funil.cliente_em,
    ];
    expect([...ordem].sort()).toEqual(ordem);

    // Tempo entre etapas: o que a aba Funil vai mostrar como mediana.
    const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
    expect(dias(funil.prospectado_em, funil.contatado_em)).toBe(1);   // selecionar → tocar
    expect(dias(funil.entrou_em, funil.cliente_em)).toBe(49);         // ciclo completo
  });

  it('o histórico de etapas fica completo e em ordem', async () => {
    await enterPipeline(db, { leadId: LEAD, icpId: ICP, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'in', touchedAt: '2026-08-29T09:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'reuniao', now: '2026-09-02T10:00:00.000Z' });

    expect(db._dump('lead_stage_events').map((e) => e.to_stage))
      .toEqual(['a_prospectar', 'em_cadencia', 'respondeu', 'reuniao']);
    // from_stage encadeia: dá pra reconstruir o caminho sem olhar as datas.
    expect(db._dump('lead_stage_events').map((e) => e.from_stage))
      .toEqual([null, 'a_prospectar', 'em_cadencia', 'respondeu']);
  });
});

describe('selecionar não é contatar', () => {
  let db;
  beforeEach(() => { db = seed(); });

  it('marcar "Prospectado" NÃO cria touchpoint — Prospectados ≠ Contatados', async () => {
    await enterPipeline(db, { leadId: LEAD, icpId: ICP, now: '2026-08-27T12:00:00.000Z' });

    expect(db._dump('lead_touchpoints')).toHaveLength(0);
    const funil = reconstructFunnel(db, LEAD);
    expect(funil.prospectado_em).toBe('2026-08-27T12:00:00.000Z');
    expect(funil.contatado_em).toBeNull(); // é ISTO que revela o vazamento
  });

  it('o card nasce em "A prospectar", devendo contato hoje', async () => {
    const row = await enterPipeline(db, { leadId: LEAD, icpId: ICP, now: '2026-08-27T12:00:00.000Z' });
    expect(row.stage).toBe('a_prospectar');
    expect(row.next_action_at).toBe('2026-08-27');
  });

  it('o ICP de origem e o responsável ficam gravados no card', async () => {
    const row = await enterPipeline(db, { leadId: LEAD, icpId: ICP, owner: 'Victor Baggio', now: '2026-08-27T12:00:00.000Z' });
    expect(row).toMatchObject({ icp_id: ICP, owner: 'Victor Baggio' });
  });
});

describe('"contatado" é derivado do toque, nunca de arrastar card', () => {
  let db;
  beforeEach(() => { db = seed(); });

  it('o 1º toque outbound move o card sozinho e registra o evento', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    const result = await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });

    expect(result.stageChanged).toBe(true);
    expect(result.pipeline.stage).toBe('em_cadencia');
    expect(result.touchNumber).toBe(1);
    const evento = db._dump('lead_stage_events').at(-1);
    expect(evento).toMatchObject({ from_stage: 'a_prospectar', to_stage: 'em_cadencia' });
    expect(evento.note).toContain('1º contato outbound');
  });

  it('a numeração dos toques acompanha a cadência e a régua anda com o toque', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    const t1 = await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    expect(t1.touchNumber).toBe(1);
    expect(t1.pipeline.next_action_at).toBe('2026-09-02'); // 28/08 + 5

    const t2 = await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-09-04T14:00:00.000Z' });
    expect(t2.touchNumber).toBe(2);
    expect(t2.pipeline.next_action_at).toBe('2026-09-13'); // 04/09 + 9, não 02/09 + 9

    const t3 = await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-09-13T14:00:00.000Z' });
    expect(t3.touchNumber).toBe(3);
    expect(t3.pipeline.next_action_at).toBeNull(); // cadência esgotada: decisão humana
  });

  it('toque inbound leva a "Respondeu" e zera a cobrança de follow-up', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    const inbound = await logTouch(db, { leadId: LEAD, direction: 'in', touchedAt: '2026-08-29T09:00:00.000Z' });

    expect(inbound.pipeline.stage).toBe('respondeu');
    expect(inbound.pipeline.next_action_at).toBeNull();
    expect(inbound.touchNumber).toBeNull(); // resposta não tem número de cadência
  });

  it('registrar contato sem o lead estar no board é erro, não linha órfã', async () => {
    await expect(logTouch(db, { leadId: LEAD, direction: 'out' }))
      .rejects.toThrow(/não está no pipeline/);
    expect(db._dump('lead_touchpoints')).toHaveLength(0);
  });
});

describe('marcar "Respondeu" na mão deixa evidência', () => {
  let db;
  beforeEach(() => { db = seed(); });

  it('gera o touchpoint inbound junto — o marco do funil ganha lastro', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    const result = await moveStage(db, { leadId: LEAD, toStage: 'respondeu', actor: 'Victor', now: '2026-08-30T11:00:00.000Z' });

    expect(result.inboundRecorded).toBe(true);
    const inbound = db._dump('lead_touchpoints').filter((t) => t.direction === 'in');
    expect(inbound).toHaveLength(1);
    expect(inbound[0].touched_at).toBe('2026-08-30T11:00:00.000Z');
    expect(reconstructFunnel(db, LEAD).respondeu_em).toBe('2026-08-30T11:00:00.000Z');
  });

  it('não duplica evidência se a resposta já tinha sido registrada', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'in', touchedAt: '2026-08-29T09:00:00.000Z' });
    // Já está em 'respondeu' pelo toque; volta pra cadência e marca de novo na mão.
    await moveStage(db, { leadId: LEAD, toStage: 'em_cadencia', now: '2026-08-31T10:00:00.000Z' });
    const result = await moveStage(db, { leadId: LEAD, toStage: 'respondeu', now: '2026-09-01T10:00:00.000Z' });

    expect(result.inboundRecorded).toBe(false);
    expect(db._dump('lead_touchpoints').filter((t) => t.direction === 'in')).toHaveLength(1);
  });

  it('as etapas seguintes não inventam touchpoint', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    const result = await moveStage(db, { leadId: LEAD, toStage: 'reuniao', now: '2026-09-02T10:00:00.000Z' });
    expect(result.inboundRecorded).toBe(false);
    expect(db._dump('lead_touchpoints')).toHaveLength(0);
  });
});

describe('lead_stage_events é append-only e preserva reentradas', () => {
  let db;
  beforeEach(() => { db = seed(); });

  it('ida e volta na mesma etapa gera DOIS eventos, e o marco fica no primeiro', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'reuniao', now: '2026-09-02T10:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'em_cadencia', now: '2026-09-05T10:00:00.000Z' }); // reunião caiu
    await moveStage(db, { leadId: LEAD, toStage: 'reuniao', now: '2026-09-20T10:00:00.000Z' });     // remarcou

    const reunioes = db._dump('lead_stage_events').filter((e) => e.to_stage === 'reuniao');
    expect(reunioes).toHaveLength(2); // reentrada preservada, nada sobrescrito
    // Conversão mede "chegou alguma vez": o marco é a PRIMEIRA chegada.
    expect(reconstructFunnel(db, LEAD).reuniao_em).toBe('2026-09-02T10:00:00.000Z');
  });

  it('clicar na etapa em que já está é no-op, não evento fantasma', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    const antes = db._dump('lead_stage_events').length;
    const result = await moveStage(db, { leadId: LEAD, toStage: 'a_prospectar', now: '2026-08-28T10:00:00.000Z' });
    expect(result.moved).toBe(false);
    expect(db._dump('lead_stage_events')).toHaveLength(antes);
  });

  it('etapa inválida é rejeitada antes de qualquer escrita', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    const antes = db._dump('lead_stage_events').length;
    await expect(moveStage(db, { leadId: LEAD, toStage: 'contato_1' })).rejects.toThrow(/Etapa inválida/);
    expect(db._dump('lead_stage_events')).toHaveLength(antes);
  });
});

describe('arquivar nunca destrói histórico', () => {
  let db;
  beforeEach(() => { db = seed(); });

  it('desmarcar "Prospectado" preserva touchpoints e eventos', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'in', touchedAt: '2026-08-29T09:00:00.000Z' });
    const eventosAntes = db._dump('lead_stage_events').length;

    await archivePipeline(db, { leadId: LEAD, reason: 'Selecionei errado', actor: 'Felipe', now: '2026-08-30T10:00:00.000Z' });

    expect(db._dump('lead_touchpoints')).toHaveLength(2);
    expect(db._dump('lead_stage_events').length).toBe(eventosAntes + 1); // o arquivamento também é evento
    expect(db._dump('lead_stage_events').at(-1)).toMatchObject({ to_stage: 'arquivado', from_stage: 'respondeu' });

    // A jornada continua reconstruível depois de arquivar — é o ponto da auditoria.
    const funil = reconstructFunnel(db, LEAD);
    expect(funil.contatado_em).toBe('2026-08-28T14:00:00.000Z');
    expect(funil.respondeu_em).toBe('2026-08-29T09:00:00.000Z');
    expect(funil.archived_at).toBe('2026-08-30T10:00:00.000Z');
  });

  it('card arquivado sai da cobrança e não aceita contato novo', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    const row = await archivePipeline(db, { leadId: LEAD, now: '2026-08-30T10:00:00.000Z' });
    expect(row.next_action_at).toBeNull();
    await expect(logTouch(db, { leadId: LEAD, direction: 'out' })).rejects.toThrow(/arquivado/);
  });

  it('remarcar preserva o entered_at original — a coorte não se reescreve', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    await archivePipeline(db, { leadId: LEAD, now: '2026-08-30T10:00:00.000Z' });
    const reativado = await enterPipeline(db, { leadId: LEAD, now: '2026-09-15T10:00:00.000Z' });

    expect(reativado.entered_at).toBe('2026-08-27T12:00:00.000Z');
    expect(reativado.archived_at).toBeNull();
    expect(db._dump('lead_stage_events').at(-1)).toMatchObject({ to_stage: 'reativado' });
  });

  it('"perdido" e "arquivado" são coisas diferentes no funil', async () => {
    await enterPipeline(db, { leadId: LEAD, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'perdido', lostReason: 'Sem budget', now: '2026-09-20T10:00:00.000Z' });

    const funil = reconstructFunnel(db, LEAD);
    expect(funil.perdido_em).toBe('2026-09-20T10:00:00.000Z'); // conta como perda
    expect(funil.archived_at).toBeNull();                       // não é arquivamento
    const pipeline = db._dump('lead_pipeline')[0];
    expect(pipeline.lost_reason).toBe('Sem budget');
  });
});

describe('backfill: prospectados antigos entram sem toque inventado', () => {
  it('pipeline sem touchpoint deixa contatado_em nulo — a verdade, não um chute', async () => {
    const db = seed();
    // Espelha o INSERT da migration: entrada reconstruída de prospected_at.
    await enterPipeline(db, { leadId: LEAD, icpId: ICP, actor: 'backfill', now: '2026-08-10T12:00:00.000Z' });

    const funil = reconstructFunnel(db, LEAD);
    expect(funil.prospectado_em).toBe('2026-08-10T12:00:00.000Z');
    expect(funil.contatado_em).toBeNull();
    expect(db._dump('lead_touchpoints')).toHaveLength(0);
    // E ele aparece como follow-up atrasado, que é o comportamento correto:
    // foi selecionado há semanas e nunca recebeu mensagem.
    expect(db._dump('lead_pipeline')[0].next_action_at).toBe('2026-08-10');
  });
});

describe('campos operacionais do card', () => {
  let db;
  beforeEach(async () => {
    db = seed();
    await enterPipeline(db, { leadId: LEAD, icpId: ICP, now: '2026-08-27T12:00:00.000Z' });
  });

  it('reagendamento manual sobrescreve a cadência', async () => {
    const row = await setNextAction(db, { leadId: LEAD, nextActionAt: '2026-09-10' });
    expect(row.next_action_at).toBe('2026-09-10');
  });

  it('data fora do formato é rejeitada antes de gravar', async () => {
    await expect(setNextAction(db, { leadId: LEAD, nextActionAt: '10/09/2026' }))
      .rejects.toThrow(/Data inválida/);
  });

  it('responsável é editável — o board é compartilhado mas filtrável', async () => {
    expect((await setOwner(db, { leadId: LEAD, owner: 'Fernando Tedesco' })).owner).toBe('Fernando Tedesco');
    expect((await setOwner(db, { leadId: LEAD, owner: null })).owner).toBeNull();
  });

  it('observações do lead: texto livre, editável, e não vira evento', async () => {
    const eventosAntes = db._dump('lead_stage_events').length;
    const row = await setNotes(db, { leadId: LEAD, notes: 'Empresa em fusão; retomar depois do Q4.' });
    expect(row.notes).toBe('Empresa em fusão; retomar depois do Q4.');

    const editado = await setNotes(db, { leadId: LEAD, notes: 'Fusão concluída — retomar já.' });
    expect(editado.notes).toBe('Fusão concluída — retomar já.');
    expect(db._dump('lead_stage_events').length).toBe(eventosAntes); // observação não é marco
    expect((await setNotes(db, { leadId: LEAD, notes: '   ' })).notes).toBeNull();
  });
});

describe('corrigir um contato já registrado', () => {
  let db;
  beforeEach(async () => {
    db = seed();
    await enterPipeline(db, { leadId: LEAD, icpId: ICP, now: '2026-08-27T12:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', note: 'mandei o convite', touchedAt: '2026-08-28T14:00:00.000Z' });
  });

  const touchId = () => db._dump('lead_touchpoints')[0].id;

  it('editar a nota não mexe na cadência', async () => {
    const result = await updateTouch(db, { leadId: LEAD, touchId: touchId(), note: 'mandei o convite + áudio' });
    expect(result.renumbered).toBe(false);
    expect(db._dump('lead_touchpoints')[0].note).toBe('mandei o convite + áudio');
    expect(result.pipeline.next_action_at).toBe('2026-09-02'); // inalterado
  });

  it('corrigir a data reprograma o próximo contato', async () => {
    // Foi tocado no dia 30, não no 28.
    const result = await updateTouch(db, { leadId: LEAD, touchId: touchId(), touchedAt: '2026-08-30T14:00:00.000Z' });
    expect(result.renumbered).toBe(true);
    expect(result.pipeline.next_action_at).toBe('2026-09-04'); // 30/08 + 5
    expect(reconstructFunnel(db, LEAD).contatado_em).toBe('2026-08-30T14:00:00.000Z');
  });

  it('a direção não é editável por aqui — anular e registrar de novo é o caminho', async () => {
    // A op nem expõe `direction`; a function rejeita explicitamente. Aqui garantimos
    // que editar outros campos jamais altera o sentido do registro.
    await updateTouch(db, { leadId: LEAD, touchId: touchId(), note: 'x', channel: 'whatsapp' });
    expect(db._dump('lead_touchpoints')[0].direction).toBe('out');
    expect(db._dump('lead_touchpoints')[0].channel).toBe('whatsapp');
  });

  it('contato de outro lead é rejeitado', async () => {
    await expect(updateTouch(db, { leadId: 'lead-outro', touchId: touchId(), note: 'x' }))
      .rejects.toThrow(/não está no pipeline/);
  });
});

describe('anular contato registrado por engano', () => {
  let db;
  beforeEach(async () => {
    db = seed();
    await enterPipeline(db, { leadId: LEAD, icpId: ICP, now: '2026-08-27T12:00:00.000Z' });
  });

  const touches = () => db._dump('lead_touchpoints');

  it('anular o ÚNICO contato devolve o card para "A prospectar"', async () => {
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    expect(db._dump('lead_pipeline')[0].stage).toBe('em_cadencia');

    const result = await cancelTouch(db, {
      leadId: LEAD, touchId: touches()[0].id, reason: 'cliquei sem querer',
      actor: 'Victor', now: '2026-08-29T10:00:00.000Z',
    });

    expect(result.stageChanged).toBe(true);
    expect(result.pipeline.stage).toBe('a_prospectar');
    // O funil volta a dizer a verdade: selecionado e nunca tocado.
    expect(reconstructFunnel(db, LEAD).contatado_em).toBeNull();
    // E a linha NÃO foi apagada.
    expect(touches()).toHaveLength(1);
    expect(touches()[0]).toMatchObject({ cancelled_by: 'Victor', cancel_reason: 'cliquei sem querer' });
    // A volta de etapa fica na auditoria.
    expect(db._dump('lead_stage_events').at(-1)).toMatchObject({ from_stage: 'em_cadencia', to_stage: 'a_prospectar' });
  });

  it('anular o 1º de três renumera os que sobraram', async () => {
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-09-02T14:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-09-11T14:00:00.000Z' });
    expect(touches().map((t) => t.touch_number)).toEqual([1, 2, 3]);

    await cancelTouch(db, { leadId: LEAD, touchId: touches()[0].id, now: '2026-09-12T10:00:00.000Z' });

    const ativos = touches().filter((t) => !t.cancelled_at);
    expect(ativos.map((t) => t.touch_number)).toEqual([1, 2]); // o card para de anunciar "3º contato"
    expect(touches().find((t) => t.cancelled_at).touch_number).toBeNull();
    // E o funil passa a apontar o 2º toque como o primeiro contato real.
    expect(reconstructFunnel(db, LEAD).contatado_em).toBe('2026-09-02T14:00:00.000Z');
  });

  it('anular a resposta tira o card de "Respondeu"', async () => {
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await logTouch(db, { leadId: LEAD, direction: 'in', touchedAt: '2026-08-29T09:00:00.000Z' });
    expect(db._dump('lead_pipeline')[0].stage).toBe('respondeu');

    const inbound = touches().find((t) => t.direction === 'in');
    const result = await cancelTouch(db, { leadId: LEAD, touchId: inbound.id, now: '2026-08-30T10:00:00.000Z' });

    expect(result.pipeline.stage).toBe('em_cadencia'); // ainda tem 1 toque outbound ativo
    expect(result.pipeline.next_action_at).toBe('2026-09-02'); // cobrança volta
    expect(reconstructFunnel(db, LEAD).respondeu_em).toBeNull();
  });

  it('não reverte etapa que foi decisão comercial', async () => {
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await moveStage(db, { leadId: LEAD, toStage: 'reuniao', now: '2026-09-02T10:00:00.000Z' });

    const result = await cancelTouch(db, { leadId: LEAD, touchId: touches()[0].id, now: '2026-09-03T10:00:00.000Z' });

    expect(result.stageChanged).toBe(false);
    expect(result.pipeline.stage).toBe('reuniao'); // nenhum conserto de registro desmarca reunião
    expect(reconstructFunnel(db, LEAD).reuniao_em).toBe('2026-09-02T10:00:00.000Z');
  });

  it('anular duas vezes é no-op, não evento duplicado', async () => {
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await cancelTouch(db, { leadId: LEAD, touchId: touches()[0].id, now: '2026-08-29T10:00:00.000Z' });
    const eventos = db._dump('lead_stage_events').length;

    const segunda = await cancelTouch(db, { leadId: LEAD, touchId: touches()[0].id, now: '2026-08-30T10:00:00.000Z' });
    expect(segunda.stageChanged).toBe(false);
    expect(db._dump('lead_stage_events')).toHaveLength(eventos);
    expect(touches()[0].cancelled_at).toBe('2026-08-29T10:00:00.000Z'); // data original preservada
  });

  it('contato anulado não pode ser editado', async () => {
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await cancelTouch(db, { leadId: LEAD, touchId: touches()[0].id, now: '2026-08-29T10:00:00.000Z' });
    await expect(updateTouch(db, { leadId: LEAD, touchId: touches()[0].id, note: 'x' }))
      .rejects.toThrow(/anulado/);
  });

  it('o próximo toque depois de uma anulação reusa o número liberado', async () => {
    await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-28T14:00:00.000Z' });
    await cancelTouch(db, { leadId: LEAD, touchId: touches()[0].id, now: '2026-08-29T10:00:00.000Z' });
    const novo = await logTouch(db, { leadId: LEAD, direction: 'out', touchedAt: '2026-08-30T14:00:00.000Z' });
    expect(novo.touchNumber).toBe(1); // e não 2
    expect(novo.pipeline.stage).toBe('em_cadencia');
  });
});
