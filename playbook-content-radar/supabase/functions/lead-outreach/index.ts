import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';

// Fase 3 da prospecção: ações sobre um lead a partir da lista do dashboard.
//   { action: 'generate_message', leadId }  → gera a mensagem de 1º contato (LLM)
//   { action: 'set_status', leadId, status } → checkbox "Prospectado" manual
// A mensagem NUNCA é enviada daqui — o Victor copia e manda na mão (decisão da
// reunião de 04/07: envio automático só na Fase 4, via Unipile).
// O ângulo padrão segue o estilo descrito pelo Victor na call; quando ele passar o
// texto exato do WhatsApp, é só setar PROSPECT_MESSAGE_ANGLE nos secrets (sem deploy).
// Ver docs/superpowers/plans/2026-07-04-warm-prospecting-from-commenters.md

const DEFAULT_ANGLE = `Mensagem curta de LinkedIn (máx 4 frases), tom informal brasileiro, de Victor Baggio (Playbook Lab, consultoria de IA para vendas) para alguém que comentou num post dele dias atrás. Estrutura: (1) menciona que viu o comentário da pessoa no post sobre o tema; (2) conecta o tema com um possível uso na empresa da pessoa; (3) convite leve pra trocar uma ideia, sem pitch agressivo. Exemplo de tom: "Fala [nome]! Vi que você comentou lá no post sobre [tema]. Não sei se você tá buscando construir algo assim aí na [empresa], mas pelo seu perfil acho que faz sentido trocarmos uma ideia. Se topar, vamos nessa?"`;

// Modo preferido (decisão do Victor: "aquela mensagem que eu mandei, não preciso nem
// escrever nada"): o secret PROSPECT_MESSAGE_TEMPLATE guarda o texto LITERAL da
// mensagem, com placeholders {nome}, {company} e {tema_post}. Aqui só preenchemos —
// zero LLM, a mensagem sai idêntica à aprovada. Se o secret não existir, cai no
// modo LLM com o ângulo acima (PROSPECT_MESSAGE_ANGLE).
function fillTemplate(template: string, lead: Record<string, any>, post: Record<string, any> | null) {
  const firstName = String(lead.full_name || '').trim().split(/\s+/)[0] || 'tudo bem';
  const company = String(lead.company_name || '').trim() || 'sua empresa';
  const theme = String(post?.hook || '').trim() || 'vendas com IA';
  return template
    // O CLI de secrets do Supabase corta o valor na primeira quebra de linha, então
    // o template é guardado com "\n" literal (dois caracteres) e convertido aqui.
    .replaceAll('\\n', '\n')
    .replaceAll('{nome}', firstName)
    .replaceAll('{company}', company)
    .replaceAll('{tema_post}', theme)
    .trim();
}

async function generateMessage(lead: Record<string, any>, post: Record<string, any> | null, commentText: string | null) {
  const url = Deno.env.get('CLASSIFICATION_API_URL') || 'https://api.openai.com/v1/chat/completions';
  const apiKey = Deno.env.get('CLASSIFICATION_API_KEY');
  const model = Deno.env.get('CLASSIFICATION_MODEL');
  if (!apiKey || !model) throw new Error('CLASSIFICATION_API_KEY e CLASSIFICATION_MODEL são obrigatórios');
  const angle = Deno.env.get('PROSPECT_MESSAGE_ANGLE') || DEFAULT_ANGLE;

  const context = {
    lead_first_name: String(lead.full_name || '').split(' ')[0] || null,
    lead_full_name: lead.full_name,
    lead_job_title: lead.job_title || lead.headline,
    lead_company: lead.company_name,
    post_hook: post?.hook || null,
    post_excerpt: post?.content ? String(post.content).slice(0, 600) : null,
    lead_comment: commentText ? String(commentText).slice(0, 400) : null,
  };

  const prompt = `${angle}

Retorne SOMENTE JSON válido: {"message": string}
A mensagem deve ser em pt-BR, pronta pra colar no LinkedIn, sem placeholders — use os dados reais abaixo. Se faltar um dado (ex.: empresa), escreva de forma natural sem ele.

Dados:
${JSON.stringify(context)}`;

  // Tier free do Gemini limita ~10 req/min — num 429 espera e tenta de novo antes
  // de devolver erro pro usuário.
  let response!: Response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (response.status !== 429 && response.status < 500) break;
    if (attempt < 2) { await response.body?.cancel(); await new Promise((resolve) => setTimeout(resolve, 15000 * (attempt + 1))); }
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `Classification API ${response.status}`);
  const content = body.choices?.[0]?.message?.content || body.output_text;
  if (!content) throw new Error('Modelo não retornou conteúdo');
  const parsed = JSON.parse(String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  const message = String(parsed.message || '').trim();
  if (!message) throw new Error('Modelo retornou mensagem vazia');
  return message;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await request.json().catch(() => ({}));
    const expectedSecret = Deno.env.get('COLLECTOR_SHARED_SECRET');
    const hasSecret = Boolean(expectedSecret) && request.headers.get('x-collector-secret') === expectedSecret;
    if (!hasSecret && body?.manual !== true) throw new Error('Execução não autorizada');

    const { action, leadId } = body;
    if (!leadId) throw new Error('leadId é obrigatório');
    const client = adminClient();

    if (action === 'generate_message') {
      const { data: lead, error: leadError } = await client.from('leads').select('*').eq('id', leadId).single();
      if (leadError) throw leadError;

      // Contexto do gancho: o comentário mais recente do lead + o post correspondente.
      const { data: comment } = await client.from('lead_comments')
        .select('comment_text, post_id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let post: Record<string, any> | null = null;
      const postId = comment?.post_id || lead.first_seen_post_id;
      if (postId) {
        const { data } = await client.from('content_posts').select('hook, content').eq('id', postId).maybeSingle();
        post = data || null;
      }

      const template = Deno.env.get('PROSPECT_MESSAGE_TEMPLATE');
      const message = template
        ? fillTemplate(template, lead, post)
        : await generateMessage(lead, post, comment?.comment_text || null);
      const { data: outreach, error: outreachError } = await client.from('lead_outreach').upsert({
        lead_id: leadId,
        generated_message: message,
        angle: template ? 'template' : (Deno.env.get('PROSPECT_MESSAGE_ANGLE') ? 'custom' : 'default'),
        channel: 'linkedin',
      }, { onConflict: 'lead_id' }).select('id, status').single();
      if (outreachError) throw outreachError;
      return json({ success: true, message, outreachId: outreach.id, status: outreach.status });
    }

    if (action === 'set_status') {
      const status = String(body.status || '');
      if (!['new', 'prospected', 'replied', 'ignored'].includes(status)) throw new Error(`Status inválido: ${status}`);
      const { error: statusError } = await client.from('lead_outreach').upsert({
        lead_id: leadId,
        status,
        prospected_at: status === 'prospected' ? new Date().toISOString() : null,
      }, { onConflict: 'lead_id' });
      if (statusError) throw statusError;
      return json({ success: true, leadId, status });
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (error) {
    const message = errorMessage(error);
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
