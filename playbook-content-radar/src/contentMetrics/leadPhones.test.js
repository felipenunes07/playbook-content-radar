import { describe, expect, it } from 'vitest';
import {
  countByPhoneFilter, evidenceLabel, formatPhone, indexPhonesByLead, matchesPhoneFilter,
  phoneDisplay, phoneStatusMeta, phoneStatusOf, phoneToShow, reviewCandidates, reviewReason,
} from './leadPhones.js';

const row = (over = {}) => ({ lead_id: 'L1', match_status: 'MATCHED', phone_e164: '+5511999998888', ...over });

describe('leadPhones: a regra absoluta na fronteira da UI', () => {
  it('só MATCHED expõe telefone', () => {
    expect(phoneToShow(row({ match_status: 'MATCHED' }))).toBe('+5511999998888');
    expect(phoneToShow(row({ match_status: 'MATCHED_NO_PHONE' }))).toBe('');
    expect(phoneToShow(row({ match_status: 'REVIEW' }))).toBe('');
    expect(phoneToShow(row({ match_status: 'NOT_FOUND' }))).toBe('');
    expect(phoneToShow(row({ match_status: 'NOT_PROCESSED' }))).toBe('');
  });

  it('bloqueia telefone em REVIEW mesmo se a linha vier suja da API', () => {
    // Cenário defensivo: o CHECK do banco não deixaria essa linha existir, mas se ela
    // chegasse por qualquer caminho, a UI ainda não mostraria o número.
    expect(phoneToShow({ match_status: 'REVIEW', phone_e164: '+5511999998888' })).toBe('');
    expect(phoneDisplay({ match_status: 'REVIEW', phone_e164: '+5511999998888' })).toBe('');
  });

  it('status desconhecido cai em NOT_PROCESSED e não expõe nada', () => {
    expect(phoneStatusOf({ match_status: 'QUALQUER_COISA' })).toBe('NOT_PROCESSED');
    expect(phoneToShow({ match_status: 'QUALQUER_COISA', phone_e164: '+5511999998888' })).toBe('');
  });
});

describe('leadPhones: rótulos e formatação', () => {
  it('rotula os quatro estados que a tela mostra', () => {
    expect(phoneStatusMeta({ match_status: 'MATCHED' }).label).toBe('Telefone encontrado');
    expect(phoneStatusMeta({ match_status: 'MATCHED_NO_PHONE' }).label).toBe('Aguardando telefone');
    expect(phoneStatusMeta({ match_status: 'REVIEW' }).label).toBe('Revisar match');
    expect(phoneStatusMeta({ match_status: 'NOT_FOUND' }).label).toBe('Não encontrado no Tally');
  });

  it('formata celular e fixo brasileiros', () => {
    expect(formatPhone('+5511999998888')).toBe('+55 11 99999-8888');
    expect(formatPhone('+551133334444')).toBe('+55 11 3333-4444');
  });

  it('deixa passar número fora do padrão BR sem inventar formato', () => {
    expect(formatPhone('+13125551234')).toBe('+13125551234');
    expect(formatPhone('')).toBe('');
  });
});

describe('leadPhones: filtros', () => {
  const rows = [
    row({ lead_id: 'a', match_status: 'MATCHED' }),
    row({ lead_id: 'b', match_status: 'MATCHED_NO_PHONE' }),
    row({ lead_id: 'c', match_status: 'MATCHED_NO_PHONE' }),
    row({ lead_id: 'd', match_status: 'REVIEW' }),
    row({ lead_id: 'e', match_status: 'NOT_FOUND' }),
  ];

  it('conta por estado', () => {
    expect(countByPhoneFilter(rows)).toEqual({
      todos: 5, matched: 1, aguardando: 2, revisar: 1, nao_encontrado: 1,
    });
  });

  it('"Todos" não filtra nada', () => {
    expect(rows.filter((item) => matchesPhoneFilter(item, 'todos'))).toHaveLength(5);
  });

  it('filtra por estado', () => {
    expect(rows.filter((item) => matchesPhoneFilter(item, 'aguardando'))).toHaveLength(2);
    expect(rows.filter((item) => matchesPhoneFilter(item, 'revisar'))).toHaveLength(1);
  });

  it('indexa por lead para o join com a lista de leads', () => {
    const index = indexPhonesByLead(rows);
    expect(index.get('d').match_status).toBe('REVIEW');
    expect(index.get('inexistente')).toBeUndefined();
  });
});

describe('leadPhones: fila de REVIEW', () => {
  const reviewRow = {
    lead_id: 'L1', match_status: 'REVIEW', match_method: 'nome_parcial',
    phone_e164: null,
    rejected_submission_ids: ['s_rejeitado'],
    candidates: [
      { submissionId: 's1', fullName: 'Ely Behar', email: 'ebehar@4takes.com.br', formName: 'Claude Flabe 5', submittedAt: '2026-08-10T00:00:00Z', evidence: ['form_do_post', 'dominio_empresa'], phoneE164: '+5511999998888' },
      { submissionId: 's_rejeitado', fullName: 'Outro Ely', email: 'x@gmail.com', formName: 'KipFlow', submittedAt: null, evidence: [], phoneE164: '' },
    ],
  };

  it('nunca entrega o número do candidato, só se ele tem telefone', () => {
    const [primeiro] = reviewCandidates(reviewRow);
    expect(primeiro.hasPhone).toBe(true);
    expect(JSON.stringify(primeiro)).not.toContain('5511999998888');
  });

  it('esconde candidatos já rejeitados', () => {
    const candidatos = reviewCandidates(reviewRow);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].submissionId).toBe('s1');
  });

  it('explica em português por que caiu em revisão', () => {
    expect(reviewReason(reviewRow)).toMatch(/nome do meio/);
    expect(reviewReason({ match_method: 'nome_exato_ambiguo' })).toMatch(/exatamente este nome/);
    expect(reviewReason({ match_method: 'desconhecido' })).toMatch(/Confiança insuficiente/);
  });

  it('traduz as evidências do matcher', () => {
    expect(evidenceLabel('form_do_post')).toMatch(/formulário do post/);
    expect(evidenceLabel('dominio_empresa')).toMatch(/domínio do e-mail/);
    expect(evidenceLabel('outra_coisa')).toBe('outra_coisa');
  });
});
