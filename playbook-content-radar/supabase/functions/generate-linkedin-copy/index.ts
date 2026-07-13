import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage } from '../_shared/content.ts';
import { corsHeaders, json } from '../_shared/server.ts';
import { llmHeaders, parseLlmJson, requireClassificationProviders, withLlmFallback } from '../_shared/llm.ts';
import { LINKEDIN_WRITER_CONTEXT } from './linkedin-writer-context.ts';

type SourceMaterial = {
  name?: string;
  type?: string;
  url?: string;
  extractedText?: string;
};

const clean = (value: unknown, limit = 18000) => String(value || '').trim().slice(0, limit);

function removeGenericLanguage(value: unknown) {
  return clean(value, 12000)
    .replace(/imagine a cena\.?/gi, '')
    .replace(/\bimagine\b/gi, '')
    .replace(/\bconvenhamos\b[:,]?/gi, '')
    .replace(/etapa crucial/gi, 'etapa do processo')
    .replace(/a ideia [ée] simples[:,]?/gi, 'O fluxo funciona assim:')
    .replace(/\botimizar\b/gi, 'organizar')
    .replace(/\botimiza\b/gi, 'organiza')
    .replace(/\botimizado\b/gi, 'organizado')
    .replace(/melhora(?:r)? a efici[êe]ncia/gi, 'reduzir etapas manuais')
    .replace(/o que realmente importa[:,]?/gi, 'vender:')
    .replace(/merece aten[cç][aã]o/gi, 'vale testar')
    .replace(/a tecnologia deve ser uma aliada/gi, 'A tecnologia entra no operacional')
    .replace(/essa [ée] a nova realidade/gi, 'Esse é o fluxo')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pageText(html: string) {
  return clean(html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' '), 18000);
}

async function readPublicContextUrl(value: unknown) {
  try {
    const url = new URL(clean(value, 2000));
    const host = url.hostname.toLowerCase();
    const allowed = host === 'tally.so' || host.endsWith('.tally.so') || host === 'notion.so' || host.endsWith('.notion.so') || host.endsWith('.notion.site');
    if (url.protocol !== 'https:' || !allowed) return '';
    const response = await fetch(url, { headers: { 'User-Agent': 'PlaybookContentRadar/1.0' }, signal: AbortSignal.timeout(9000) });
    if (!response.ok) return '';
    return pageText(await response.text());
  } catch {
    return '';
  }
}

