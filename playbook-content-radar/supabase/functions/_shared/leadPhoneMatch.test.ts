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

  it('nome de 2 tokens com candidato único é decidido sozinho, sem fila', () => {
    // Mudou em 27/08/2026: antes virava REVIEW ('nome_exato_generico') e ficava
    // esperando um humano que nunca vinha. Só uma pessoa com este nome deixou
    // telefone, então não há entre o que escolher — a decisão é automática.
    const base = submissions('X', '"s4","r4","2026-08-10 10:00:00","Joao","+5511666666666","Silva","joao@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'Joao Silva' })], base);
    expect(results[0]).toMatchObject({ status: 'MATCHED', method: 'auto:unico_com_telefone' });
    expect(results[0].phoneE164).toBe('+5511666666666');
  });

  it('nome de uma palavra útil só nunca vira MATCHED, mesmo com telefone', () => {
    // "Rafael F." tokeniza em ["rafael"] — caso real medido: 6 candidatos diferentes
    // ("RAFAEL JUNIOR", "Rafael Filho", "rafael s"), um com telefone. Aceitar seria
    // mandar WhatsApp para um estranho.
    const base = submissions('X', '"s41","r41","2026-08-10 10:00:00","Rafael","+5531992243100","F","r@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'Rafael F.' })], base);
    expect(results[0]).toMatchObject({ status: 'NOT_FOUND', method: 'auto:nome_curto_demais' });
    expect(results[0].phoneE164).toBeNull();
  });
});

