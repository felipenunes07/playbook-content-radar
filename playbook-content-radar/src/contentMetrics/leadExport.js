import { formatPhone, phoneStatusMeta, phoneToShow } from './leadPhones.js';

export const LEAD_EXPORT_COLUMNS = [
  { key: 'nome', label: 'Nome', width: 24 },
  { key: 'linkedin', label: 'Perfil no LinkedIn', width: 36 },
  { key: 'score', label: 'Score ICP', width: 12 },
  { key: 'qualificacao', label: 'Qualificação', width: 17 },
  { key: 'cargo', label: 'Cargo', width: 28 },
  { key: 'senioridade', label: 'Senioridade', width: 16 },
  { key: 'area', label: 'Área', width: 18 },
  { key: 'empresa', label: 'Empresa', width: 24 },
  { key: 'porte', label: 'Porte da empresa', width: 17 },
  { key: 'comentario', label: 'Comentário feito', width: 44 },
  { key: 'data_comentario', label: 'Data do comentário', width: 20 },
  { key: 'post', label: 'Post de origem', width: 44 },
  { key: 'id_post', label: 'ID do post', width: 24 },
  { key: 'autor_post', label: 'Autor do post', width: 20 },
  { key: 'data_post', label: 'Data do post', width: 18 },
  { key: 'link_post', label: 'Link do post', width: 36 },
  { key: 'motivo', label: 'Motivo da qualificação', width: 48 },
  { key: 'angulo', label: 'Ângulo sugerido', width: 44 },
  { key: 'mensagem', label: 'Mensagem de abordagem', width: 52 },
  { key: 'status_prospeccao', label: 'Status de prospecção', width: 20 },
  { key: 'telefone', label: 'Telefone', width: 20 },
  { key: 'status_tally', label: 'Status Tally', width: 22 },
  { key: 'formulario_telefone', label: 'Formulário do telefone', width: 34 },
  { key: 'data_cadastro', label: 'Data de cadastro', width: 20 },
];

const qualificationLabels = {
  qualified: 'Aprovado',
  review: 'Aprovado com ressalva',
  pending: 'Aguardando análise',
  disqualified: 'Descartado',
};

const outreachLabels = {
  new: 'Não prospectado',
  prospected: 'Prospectado',
  ignored: 'Ignorado',
};

const seniorityLabels = {
  'c-level': 'C-Level',
  diretoria: 'Diretoria',
  gerencia: 'Gerência',
  coordenacao: 'Coordenação',
  operacional: 'Operacional',
  desconhecido: '',
};

export function selectLeadsForExport({ leads = [], outreachByLead = {}, excludedIds = new Set() } = {}) {
  return leads.filter((lead) => (
    outreachByLead[lead.id]?.status !== 'prospected'
    && !excludedIds.has(lead.id)
  ));
}

function spreadsheetDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().replace('T', ' ').slice(0, 16);
}

export function buildLeadExportRows({ leads = [], postsById = {}, commentByLead = {}, outreachByLead = {}, phonesByLead = {} } = {}) {
  return leads.map((lead) => {
    const comment = commentByLead[lead.id] || {};
    const postId = comment.post_id || lead.first_seen_post_id || '';
    const post = postsById[postId] || {};
    const outreach = outreachByLead[lead.id] || {};
    // O telefone passa pelo mesmo phoneToShow da interface: fora de MATCHED sai
    // vazio. A planilha vai pro comercial, então é o pior lugar possível para um
    // número de REVIEW escapar.
    const phoneRow = phonesByLead[lead.id] || null;

    return {
      nome: lead.full_name || lead.public_identifier || '',
      linkedin: lead.profile_url || '',
      score: lead.score == null ? '' : Number(lead.score),
      qualificacao: qualificationLabels[lead.qualification_status] || lead.qualification_status || '',
      cargo: lead.job_title || lead.headline || '',
      senioridade: seniorityLabels[lead.seniority] ?? lead.seniority ?? '',
      area: lead.area === 'desconhecido' ? '' : (lead.area || ''),
      empresa: lead.company_name || '',
      porte: lead.company_size == null ? '' : Number(lead.company_size),
      comentario: comment.comment_text || '',
      data_comentario: spreadsheetDate(comment.commented_at || comment.created_at),
      post: post.hook || '',
      id_post: post.external_post_id || postId,
      autor_post: post.owner || '',
      data_post: spreadsheetDate(post.published_at),
      link_post: post.post_url || '',
      motivo: lead.qualification_reason || '',
      angulo: lead.suggested_angle || '',
      mensagem: outreach.generated_message || '',
      status_prospeccao: outreachLabels[outreach.status || 'new'] || outreach.status || 'Não prospectado',
      telefone: formatPhone(phoneToShow(phoneRow)),
      status_tally: phoneRow ? phoneStatusMeta(phoneRow).label : '',
      formulario_telefone: phoneToShow(phoneRow) ? (phoneRow.phone_form_name || '') : '',
      data_cadastro: spreadsheetDate(lead.created_at),
    };
  });
}

// Excel em pt-BR detecta melhor CSV com ponto e vírgula. O BOM preserva acentos.
// Strings que poderiam virar fórmula recebem apóstrofo para evitar CSV injection.
function csvCell(value) {
  if (value == null) return '""';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let text = String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildLeadCsv(rows) {
  const header = LEAD_EXPORT_COLUMNS.map((column) => csvCell(column.label)).join(';');
  const body = rows.map((row) => LEAD_EXPORT_COLUMNS.map((column) => csvCell(row[column.key])).join(';'));
  return `\uFEFF${[header, ...body].join('\r\n')}`;
}

export function buildLeadExportFilename(extension, { status = 'qualificados', creator = '', post = '' } = {}) {
  const slug = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42);
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['leads-icp', slug(status), slug(creator), slug(post), date].filter(Boolean);
  return `${parts.join('-')}.${extension}`;
}

export function downloadLeadCsv(rows, fileName) {
  const blob = new Blob([buildLeadCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function xmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excelColumnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function buildLeadWorksheetXml(rows) {
  const allRows = [
    LEAD_EXPORT_COLUMNS.map((column) => column.label),
    ...rows.map((row) => LEAD_EXPORT_COLUMNS.map((column) => row[column.key])),
  ];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${excelColumnName(columnIndex)}${rowIndex + 1}`;
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}" s="${rowIndex === 0 ? 1 : 0}" t="n"><v>${value}</v></c>`;
      const style = rowIndex === 0 ? 1 : 2;
      return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="24" customHeight="1"' : ''}>${cells}</row>`;
  }).join('');
  const columns = LEAD_EXPORT_COLUMNS.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join('');
  const lastColumn = excelColumnName(LEAD_EXPORT_COLUMNS.length - 1);
  const lastRow = Math.max(1, allRows.length);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
}

export async function buildLeadExcelBlob(rows) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.folder('xl').file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Leads ICP" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  zip.folder('xl').folder('_rels').file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.folder('xl').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A66C2"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
  zip.folder('xl').folder('worksheets').file('sheet1.xml', buildLeadWorksheetXml(rows));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  });
}

export async function downloadLeadExcel(rows, fileName) {
  const blob = await buildLeadExcelBlob(rows);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
