import { describe, expect, it } from 'vitest';
import {
  dedupeSubmissions, detectColumns, formNameFromFileName, submissionsFromApi, submissionsFromCsv,
} from './tallySource.ts';

// Cabeçalho e ordem reais do export "36 Skills de SDR para Claude_Submissions_2026-08-14.csv".
const HEADER = '"Submission ID","Respondent ID","Submitted at","Nome","Telefone","Sobrenome","E-mail"';
const csv = (...linhas: string[]) => [HEADER, ...linhas].join('\n');

describe('tallySource: CSV', () => {
  it('detecta colunas por rótulo, não por posição (telefone vem no meio dos nomes)', () => {
    const columns = detectColumns(['Submission ID', 'Respondent ID', 'Submitted at', 'Nome', 'Telefone', 'Sobrenome', 'E-mail']);
    expect(columns).toMatchObject({
      submissionId: 'Submission ID', respondentId: 'Respondent ID', submittedAt: 'Submitted at',
      firstName: 'Nome', phone: 'Telefone', lastName: 'Sobrenome', email: 'E-mail',
    });
  });

  it('não confunde "Sobrenome" com "Nome"', () => {
    const columns = detectColumns(['Sobrenome', 'Nome']);
    expect(columns.firstName).toBe('Nome');
    expect(columns.lastName).toBe('Sobrenome');
  });

  it('tira o nome do formulário do arquivo exportado pelo Tally', () => {
    expect(formNameFromFileName('36 Skills de SDR para Claude_Submissions_2026-08-14.csv'))
      .toBe('36 Skills de SDR para Claude');
    expect(formNameFromFileName('C:/Downloads/Google Maps Scraper_Submissions.csv'))
      .toBe('Google Maps Scraper');
  });

  it('normaliza uma submission com telefone', () => {
    const { submissions } = submissionsFromCsv(
      csv('"J1Wdz7r","7RzAXo9","2026-08-14 13:22:05","Juliana","+5511992946933","Yamamoto","julianayamamoto120@gmail.com"'),
      { formId: 'VLaVrE', sourceFile: '36 Skills de SDR para Claude_Submissions_2026-08-14.csv' },
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      submissionId: 'J1Wdz7r', respondentId: '7RzAXo9', formId: 'VLaVrE',
      formName: '36 Skills de SDR para Claude',
      fullName: 'Juliana Yamamoto', normalizedName: 'juliana yamamoto',
      phoneE164: '+5511992946933', isCorporateEmail: false, isJunk: false, source: 'csv',
    });
  });

  it('marca lixo e apara espaço sobrando sem descartar a linha', () => {
    const { submissions } = submissionsFromCsv(csv(
      '"DqxExRp","0QyABR6","2026-08-11 20:22:03","X","","X","iilanafernands@gmail.com"',
      '"RWblNdv","EkEM9yX","2026-08-11 15:25:18","Priscila ","","Guimarães ","pguimara8@gmail.com"',
    ), { formId: 'VLaVrE' });
    expect(submissions).toHaveLength(2);
    expect(submissions[0].isJunk).toBe(true);
    expect(submissions[1].isJunk).toBe(false);
    expect(submissions[1].fullName).toBe('Priscila Guimarães');
  });

  it('ignora linha sem submission_id, que não teria chave de dedupe', () => {
    const result = submissionsFromCsv(csv('"","abc","2026-08-11 15:25:18","Ana","","Jardim","a@b.com"'), { formId: 'X' });
    expect(result.submissions).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});

describe('tallySource: API', () => {
  it('usa o TIPO do campo em vez de adivinhar pelo rótulo', () => {
    const submissions = submissionsFromApi({
      formId: '7RO9QA',
      formName: 'O Setup inicial do OS da sua empresa',
      questions: [
        { id: 'br8Jq7', type: 'INPUT_TEXT', label: 'Nome' },
        { id: 'e2JOzo', type: 'INPUT_PHONE_NUMBER', label: 'Telefone' },
        { id: 'ADqXzl', type: 'INPUT_TEXT', label: 'Sobrenome' },
        { id: 'BDQRa1', type: 'INPUT_EMAIL', label: 'E-mail' },
      ],
      submissions: [{
        id: 'peJQozb',
        submittedAt: '2026-08-12T23:08:55.000Z',
        responses: [
          { questionId: 'br8Jq7', answer: 'Richard' },
          { questionId: 'ADqXzl', answer: 'Flink' },
          { questionId: 'BDQRa1', answer: 'advance@advanceassessoria.com.br' },
        ],
      }],
    });
    expect(submissions[0]).toMatchObject({
      submissionId: 'peJQozb', formId: '7RO9QA', fullName: 'Richard Flink',
      isCorporateEmail: true, emailDomain: 'advanceassessoria.com.br',
      phoneE164: '', source: 'api',
    });
  });

  // Formato REAL da API: o texto da pergunta é `title` (o wrapper MCP chama de
  // `label`), perguntas removidas vêm com isDeleted, e o respondentId está em cada
  // resposta. Isso quebrou a primeira execução em produção com "reading 'trim'".
  it('lê o texto da pergunta em title, ignora isDeleted e pega o respondentId da resposta', () => {
    const submissions = submissionsFromApi({
      formId: 'VLaVrE',
      formName: '36 Skills de SDR para Claude',
      questions: [
        { id: 'antigo', type: 'INPUT_TEXT', title: 'Nome', isDeleted: true },
        { id: 'q1', type: 'INPUT_TEXT', title: 'Nome' },
        { id: 'q2', type: 'INPUT_PHONE_NUMBER', title: 'Telefone' },
        { id: 'q3', type: 'INPUT_TEXT', title: 'Sobrenome' },
        { id: 'q4', type: 'INPUT_EMAIL', title: 'E-mail' },
      ],
      submissions: [{
        id: 'J1Wdz7r',
        submittedAt: '2026-08-14T13:22:05.000Z',
        responses: [
          { questionId: 'q1', answer: 'Juliana', respondentId: '7RzAXo9' },
          { questionId: 'q3', answer: 'Yamamoto', respondentId: '7RzAXo9' },
          { questionId: 'q2', answer: '+5511992946933', respondentId: '7RzAXo9' },
          { questionId: 'q4', answer: 'julianayamamoto120@gmail.com', respondentId: '7RzAXo9' },
        ],
      }],
    });
    expect(submissions[0]).toMatchObject({
      submissionId: 'J1Wdz7r', respondentId: '7RzAXo9',
      fullName: 'Juliana Yamamoto', phoneE164: '+5511992946933',
      email: 'julianayamamoto120@gmail.com', isJunk: false,
    });
  });

  it('extrai a resposta quando ela vem como objeto ou array, e não "[object Object]"', () => {
    const submissions = submissionsFromApi({
      formId: 'F', formName: 'F',
      questions: [
        { id: 'q1', type: 'INPUT_TEXT', title: 'Nome' },
        { id: 'q3', type: 'INPUT_TEXT', title: 'Sobrenome' },
        { id: 'q2', type: 'INPUT_PHONE_NUMBER', title: 'Telefone' },
        { id: 'q4', type: 'INPUT_EMAIL', title: 'E-mail' },
      ],
      submissions: [{
        id: 's1',
        responses: [
          { questionId: 'q1', answer: 'Ana' },
          { questionId: 'q3', answer: ['Jardim'] },
          { questionId: 'q2', answer: { value: '+5511992946933' } },
          { questionId: 'q4', answer: 'ana@umbler.com' },
        ],
      }],
    });
    expect(submissions[0]).toMatchObject({
      fullName: 'Ana Jardim', phoneE164: '+5511992946933', email: 'ana@umbler.com',
    });
    expect(submissions[0].fullName).not.toContain('object');
  });

  it('não quebra quando a pergunta vem sem texto nenhum', () => {
    const submissions = submissionsFromApi({
      formId: 'F', formName: 'F',
      questions: [{ id: 'q1', type: 'INPUT_TEXT' }, { id: 'q2', type: 'INPUT_EMAIL' }],
      submissions: [{ id: 's1', responses: [{ questionId: 'q2', answer: 'a@b.com' }] }],
    });
    expect(submissions[0]).toMatchObject({ submissionId: 's1', email: 'a@b.com', isJunk: true });
  });

  it('produz o mesmo formato que o CSV, para o matcher não saber a diferença', () => {
    const doCsv = submissionsFromCsv(
      csv('"abc123","r1","2026-08-14 13:22:05","Ana","+5511992946933","Jardim","ana@umbler.com"'),
      { formId: 'F1', formName: 'Form 1' },
    ).submissions[0];
    const daApi = submissionsFromApi({
      formId: 'F1', formName: 'Form 1',
      questions: [
        { id: 'q1', type: 'INPUT_TEXT', label: 'Nome' },
        { id: 'q2', type: 'INPUT_TEXT', label: 'Sobrenome' },
        { id: 'q3', type: 'INPUT_EMAIL', label: 'E-mail' },
        { id: 'q4', type: 'INPUT_PHONE_NUMBER', label: 'Telefone' },
      ],
      submissions: [{
        id: 'abc123', respondentId: 'r1', submittedAt: '2026-08-14 13:22:05',
        responses: [
          { questionId: 'q1', answer: 'Ana' }, { questionId: 'q2', answer: 'Jardim' },
          { questionId: 'q3', answer: 'ana@umbler.com' }, { questionId: 'q4', answer: '+5511992946933' },
        ],
      }],
    })[0];

    const comparar = (item: typeof doCsv) => ({
      submissionId: item.submissionId, fullName: item.fullName, normalizedName: item.normalizedName,
      firstLastName: item.firstLastName, email: item.email, phoneE164: item.phoneE164,
      isCorporateEmail: item.isCorporateEmail, isJunk: item.isJunk,
    });
    expect(comparar(daApi)).toEqual(comparar(doCsv));
  });
});

describe('tallySource: dedupe', () => {
  it('mantém a versão mais recente do mesmo submission_id', () => {
    const { submissions: primeira } = submissionsFromCsv(
      csv('"yXj577g","KYyLRK7","2026-08-05 02:27:43","FELIPE","","NUNES","fereservas@gmail.com"'), { formId: 'F' });
    const { submissions: segunda } = submissionsFromCsv(
      csv('"yXj577g","KYyLRK7","2026-08-05 02:27:43","FELIPE","+5511952960701","NUNES","fereservas@gmail.com"'), { formId: 'F' });
    const merged = dedupeSubmissions([...primeira, ...segunda]);
    expect(merged).toHaveLength(1);
    expect(merged[0].phoneE164).toBe('+5511952960701');
  });
});