describe('leadPhoneMatch: o falso positivo que os dados reais oferecem', () => {
  it('homônimo com dois telefones diferentes é DESCARTADO, nunca MATCHED', () => {
    // Caso medido: "joao jungbluth" aparece com jvjungbluth@hotmail.com e joao.becker@yungas.com.br
    const base = submissions('X',
      '"s5","r5","2026-08-11 15:16:27","João","+5511111111111","Jungbluth","jvjungbluth@hotmail.com"',
      '"s6","r6","2026-08-13 14:33:16","João","+5522222222222","Jungbluth","joao.becker@yungas.com.br"',
    );
    // Esta é a garantia que sobrevive ao fim da fila: havendo dois números possíveis
    // e nada para desempatar, não se escolhe nenhum.
    const { results } = matchLeads([lead({ fullName: 'João Jungbluth' })], base);
    expect(results[0]).toMatchObject({ status: 'NOT_FOUND', method: 'auto:descartado_empate' });
    expect(results[0].phoneE164).toBeNull();
    // Os candidatos ficam gravados para auditoria mesmo no descarte.
    expect(results[0].candidates).toHaveLength(2);
  });

  it('nome só parcial sem evidência independente é descartado, não enfileirado', () => {
    // Caso medido: lead "Lucas Oliveira" x Tally "LUCAS BRITO DE OLIVEIRA"
    const base = submissions('X', '"s7","r7","2026-08-11 21:06:59","LUCAS","+5511333333333","BRITO DE OLIVEIRA","luckas.std@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'Lucas Oliveira' })], base);
    expect(results[0]).toMatchObject({ status: 'NOT_FOUND', method: 'auto:descartado_nome_parcial' });
    expect(results[0].phoneE164).toBeNull();
  });

  it('nome parcial COM evidência forte é aceito: o formulário do post desempata', () => {
    // Caso medido (Natalia Costa): o único candidato com telefone preencheu justamente
    // o formulário do post em que o lead comentou. É a segunda evidência que a regra
    // sempre exigiu — só que agora ela decide sozinha em vez de sugerir a um humano.
    // "Natalia" + "Rodrigues Costa" casa com "Natalia Costa" só por primeiro+último.
    const base = submissions('7RO9QA', '"s71","r71","2026-08-11 21:06:59","Natalia","+525561927033","Rodrigues Costa","n@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'Natalia Costa', postFormIds: ['7RO9QA'] })], base);
    expect(results[0]).toMatchObject({ status: 'MATCHED', phoneE164: '+525561927033' });
    expect(results[0].method).toContain('auto:evidencia_forte');
  });

  it('vários homônimos e só um com telefone, sem evidência: descarta', () => {
    // Pool grande de nome exato repetido é colisão de nome comum, não a mesma pessoa
    // cadastrada várias vezes — mesmo que só um deles tenha número.
    const base = submissions('X',
      '"h1","r","2026-08-10 10:00:00","Rafael","+5511972233392","Silva","um@gmail.com"',
      '"h2","r","2026-08-10 10:00:00","Rafael","","Silva","dois@gmail.com"',
      '"h3","r","2026-08-10 10:00:00","RAFAEL","","SILVA","tres@gmail.com"',
      '"h4","r","2026-08-10 10:00:00","Rafael","","Silva","quatro@gmail.com"',
    );
    const { results } = matchLeads([lead({ fullName: 'Rafael Silva' })], base);
    expect(results[0]).toMatchObject({ status: 'NOT_FOUND', phoneE164: null });
    expect(results[0].method).toMatch(/^auto:descartado/);
  });

  it('lixo de formulário nunca entra como candidato', () => {
    const base = submissions('X', '"s8","r8","2026-08-11 20:22:03","X","+5511444444444","X","i@gmail.com"');
    const { results } = matchLeads([lead({ fullName: 'X X' })], base);
    expect(results[0].status).toBe('NOT_FOUND');
  });
});

describe('leadPhoneMatch: rejeição humana é respeitada', () => {
  it('candidato rejeitado não volta a ser sugerido', () => {
    const base = submissions('7RO9QA', '"s1","r1","2026-08-10 10:00:00","Ana","+5511999999999","Jardim","ana@gmail.com"');
    // Sem rejeição, este caso seria MATCHED por nome_exato+form_do_post.
    const semRejeicao = matchLeads([lead({ postFormIds: ['7RO9QA'] })], base);
    expect(semRejeicao.results[0].status).toBe('MATCHED');

    const comRejeicao = matchLeads([lead({ postFormIds: ['7RO9QA'], rejectedSubmissionIds: ['s1'] })], base);
    expect(comRejeicao.results[0]).toMatchObject({ status: 'NOT_FOUND', phoneE164: null, submissionId: null });
    expect(comRejeicao.results[0].candidates).toHaveLength(0);
  });

  it('rejeitar um candidato não descarta os outros', () => {
    const base = submissions('X',
      '"s1","r1","2026-08-11 15:16:27","João","+5511111111111","Jungbluth","jvjungbluth@hotmail.com"',
      '"s2","r2","2026-08-13 14:33:16","João","+5522222222222","Jungbluth","joao.becker@yungas.com.br"',
    );
    // Os dois homônimos empatam e o lead é descartado; rejeitando um, sobra um só.
    const antes = matchLeads([lead({ fullName: 'João Jungbluth' })], base);
    expect(antes.results[0].candidates).toHaveLength(2);

    const depois = matchLeads([lead({ fullName: 'João Jungbluth', rejectedSubmissionIds: ['s1'] })], base);
    expect(depois.results[0].candidates).toHaveLength(1);
    expect(depois.results[0].candidates[0].submissionId).toBe('s2');
    // Sobrando um candidato só, o empate acabou e a decisão é automática.
    expect(depois.results[0]).toMatchObject({ status: 'MATCHED', method: 'auto:unico_com_telefone', phoneE164: '+5522222222222' });
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
  it('resume o lote e NÃO produz mais nenhum REVIEW', () => {
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
    // O 'Joao Silva' que antes caía em REVIEW agora entra em MATCHED sozinho.
    expect(summary).toEqual({
      analisados: 4, MATCHED: 2, MATCHED_NO_PHONE: 1, REVIEW: 0, NOT_FOUND: 1, telefones: 2,
    });
  });

  it('nenhuma entrada plausível devolve REVIEW — a fila humana acabou', () => {
    const base = submissions('F1',
      '"x1","r","2026-08-10 10:00:00","Joao","+5511111111111","Silva","um@gmail.com"',
      '"x2","r","2026-08-10 10:00:00","Joao","+5522222222222","Silva","dois@gmail.com"',
      '"x3","r","2026-08-10 10:00:00","Lucas","+5533333333333","Brito Oliveira","tres@gmail.com"',
      '"x4","r","2026-08-10 10:00:00","Ana","","Jardim","quatro@gmail.com"',
    );
    const { results } = matchLeads([
      lead({ id: '1', fullName: 'Joao Silva' }),
      lead({ id: '2', fullName: 'Lucas Oliveira' }),
      lead({ id: '3', fullName: 'Ana Jardim' }),
      lead({ id: '4', fullName: 'Rafael F.' }),
      lead({ id: '5', fullName: 'Ninguem Aqui' }),
    ], base);
    expect(results.every((result) => result.status !== 'REVIEW')).toBe(true);
    // E o homônimo com dois telefones não vazou número nenhum.
    expect(results[0].phoneE164).toBeNull();
  });

  it('não reprocessa quem já tem telefone confirmado', () => {
    expect(needsReprocessing({ status: 'MATCHED', phoneE164: '+5511999999999' })).toBe(false);
    expect(needsReprocessing({ status: 'MATCHED_NO_PHONE', phoneE164: null })).toBe(true);
    expect(needsReprocessing({ status: 'NOT_FOUND', phoneE164: null })).toBe(true);
    expect(needsReprocessing({ status: 'REVIEW', phoneE164: null })).toBe(true);
    expect(needsReprocessing(null)).toBe(true);
  });
});
