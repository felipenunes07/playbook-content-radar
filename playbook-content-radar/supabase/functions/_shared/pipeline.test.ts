import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CADENCE, addDays, computeNextActionAt, daysBetween, followUpState,
  inboundEvidenceNeeded, isStage, needsContactToday, nextTouchNumber, parseCadence,
  shouldSuggestDiscard, silenceState, stageAfterTouch, totalTouches,
} from './pipeline.ts';

const cadence = DEFAULT_CADENCE;

describe('cadência: configurável, nunca hardcoded', () => {
  it('o default são 3 toques em ~14 dias, com descarte sugerido aos 21', () => {
    expect(totalTouches(cadence)).toBe(3);
    // Intervalos são acumulativos a partir da entrada: 0 → +5 → +9 = 14 dias.
    const soma = cadence.steps.reduce((acc, s) => acc + s.intervalo_dias, 0);
    expect(soma).toBe(14);
    expect(cadence.sugerir_descarte_apos_dias).toBe(21);
  });

  it('aceita uma cadência custom do banco (5 toques em 30 dias)', () => {
    const custom = parseCadence({
      steps: [
        { n: 1, intervalo_dias: 0, label: 'Convite' },
        { n: 2, intervalo_dias: 3, label: 'Follow 1' },
        { n: 3, intervalo_dias: 7, label: 'Follow 2' },
        { n: 4, intervalo_dias: 10, label: 'Follow 3' },
        { n: 5, intervalo_dias: 10, label: 'Última tentativa' },
      ],
      sem_resposta_atencao_dias: 2,
      sem_resposta_alerta_dias: 5,
      sugerir_descarte_apos_dias: 45,
    });
    expect(totalTouches(custom)).toBe(5);
    expect(custom.sem_resposta_alerta_dias).toBe(5);
    expect(custom.steps[4].label).toBe('Última tentativa');
  });

  it('jsonb torto não derruba o board: cada campo cai no default isoladamente', () => {
    const torto = parseCadence({ steps: 'não é array', sem_resposta_alerta_dias: -3 });
    expect(torto.steps).toEqual(DEFAULT_CADENCE.steps);
    expect(torto.sem_resposta_alerta_dias).toBe(DEFAULT_CADENCE.sem_resposta_alerta_dias);
  });

  it('ordena os passos por n mesmo se vierem fora de ordem', () => {
    const fora = parseCadence({ steps: [{ n: 2, intervalo_dias: 5 }, { n: 1, intervalo_dias: 0 }] });
    expect(fora.steps.map((s) => s.n)).toEqual([1, 2]);
  });
});

