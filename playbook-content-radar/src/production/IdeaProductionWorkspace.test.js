import { describe, expect, it } from 'vitest';
import { stageOf } from './IdeaProductionWorkspace.jsx';

describe('stageOf', () => {
  it('mantém na produção quando existe copy mas o status continua Em Produção', () => {
    expect(stageOf({ computedStatus: 'em_producao', manualStatus: 'em_producao', finalPostText: 'Rascunho existente' })).toBe('production');
  });

  it('envia material para revisão quando não existe override de produção', () => {
    expect(stageOf({ computedStatus: 'aprovado', finalPostText: 'Material concluído' })).toBe('review');
  });

  it('mantém agendamento como etapa de maior prioridade', () => {
    expect(stageOf({ computedStatus: 'em_producao', finalPostText: 'Copy', scheduledAt: '2026-07-23' })).toBe('scheduled');
  });
});
