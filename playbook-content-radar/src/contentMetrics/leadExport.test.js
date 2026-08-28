import { describe, expect, it, vi } from 'vitest';
import { LEAD_EXPORT_COLUMNS, buildLeadCsv, buildLeadExcelBlob, buildLeadExportFilename, buildLeadExportRows, buildLeadWorksheetXml, icpColumnKey, leadExportColumns, selectLeadsForExport } from './leadExport.js';

describe('buildLeadExportRows: telefone na planilha só quando MATCHED', () => {
  const leads = [
    { id: 'a', full_name: 'Ana Jardim' },
    { id: 'b', full_name: 'Bruno Torres' },
    { id: 'c', full_name: 'Joao Silva' },
    { id: 'd', full_name: 'Carla Dias' },
    { id: 'e', full_name: 'Sem Linha' },
  ];
  const phonesByLead = {
    a: { lead_id: 'a', match_status: 'MATCHED', phone_e164: '+5511999998888', phone_form_name: 'KipFlow' },
    b: { lead_id: 'b', match_status: 'MATCHED_NO_PHONE', phone_e164: null, phone_form_name: null },
    // Linha impossível pelo CHECK do banco, mas se chegasse, a planilha não pode vazar.
    c: { lead_id: 'c', match_status: 'REVIEW', phone_e164: '+5511777776666', phone_form_name: 'KipFlow' },
    d: { lead_id: 'd', match_status: 'NOT_FOUND', phone_e164: null, phone_form_name: null },
  };
  const rows = buildLeadExportRows({ leads, phonesByLead });

  it('preenche telefone formatado e formulário para MATCHED', () => {
    expect(rows[0]).toMatchObject({
      telefone: '+55 11 99999-8888', status_tally: 'Telefone encontrado', formulario_telefone: 'KipFlow',
    });
  });

  it('deixa telefone vazio em MATCHED_NO_PHONE, REVIEW e NOT_FOUND', () => {
    expect(rows[1]).toMatchObject({ telefone: '', status_tally: 'Baixou material, sem telefone', formulario_telefone: '' });
    expect(rows[2]).toMatchObject({ telefone: '', status_tally: 'Revisar match', formulario_telefone: '' });
    expect(rows[3]).toMatchObject({ telefone: '', status_tally: 'Não encontrado no Tally', formulario_telefone: '' });
  });

  it('lead sem linha de match sai sem telefone e sem status', () => {
    expect(rows[4]).toMatchObject({ telefone: '', status_tally: '', formulario_telefone: '' });
  });

  it('nenhum número de REVIEW aparece no CSV gerado', () => {
    const csv = buildLeadCsv(rows);
    expect(csv).toContain('+55 11 99999-8888');
    expect(csv).not.toContain('777776666');
  });

  it('as colunas novas existem no cabeçalho', () => {
    const labels = LEAD_EXPORT_COLUMNS.map((column) => column.label);
    expect(labels).toContain('Telefone');
    expect(labels).toContain('Status Tally');
    expect(labels).toContain('Formulário do telefone');
  });
});