function validateResult(raw: Record<string, any>) {
  const required = ['sourceSummary', 'outcome', 'audience', 'framework', 'hook', 'post'];
  for (const field of required) {
    if (!clean(raw[field])) throw new Error(`Modelo nao retornou ${field}`);
  }
  const framework = clean(raw.framework, 10).toUpperCase();
  if (!['PAS', 'AIDA', 'CPF', 'BAB'].includes(framework)) throw new Error('Framework invalido');
  const post = clean(raw.post, 12000);
  const wordCount = post.split(/\s+/).filter(Boolean).length;
  if (wordCount < 70 || wordCount > 450) throw new Error(`Post fora do tamanho editorial (${wordCount} palavras)`);
  return {
    sourceSummary: clean(raw.sourceSummary, 1000),
    outcome: clean(raw.outcome, 500),
    audience: clean(raw.audience, 240),
    framework,
    hook: clean(raw.hook, 500),
    post,
    contentType: clean(raw.contentType, 40) || 'autoridade',
    cta: clean(raw.cta, 300),
    wordCount,
    qualityChecks: Array.isArray(raw.qualityChecks) ? raw.qualityChecks.map((item) => clean(item, 240)).filter(Boolean).slice(0, 8) : [],
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, error: 'Metodo nao permitido' }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const idea = body.idea || {};
    const sources: SourceMaterial[] = Array.isArray(body.sourceMaterials) ? body.sourceMaterials.slice(0, 12) : [];
    const contextUrls = Array.isArray(body.contextUrls) ? body.contextUrls.slice(0, 6) : [];
    const publicPages = await Promise.all(contextUrls.map(readPublicContextUrl));
    const sourceText = sources.map((source, index) => {
      const extracted = clean(source.extractedText, 24000);
      return extracted ? `MATERIAL ${index + 1} — ${clean(source.name, 180)}\n${extracted}` : `MATERIAL ${index + 1} — ${clean(source.name, 180)} (${clean(source.type, 80) || 'arquivo anexado'})`;
    }).join('\n\n');
    const pageContext = publicPages.map((text, index) => text ? `PAGINA PUBLICA ${index + 1}\n${text}` : '').filter(Boolean).join('\n\n');
    const ideaText = [
      clean(idea.title, 1000),
      clean(idea.summary, 18000),
      clean(idea.playbookAngle, 3000),
      clean(body.workspaceContext, 16000),
      clean(idea.linkedinUrl, 2000) ? `URL DA REFERENCIA ORIGINAL: ${clean(idea.linkedinUrl, 2000)}` : '',
      pageContext,
    ].filter(Boolean).join('\n\n');
    if (!ideaText && !sourceText && !sources.some((source) => source.type?.startsWith('image/') && source.url)) {
      return json({ success: false, error: 'Adicione uma referencia ou material-fonte antes de gerar.' }, 400);
    }

    const prompt = `STEP 0 A 4 — construa o plano editorial antes de escrever.

CONTEXTO DA IDEIA NO RADAR
${ideaText || 'Sem contexto adicional.'}

MATERIAIS ENTREGUES PELO AUTOR/CLIENTE
${sourceText || 'Nenhum texto extraido. Analise as imagens anexadas, se houver.'}

REGRAS DE SEGURANCA EDITORIAL
- Nao invente numero, case, resultado, ferramenta, cliente ou experiencia pessoal.
- Se um dado nao estiver no material, nao o use.
- O post deve ser original. Nao reproduza frases longas nem a estrutura particular do autor-fonte.
- Gere 10 outcomes realmente diferentes e selecione o melhor.
- Avalie PAS, AIDA, CPF e BAB com um esqueleto de 3 a 5 passos para cada um e selecione o melhor.
- Gere exatamente 10 hooks curtos, compare especificidade e continuidade, e selecione o melhor.
- Nao escreva o post ainda.

Retorne JSON com:
{
  "sourceSummary": "resumo fiel em 1-2 frases",
  "outcomes": [{"outcome":"...","angle":"...","audience":"..."}],
  "selectedOutcomeIndex": 0,
  "frameworks": [{"name":"PAS","skeleton":["..."]},{"name":"AIDA","skeleton":["..."]},{"name":"CPF","skeleton":["..."]},{"name":"BAB","skeleton":["..."]}],
  "selectedFramework": "PAS|AIDA|CPF|BAB",
  "hooks": ["hook 1", "hook 2"],
  "selectedHookIndex": 0,
  "contentType": "lead_magnet|autoridade|storytelling|hot_take",
  "cta": "CTA escolhido ou vazio"
}`;

    const imageParts = sources
      .filter((source) => source.type?.startsWith('image/') && /^https:\/\//i.test(source.url || ''))
      .slice(0, 5)
      .map((source) => ({ type: 'image_url', image_url: { url: source.url, detail: 'high' } }));
    const userContent: any = imageParts.length ? [{ type: 'text', text: prompt }, ...imageParts] : prompt;
    const providers = requireClassificationProviders();
    const result = await withLlmFallback(providers, async (provider) => {
      const callJson = async (messages: any[], temperature: number) => {
        const response = await fetch(provider.url, {
          method: 'POST',
          headers: llmHeaders(provider),
          body: JSON.stringify({ model: provider.model, temperature, response_format: { type: 'json_object' }, messages }),
        });
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responseBody?.error?.message || `Copy API ${response.status}`);
        return parseLlmJson(responseBody);
      };
      const plan = await callJson([
        { role: 'system', content: LINKEDIN_WRITER_CONTEXT },
        { role: 'user', content: userContent },
      ], 0.62);
      if (!Array.isArray(plan.outcomes) || plan.outcomes.length !== 10 || !Array.isArray(plan.hooks) || plan.hooks.length !== 10) {
        throw new Error('O plano editorial nao completou as 10 opcoes obrigatorias');
      }
      const finalPrompt = `STEP 5 — agora escreva uma unica primeira versao usando o plano aprovado internamente.

PLANO EDITORIAL
${JSON.stringify(plan)}

FONTE ORIGINAL PARA CONFERENCIA DE FATOS
${ideaText}\n\n${sourceText}

REVISÃO OBRIGATORIA ANTES DA SAIDA
- Comece exatamente pelo hook selecionado e faça a linha seguinte continuar o mesmo pensamento.
- Corte qualquer abertura escolar ou generica. Proibido: "e uma etapa crucial", "convenhamos", "imagine poder", "no mundo de hoje", "hoje vou falar".
- Use detalhes do material, nao abstrações. Se o material for insuficiente, escreva um post curto e honesto.
- Nao atribua a Victor um case, numero ou experiencia que a fonte nao comprova.
- Frases curtas, uma ideia por linha, sem headings e sem hashtags.

Retorne JSON com:
{
  "sourceSummary":"...",
  "outcome":"...",
  "audience":"...",
  "framework":"PAS|AIDA|CPF|BAB",
  "hook":"...",
  "contentType":"lead_magnet|autoridade|storytelling|hot_take",
  "cta":"...",
  "post":"texto final",
  "qualityChecks":["fatos conferidos","hook conectado ao corpo","voz e ritmo revisados","originalidade revisada"]
}`;
      let final = await callJson([
        { role: 'system', content: LINKEDIN_WRITER_CONTEXT },
        { role: 'user', content: finalPrompt },
      ], 0.48);
      const genericLanguage = /(imagine|convenhamos|etapa crucial|a ideia [ée] simples|o que realmente importa|merece aten[cç][aã]o|otimiz\w*|melhor\w* a efici[êe]ncia|tecnologia deve ser uma aliada|nova realidade)/i;
      for (let revision = 0; revision < 2 && genericLanguage.test(`${clean(final.hook)} ${clean(final.post)}`); revision += 1) {
        const polishPrompt = `Voce e o editor-chefe da Playbook Lab. O rascunho abaixo foi REPROVADO porque ainda soa como IA generica.

RASCUNHO REPROVADO
${JSON.stringify(final)}

FATOS DISPONIVEIS
${ideaText}\n\n${sourceText}

REESCREVA COM ESTAS EXIGENCIAS
- Crie um NOVO hook curto e concreto. Nao preserve palavras genericas do hook reprovado.
- Preserve apenas o outcome e o framework. Substitua abstrações por uma cena operacional concreta do material.
- Mostre a sequencia do que acontece. Frases curtas. Cada pensamento em sua linha.
- Termine com uma tese forte, nao com convite vago.
- Elimine de TODO o JSON, inclusive hook: imagine, convenhamos, etapa crucial, a ideia e simples, otimizar, melhorar eficiencia, o que realmente importa, merece atencao, tecnologia como aliada, nova realidade.
- Nao adicione nenhum fato, resultado ou experiencia.
- O resultado deve soar como Victor explicando algo que acabou de construir, nao como artigo corporativo.
- Antes de responder, procure cada termo proibido no seu texto. Se encontrar, reescreva novamente.

Retorne o mesmo JSON completo, com o post reescrito e qualityChecks atualizados.`;
        final = await callJson([
          { role: 'system', content: LINKEDIN_WRITER_CONTEXT },
          { role: 'user', content: polishPrompt },
        ], revision ? 0.2 : 0.35);
      }
      if (genericLanguage.test(`${clean(final.hook)} ${clean(final.post)}`)) {
        final = {
          ...final,
          hook: removeGenericLanguage(final.hook),
          post: removeGenericLanguage(final.post),
          qualityChecks: [...(Array.isArray(final.qualityChecks) ? final.qualityChecks : []), 'linguagem generica removida pelo editor'],
        };
      }
      return validateResult(final);
    }, (provider, error) => console.warn(`LinkedIn Writer: provedor ${provider.label} falhou (${errorMessage(error)}).`));

    return json({ success: true, result });
  } catch (error) {
    console.error('generate-linkedin-copy:', error);
    return json({ success: false, error: errorMessage(error) }, 500);
  }
});
