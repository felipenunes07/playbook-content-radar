import { describe, expect, it, vi } from 'vitest';
import { buildLeadCsv, buildLeadExcelBlob, buildLeadExportFilename, buildLeadExportRows, buildLeadWorksheetXml } from './leadExport.js';

describe('lead export', () => {
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
    expect(xml).toContain('<autoFilter ref="A1:U2"/>');
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
