const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'html', 'htm']);
const extensionOf = (name = '') => name.split('.').pop()?.toLowerCase() || '';
const limitText = (value, limit = 60000) => String(value || '').replace(/\u0000/g, '').trim().slice(0, limit);

async function extractPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 80); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return limitText(pages.join('\n\n'));
}

async function extractDocx(file) {
  const mammoth = await import('mammoth/mammoth.browser');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return limitText(result.value);
}

export async function extractSourceMaterial(file) {
  const extension = extensionOf(file.name);
  try {
    if (file.type.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) {
      return { extractedText: limitText(await file.text()), extractionStatus: 'ready' };
    }
    if (file.type === 'application/pdf' || extension === 'pdf') {
      const extractedText = await extractPdf(file);
      return { extractedText, extractionStatus: extractedText ? 'ready' : 'empty' };
    }
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx') {
      const extractedText = await extractDocx(file);
      return { extractedText, extractionStatus: extractedText ? 'ready' : 'empty' };
    }
    if (file.type.startsWith('image/')) return { extractedText: '', extractionStatus: 'visual' };
    return { extractedText: '', extractionStatus: 'stored' };
  } catch (error) {
    console.error(`Falha ao extrair ${file.name}:`, error);
    return { extractedText: '', extractionStatus: 'failed' };
  }
}
