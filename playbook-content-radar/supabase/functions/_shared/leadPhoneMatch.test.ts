import { describe, expect, it } from 'vitest';
import { matchLeads, needsReprocessing } from './leadPhoneMatch.ts';
import { submissionsFromCsv } from './tallySource.ts';

const HEADER = '"Submission ID","Respondent ID","Submitted at","Nome","Telefone","Sobrenome","E-mail"';

function submissions(formId: string, ...linhas: string[]) {
  return submissionsFromCsv([HEADER, ...linhas].join('\n'), { formId, formName: `form ${formId}` }).submissions;
}

const lead = (over: Partial<Parameters<typeof matchLeads>[0][number]> = {}) => ({
  id: 'lead-1', fullName: 'Ana Jardim', companyName: null, companyUrl: null,
  postFormIds: [], firstCommentedAt: null, ...over,
});

describe('leadPhoneMatch: MATCHED só com evidência independente', () => {
  it('nome exato + formulário do post do lead = MATCHED', () => {
    const base = submissions('7RO9QA', '"s1","r1","2026-08-10 10:00:00","Ana","+5511999999999","Jardim","ana@gmail.com"');
    const { results } = matchLeads([lead({ postFormIds: ['7RO9QA'] })], base);
    expect(results[0]).toMatchObject({
      status: 'MATCHED', method: 'nome_exato+form_do_post', phoneE164: '+5511999999999',
      phoneFormName: 'form 7RO9QA',
    });
    expect(results[0].evidence).toContain('form_do_post');
  });

  it('nome exato + domínio do e-mail casando com a empresa = MATCHED', () => {
    const base = submissions('OUTRO', '"s2","r2","2026-08-10 10:00:00","Roger","+5511888888888","Ferreira","roger@umbler.com"');
    const { results } = matchLeads([lead({ fullName: 'Roger Ferreira', companyName: 'Umbler' })], base);
    expect(results[0]).toMatchObject({ status: 'MATCHED', method: 'nome_exato+dominio_empresa' });
  });

  it('nome de 3+ tokens único vira MATCHED mesmo sem corroboração', () => {
    const base = submissions('X', '"s3","r3","2026-08-10 10:00:00","Tiago Lorenzetti","+5511777777777","Canatelli","t@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'Tiago Lorenzetti Canatelli' })], base);
    expect(results[0]).toMatchObject({ status: 'MATCHED', method: 'nome_exato_especifico' });
  });

  it('nome de 2 tokens sem corroboração NÃO vira MATCHED', () => {
    const base = submissions('X', '"s4","r4","2026-08-10 10:00:00","Joao","+5511666666666","Silva","joao@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'Joao Silva' })], base);
    expect(results[0]).toMatchObject({ status: 'REVIEW', method: 'nome_exato_generico' });
    expect(results[0].phoneE164).toBeNull();
  });
});

describe('leadPhoneMatch: o falso positivo que os dados reais oferecem', () => {
  it('homônimo com e-mails diferentes vira REVIEW, nunca MATCHED', () => {
    // Caso medido: "joao jungbluth" aparece com jvjungbluth@hotmail.com e joao.becker@yungas.com.br
    const base = submissions('X',
      '"s5","r5","2026-08-11 15:16:27","João","+5511111111111","Jungbluth","jvjungbluth@hotmail.com"',
      '"s6","r6","2026-08-13 14:33:16","João","+5522222222222","Jungbluth","joao.becker@yungas.com.br"',
    );
    const { results } = matchLeads([lead({ fullName: 'João Jungbluth' })], base);
    expect(results[0].status).toBe('REVIEW');
    expect(results[0].phoneE164).toBeNull();
    expect(results[0].candidates).toHaveLength(2);
  });

  it('nome só parcial (sobrenome do meio a mais) vira REVIEW', () => {
    // Caso medido: lead "Lucas Oliveira" x Tally "LUCAS BRITO DE OLIVEIRA"
    const base = submissions('X', '"s7","r7","2026-08-11 21:06:59","LUCAS","+5511333333333","BRITO DE OLIVEIRA","luckas.std@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'Lucas Oliveira' })], base);
    expect(results[0]).toMatchObject({ status: 'REVIEW', method: 'nome_parcial' });
    expect(results[0].phoneE164).toBeNull();
  });

  it('lixo de formulário nunca entra como candidato', () => {
    const base = submissions('X', '"s8","r8","2026-08-11 20:22:03","X","+5511444444444","X","i@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'X X' })], base);
    expect(results[0].status).toBe('NOT_FOUND');
  });
});

describe('leadPhoneMatch: telefone vem só da Base Tally', () => {
  it('match seguro sem telefone na submission = MATCHED_NO_PHONE', () => {
    const base = submissions('7RO9QA', '"s9","r9","2026-08-10 10:00:00","Ana","","Jardim","ana@gmail.com"');
    const { results } = matchLeads([lead({ postFormIds: ['7RO9QA'] })], base);
    expect(results[0]).toMatchObject({ status: 'MATCHED_NO_PHONE', phoneE164: null });
    expect(results[0].submissionId).toBe('s9');
  });

  it('acha o telefone numa submission POSTERIOR da mesma pessoa', () => {
    // Caso medido: Juliana Yamamoto preencheu 13:11 sem telefone e 13:22 com telefone.
    const base = submissions('VLaVrE',
      '"rDkBaPv","7RzAXo9","2026-08-14 13:07:54","Juliana","","Yamamoto","julianayamamoto120@gmail.com"',
      '"J1Wdz7r","7RzAXo9","2026-08-14 13:22:05","Juliana","+5511992946933","Yamamoto","julianayamamoto120@gmail.com"',
    );
    const { results } = matchLeads([lead({ fullName: 'Juliana Yamamoto', postFormIds: ['VLaVrE'] })], base);
    expect(results[0]).toMatchObject({
      status: 'MATCHED', phoneE164: '+5511992946933', submissionId: 'J1Wdz7r',
    });
    // As duas submissions são a MESMA pessoa, então não há ambiguidade.
    expect(results[0].candidates).toHaveLength(1);
  });

  it('sem candidato nenhum = NOT_FOUND e nada é escrito', () => {
    const base = submissions('X', '"s10","r10","2026-08-10 10:00:00","Outra","+5511555555555","Pessoa","o@gmail.com"');
    const { results } = matchLeads([lead()], base);
    expect(results[0]).toMatchObject({ status: 'NOT_FOUND', phoneE164: null, submissionId: null, method: null });
  });
});

describe('leadPhoneMatch: resumo e reprocessamento', () => {
  it('resume o lote nos quatro status', () => {
    const base = submissions('F1',
      '"a","r","2026-08-10 10:00:00","Ana","+5511999999999","Jardim","ana@gmail.com"',
      '"b","r","2026-08-10 10:00:00","Bruno","","Torres","bruno@gmail.com"',
      '"c","r","2026-08-10 10:00:00","Joao","+5511666666666","Silva","joao@gmail.com"',
    );
    const { summary } = matchLeads([
      lead({ id: '1', fullName: 'Ana Jardim', postFormIds: ['F1'] }),
      lead({ id: '2', fullName: 'Bruno Torres', postFormIds: ['F1'] }),
      lead({ id: '3', fullName: 'Joao Silva' }),
      lead({ id: '4', fullName: 'Ninguem Aqui' }),
    ], base);
    expect(summary).toEqual({
      analisados: 4, MATCHED: 1, MATCHED_NO_PHONE: 1, REVIEW: 1, NOT_FOUND: 1, telefones: 1,
    });
  });

  it('não reprocessa quem já tem telefone confirmado', () => {
    expect(needsReprocessing({ status: 'MATCHED', phoneE164: '+5511999999999' })).toBe(false);
    expect(needsReprocessing({ status: 'MATCHED_NO_PHONE', phoneE164: null })).toBe(true);
    expect(needsReprocessing({ status: 'NOT_FOUND', phoneE164: null })).toBe(true);
    expect(needsReprocessing({ status: 'REVIEW', phoneE164: null })).toBe(true);
    expect(needsReprocessing(null)).toBe(true);
  });
});