describe('lead export', () => {
  it('excludes leads already sent and allows individual leads to be deselected', () => {
    const leads = [{ id: 'new' }, { id: 'sent' }, { id: 'deselected' }];
    expect(selectLeadsForExport({
      leads,
      outreachByLead: { sent: { status: 'prospected' } },
      excludedIds: new Set(['deselected']),
    })).toEqual([{ id: 'new' }]);
  });

  it('exports the post fields and commercial context needed for spreadsheet filters', () => {
    const rows = buildLeadExportRows({
      leads: [{
        id: 'lead-1', full_name: 'Ana Silva', profile_url: 'https://linkedin.com/in/ana', score: 87,
        qualification_status: 'qualified', job_title: 'Diretora', company_name: 'Acme', company_size: 320,
        seniority: 'diretoria', area: 'vendas', qualification_reason: 'Bom fit', suggested_angle: 'Falar de automação',
        first_seen_post_id: 'post-1', created_at: '2026-08-09T12:30:00Z',
      }],
      postsById: { 'post-1': { hook: 'Como escalar vendas', owner: 'Victor Baggio', external_post_id: 'urn:123', published_at: '2026-08-01T10:00:00Z', post_url: 'https://linkedin.com/posts/123' } },
      commentByLead: { 'lead-1': { post_id: 'post-1', comment_text: 'Quero saber mais', commented_at: '2026-08-02T11:00:00Z' } },
      outreachByLead: { 'lead-1': { status: 'prospected', generated_message: 'Oi, Ana!' } },
    });

    expect(rows).toEqual([expect.objectContaining({
      nome: 'Ana Silva',
      score: 87,
      qualificacao: 'Aprovado',
      post: 'Como escalar vendas',
      id_post: 'urn:123',
      autor_post: 'Victor Baggio',
      link_post: 'https://linkedin.com/posts/123',
      comentario: 'Quero saber mais',
      status_prospeccao: 'Prospectado',
      mensagem: 'Oi, Ana!',
    })]);
  });

  it('builds an Excel-friendly UTF-8 CSV and neutralizes spreadsheet formulas', () => {
    const csv = buildLeadCsv([{ nome: '=HYPERLINK("https://malicioso")', score: 90, post: 'Post; com separador' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""https://malicioso"")"');
    expect(csv).toContain('"Post; com separador"');
    expect(csv).toContain(';90;');
  });

  it('includes the active status, creator and post in the filename', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00Z'));
    expect(buildLeadExportFilename('xlsx', { status: 'Aprovados', creator: 'Victor Baggio', post: 'IA & Vendas' }))
      .toBe('leads-icp-aprovados-victor-baggio-ia-vendas-2026-08-10.xlsx');
    vi.useRealTimers();
  });

  it('creates an autofiltered Excel worksheet with the header frozen and text escaped', () => {
    const xml = buildLeadWorksheetXml([{ nome: 'Ana & Bia', score: 87, post: '<Post>' }]);
    expect(xml).toContain('state="frozen"');
    // X = 24 colunas (as 21 originais + Telefone, Status Tally e Formulário do telefone).
    expect(xml).toContain('<autoFilter ref="A1:X2"/>');
    expect(xml).toContain('Ana &amp; Bia');
    expect(xml).toContain('&lt;Post&gt;');
    expect(xml).toContain('t="n"><v>87</v>');
  });

  it('packages a valid XLSX workbook with its required Open XML parts', async () => {
    const { default: JSZip } = await import('jszip');
    const blob = await buildLeadExcelBlob([{ nome: 'Ana', score: 87, post: 'Post de IA' }]);
    const workbook = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(workbook.files)).toEqual(expect.arrayContaining([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]));
    await expect(workbook.file('xl/worksheets/sheet1.xml').async('string')).resolves.toContain('Post de IA');
  });
});

describe('leadExport: uma coluna por ICP na planilha', () => {
  const icps = [
    { id: 'icp-founders', name: 'Founders' },
    { id: 'icp-playbook', name: 'Playbook' },
  ];
  const qualificationByLeadIcp = new Map([
    ['L1|icp-founders', { status: 'qualified', score: 90 }],
    ['L1|icp-playbook', { status: 'disqualified', score: 20 }],
  ]);

  it('acrescenta uma coluna por ICP depois das colunas fixas', () => {
    const columns = leadExportColumns(icps);
    expect(columns.slice(0, LEAD_EXPORT_COLUMNS.length)).toEqual(LEAD_EXPORT_COLUMNS);
    expect(columns.slice(-2).map((column) => column.label)).toEqual(['ICP · Founders', 'ICP · Playbook']);
  });

  it('escreve o veredito de cada ICP, com "Não avaliado" quando não há linha', () => {
    const [row] = buildLeadExportRows({
      leads: [{ id: 'L1', full_name: 'Ana', qualification_status: 'qualified', score: 90 }],
      icps,
      qualificationByLeadIcp,
    });
    expect(row[icpColumnKey('icp-founders')]).toBe('Aprovado (90)');
    expect(row[icpColumnKey('icp-playbook')]).toBe('Descartado (20)');

    const [semNada] = buildLeadExportRows({
      leads: [{ id: 'L9', full_name: 'Zé' }],
      icps,
      qualificationByLeadIcp,
    });
    expect(semNada[icpColumnKey('icp-founders')]).toBe('Não avaliado');
  });

  it('o CSV sai com o cabeçalho dos ICPs quando as colunas são passadas', () => {
    const columns = leadExportColumns(icps);
    const rows = buildLeadExportRows({
      leads: [{ id: 'L1', full_name: 'Ana' }],
      icps,
      qualificationByLeadIcp,
    });
    const csv = buildLeadCsv(rows, columns);
    const [header] = csv.split('\r\n');
    expect(header).toContain('"ICP · Founders"');
    expect(header).toContain('"ICP · Playbook"');
  });
});