describe('datas em UTC (a coluna é `date`; fuso local faria o card vencer torto)', () => {
  it('addDays atravessa virada de mês e ano', () => {
    expect(addDays('2026-08-27', 5)).toBe('2026-09-01');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('daysBetween é positivo quando a segunda data é depois', () => {
    expect(daysBetween('2026-08-27', '2026-09-01')).toBe(5);
    expect(daysBetween('2026-09-01', '2026-08-27')).toBe(-5);
  });
});

describe('próximo contato: o intervalo conta do toque anterior, não da entrada', () => {
  const enteredAt = '2026-08-27T12:00:00Z';

  it('card recém-selecionado vence no mesmo dia (nasce devendo o 1º contato)', () => {
    expect(computeNextActionAt({ cadence, touchesDone: 0, enteredAt })).toBe('2026-08-27');
  });

  it('depois do 1º toque, o 2º cai 5 dias DEPOIS DO TOQUE', () => {
    expect(computeNextActionAt({
      cadence, touchesDone: 1, lastTouchAt: '2026-08-27T15:00:00Z', enteredAt,
    })).toBe('2026-09-01');
  });

  it('1º contato atrasado NÃO faz o 2º disparar junto — a régua anda com a realidade', () => {
    // Entrou em 27/08, mas só foi contatado em 05/09 (9 dias de atraso).
    const atrasado = computeNextActionAt({
      cadence, touchesDone: 1, lastTouchAt: '2026-09-05T10:00:00Z', enteredAt,
    });
    expect(atrasado).toBe('2026-09-10'); // 05/09 + 5, não 01/09
    expect(daysBetween('2026-09-05', atrasado!)).toBe(5);
  });

  it('cadência esgotada devolve null: vira decisão humana, não mais cobrança', () => {
    expect(computeNextActionAt({
      cadence, touchesDone: 3, lastTouchAt: '2026-09-10T10:00:00Z', enteredAt,
    })).toBeNull();
  });

  it('numeração do toque segue a contagem de outbound', () => {
    expect(nextTouchNumber(0)).toBe(1);
    expect(nextTouchNumber(2)).toBe(3);
  });
});

describe('silêncio e follow-up são eixos independentes', () => {
  it('sem nenhum toque o card é "nunca contatado", não "aguardando resposta"', () => {
    expect(silenceState({ cadence, touchesDone: 0, respondeu: false, diasSemResposta: null }))
      .toBe('nunca_contatado');
  });

  it('os limiares saem da cadência, não de constante', () => {
    const base = { cadence, touchesDone: 1, respondeu: false };
    expect(silenceState({ ...base, diasSemResposta: 1 })).toBe('aguardando_resposta');
    expect(silenceState({ ...base, diasSemResposta: 3 })).toBe('sem_resposta_atencao');
    expect(silenceState({ ...base, diasSemResposta: 7 })).toBe('sem_resposta_alerta');

    const curta = parseCadence({ ...cadence, sem_resposta_atencao_dias: 1, sem_resposta_alerta_dias: 2 });
    expect(silenceState({ ...base, cadence: curta, diasSemResposta: 2 })).toBe('sem_resposta_alerta');
  });

  it('quem respondeu sai do eixo de silêncio', () => {
    expect(silenceState({ cadence, touchesDone: 2, respondeu: true, diasSemResposta: 30 }))
      .toBe('respondeu');
  });

  it('sem resposta há 6 dias PODE estar com follow-up em dia — são perguntas diferentes', () => {
    const silencio = silenceState({ cadence, touchesDone: 1, respondeu: false, diasSemResposta: 6 });
    const followUp = followUpState({
      stage: 'em_cadencia', archived: false, respondeu: false,
      nextActionAt: '2026-09-03', today: '2026-09-01',
    });
    expect(silencio).toBe('sem_resposta_atencao');
    expect(followUp).toBe('em_dia');
  });

  it('follow-up: vence hoje, atrasado, e cadência esgotada não é atraso', () => {
    const base = { stage: 'em_cadencia' as const, archived: false, respondeu: false };
    expect(followUpState({ ...base, nextActionAt: '2026-09-01', today: '2026-09-01' })).toBe('vence_hoje');
    expect(followUpState({ ...base, nextActionAt: '2026-08-28', today: '2026-09-01' })).toBe('atrasado');
    expect(followUpState({ ...base, nextActionAt: null, today: '2026-09-01' })).toBe('em_dia');
  });

  it('arquivado, respondido ou fora da cadência não pede contato', () => {
    const base = { nextActionAt: '2026-08-01', today: '2026-09-01' };
    expect(followUpState({ ...base, stage: 'em_cadencia', archived: true, respondeu: false })).toBe('nao_se_aplica');
    expect(followUpState({ ...base, stage: 'em_cadencia', archived: false, respondeu: true })).toBe('nao_se_aplica');
    expect(followUpState({ ...base, stage: 'reuniao', archived: false, respondeu: false })).toBe('nao_se_aplica');
  });
});

describe('fila "Precisa de contato hoje"', () => {
  it('card recém-selecionado entra na fila desde o dia 1', () => {
    expect(needsContactToday({
      stage: 'a_prospectar', archived: false, respondeu: false,
      nextActionAt: '2026-08-27', today: '2026-08-27',
    })).toBe(true);
  });

  it('card atrasado entra; card em dia não', () => {
    const base = { stage: 'em_cadencia' as const, archived: false, respondeu: false, today: '2026-09-01' };
    expect(needsContactToday({ ...base, nextActionAt: '2026-08-25' })).toBe(true);
    expect(needsContactToday({ ...base, nextActionAt: '2026-09-05' })).toBe(false);
  });
});

describe('descarte é sugerido, nunca automático', () => {
  it('só sugere depois de esgotar a cadência E o prazo de silêncio', () => {
    const base = { cadence, respondeu: false };
    expect(shouldSuggestDiscard({ ...base, touchesDone: 2, diasSemResposta: 40 })).toBe(false); // cadência não esgotou
    expect(shouldSuggestDiscard({ ...base, touchesDone: 3, diasSemResposta: 10 })).toBe(false); // prazo não bateu
    expect(shouldSuggestDiscard({ ...base, touchesDone: 3, diasSemResposta: 21 })).toBe(true);
  });

  it('quem respondeu nunca é sugerido pra descarte', () => {
    expect(shouldSuggestDiscard({ cadence, touchesDone: 3, respondeu: true, diasSemResposta: 90 })).toBe(false);
  });
});

describe('"contatado" é derivado do toque, não da movimentação manual', () => {
  it('1º toque outbound tira o card de "A prospectar" sozinho', () => {
    expect(stageAfterTouch('a_prospectar', 'out')).toBe('em_cadencia');
  });

  it('toque inbound marca "Respondeu", venha de onde vier na cadência', () => {
    expect(stageAfterTouch('a_prospectar', 'in')).toBe('respondeu');
    expect(stageAfterTouch('em_cadencia', 'in')).toBe('respondeu');
  });

  it('etapa adiante nunca regride por um toque novo', () => {
    // Continuar conversando com um cliente não o devolve pra fila.
    expect(stageAfterTouch('cliente', 'out')).toBe('cliente');
    expect(stageAfterTouch('reuniao', 'in')).toBe('reuniao');
    expect(stageAfterTouch('proposta', 'out')).toBe('proposta');
  });

  it('toque outbound em quem já respondeu mantém "Respondeu"', () => {
    expect(stageAfterTouch('respondeu', 'out')).toBe('respondeu');
  });
});

describe('marcar "Respondeu" na mão deixa evidência', () => {
  it('sem touchpoint inbound, exige gravar um junto', () => {
    expect(inboundEvidenceNeeded('respondeu', false)).toBe(true);
  });

  it('com evidência já existente, não duplica', () => {
    expect(inboundEvidenceNeeded('respondeu', true)).toBe(false);
  });

  it('as etapas seguintes têm evidência própria em lead_stage_events', () => {
    expect(inboundEvidenceNeeded('reuniao', false)).toBe(false);
    expect(inboundEvidenceNeeded('cliente', false)).toBe(false);
  });
});

describe('validação de etapa', () => {
  it('aceita as sete e rejeita o resto', () => {
    expect(isStage('a_prospectar')).toBe(true);
    expect(isStage('cliente')).toBe(true);
    expect(isStage('contato_1')).toBe(false); // nome da versão anterior do plano
    expect(isStage('')).toBe(false);
  });
});
