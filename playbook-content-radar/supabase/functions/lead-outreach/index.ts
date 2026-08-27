import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';
import { llmHeaders, parseLlmJson, requireClassificationProviders, withLlmFallback } from '../_shared/llm.ts';
import { archivePipeline, enterPipeline } from '../_shared/pipelineOps.ts';

// Fase 3 da prospecção: ações sobre um lead a partir da lista do dashboard.
//   { action: 'generate_message', leadId }  → gera a mensagem de 1º contato (LLM)
//   { action: 'set_status', leadId, status } → checkbox "Prospectado" manual
// E o cadastro dos ICPs (a tabela é só-leitura pro front; escrita passa por aqui):
//   { action: 'list_icps' } | { action: 'save_icp', ... } | { action: 'delete_icp', icpId }
//   { action: 'set_default_icp', icpId }
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
  const providers = requireClassificationProviders();
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

  return withLlmFallback(providers, async (provider) => {
    // Num 429/5xx espera e tenta de novo no mesmo provedor antes de cair no reserva.
    let response!: Response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(provider.url, {
        method: 'POST',
        headers: llmHeaders(provider),
        body: JSON.stringify({ model: provider.model, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      });
      if (response.status !== 429 && response.status < 500) break;
      if (attempt < 2) { await response.body?.cancel(); await new Promise((resolve) => setTimeout(resolve, 15000 * (attempt + 1))); }
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `Classification API ${response.status}`);
    const parsed = parseLlmJson(body);
    const message = String(parsed.message || '').trim();
    if (!message) throw new Error('Modelo retornou mensagem vazia');
    return message;
  }, (provider, error) => console.warn(`Mensagem: provedor ${provider.label} falhou (${errorMessage(error)}), tentando próximo.`));
}

// Áreas que o agente de qualificação sabe devolver — é o vocabulário que a regra
// dura por ICP entende. Qualquer outra string viraria filtro que nunca casa.
const AREAS = ['marketing', 'vendas', 'operacoes', 'growth', 'tecnologia', 'financeiro', 'rh', 'outro', 'desconhecido'];

function sanitizeAreas(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    const area = String(item || '').trim().toLowerCase();
    if (AREAS.includes(area)) seen.add(area);
  }
  return [...seen];
}

// Um default só (o índice parcial no banco garante); limpar antes de marcar evita
// depender da ordem de avaliação do índice.
//
// NÃO mexe em `active`: forçar active:true aqui fazia o "Ativo" desmarcado na tela
// nunca pegar no ICP padrão, sem nenhuma mensagem de erro — a tela dizia "salvo" e o
// ICP voltava ativo. Um ICP padrão desativado é responsabilidade de quem desativou;
// o diálogo de prospectar avisa quando não sobrou nenhum ativo.
async function setDefaultIcp(client: ReturnType<typeof adminClient>, icpId: string) {
  const { error: clearError } = await client.from('icp_profiles')
    .update({ is_default: false }).eq('is_default', true).neq('id', icpId);
  if (clearError) throw clearError;
  const { error: markError } = await client.from('icp_profiles')
    .update({ is_default: true }).eq('id', icpId);
  if (markError) throw markError;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await request.json().catch(() => ({}));
    const expectedSecret = Deno.env.get('COLLECTOR_SHARED_SECRET');
    const hasSecret = Boolean(expectedSecret) && request.headers.get('x-collector-secret') === expectedSecret;
    if (!hasSecret && body?.manual !== true) throw new Error('Execução não autorizada');

    const { action, leadId } = body;
    const client = adminClient();

    if (action === 'list_icps') {
      const { data, error: listError } = await client.from('icp_profiles')
        .select('*').order('is_default', { ascending: false }).order('name');
      if (listError) throw listError;
      return json({ success: true, icps: data || [] });
    }

    // Cria ou edita um ICP. Sem icpId é criação; ICP novo nasce com a regra dura
    // DESLIGADA (o combinado: público fora do corte comercial fica na mão do texto
    // de critérios, não de um if herdado de outro ICP).
    if (action === 'save_icp') {
      const icpId = typeof body.icpId === 'string' && body.icpId.trim() ? body.icpId.trim() : null;
      const name = String(body.name || '').trim();
      if (!name) throw new Error('O ICP precisa de um nome');
      const minCompanySize = body.minCompanySize === null || body.minCompanySize === undefined || body.minCompanySize === ''
        ? null
        : Math.max(0, Math.trunc(Number(body.minCompanySize)));
      if (minCompanySize !== null && !Number.isFinite(minCompanySize)) throw new Error('Porte mínimo inválido');
      const patch: Record<string, unknown> = {
        name,
        icp_rules: typeof body.icpRules === 'string' ? (body.icpRules.trim() || null) : null,
        message_template: typeof body.messageTemplate === 'string' ? (body.messageTemplate.trim() || null) : null,
        hard_rules_enabled: body.hardRulesEnabled === true,
        min_company_size: minCompanySize,
        approved_areas: sanitizeAreas(body.approvedAreas),
        blocked_areas: sanitizeAreas(body.blockedAreas),
      };
      if (body.active !== undefined) patch.active = body.active !== false;

      let saved: { id: string; name: string } | null = null;
      if (icpId) {
        const { data, error: updateError } = await client.from('icp_profiles')
          .update(patch).eq('id', icpId).select('id, name').single();
        if (updateError) throw new Error(updateError.code === '23505' ? `Já existe um ICP chamado "${name}"` : updateError.message);
        saved = data;
      } else {
        const { data, error: insertError } = await client.from('icp_profiles')
          .insert(patch).select('id, name').single();
        if (insertError) throw new Error(insertError.code === '23505' ? `Já existe um ICP chamado "${name}"` : insertError.message);
        saved = data;
      }
      if (body.isDefault === true && saved) await setDefaultIcp(client, saved.id);
      return json({ success: true, saved: true, icpId: saved?.id, name: saved?.name });
    }

    if (action === 'set_default_icp') {
      const icpId = String(body.icpId || '').trim();
      if (!icpId) throw new Error('icpId é obrigatório');
      await setDefaultIcp(client, icpId);
      return json({ success: true, icpId });
    }

    // Apagar um ICP levaria os vereditos dele junto (cascade). Só deixamos apagar o
    // que ainda não julgou ninguém; o resto se desativa (sai do diálogo do
    // Prospectar, mas o histórico da lista continua legível).
    if (action === 'delete_icp') {
      const icpId = String(body.icpId || '').trim();
      if (!icpId) throw new Error('icpId é obrigatório');
      const { data: icp, error: icpError } = await client.from('icp_profiles')
        .select('id, name, is_default').eq('id', icpId).maybeSingle();
      if (icpError) throw icpError;
      if (!icp) throw new Error('ICP não encontrado');
      if (icp.is_default) throw new Error('Este é o ICP padrão. Marque outro como padrão antes de apagar.');
      // O erro da contagem NÃO pode ser ignorado: uma falha transitória do PostgREST
      // levaria ao DELETE abaixo, e o cascade de lead_qualifications apagaria em
      // silêncio todos os vereditos daquele ICP. É o único caminho de perda de dado
      // irreversível desta função — na dúvida, não apaga.
      const { count, error: countError } = await client.from('lead_qualifications')
        .select('id', { count: 'exact', head: true }).eq('icp_id', icpId);
      if (countError) throw new Error(`Não deu para conferir quantos leads este ICP já julgou (${countError.message}). Nada foi apagado — tente de novo.`);
      if ((count ?? 0) > 0) {
        const { error: deactivateError } = await client.from('icp_profiles')
          .update({ active: false }).eq('id', icpId);
        if (deactivateError) throw deactivateError;
        return json({
          success: true, deactivated: true, icpId,
          message: `"${icp.name}" já qualificou ${count} lead(s), então foi DESATIVADO em vez de apagado — o histórico continua na lista, mas ele não aparece mais na hora de prospectar.`,
        });
      }
      const { error: deleteError } = await client.from('icp_profiles').delete().eq('id', icpId);
      if (deleteError) throw deleteError;
      return json({ success: true, deleted: true, icpId });
    }

    // Compatibilidade: quem ainda mandar save_settings edita o ICP padrão.
    if (action === 'save_settings') {
      const icpRules = typeof body.icpRules === 'string' ? body.icpRules.trim() : undefined;
      const messageTemplate = typeof body.messageTemplate === 'string' ? body.messageTemplate.trim() : undefined;
      if (icpRules === undefined && messageTemplate === undefined) throw new Error('Nada para salvar');
      const patch: Record<string, unknown> = {};
      if (icpRules !== undefined) patch.icp_rules = icpRules || null;
      if (messageTemplate !== undefined) patch.message_template = messageTemplate || null;
      const { data: target, error: targetError } = await client.from('icp_profiles')
        .select('id').eq('is_default', true).maybeSingle();
      if (targetError) throw targetError;
      if (!target) throw new Error('Nenhum ICP padrão cadastrado');
      const { error: settingsError } = await client.from('icp_profiles').update(patch).eq('id', target.id);
      if (settingsError) throw settingsError;
      return json({ success: true, saved: true, icpId: target.id });
    }

    if (!leadId) throw new Error('leadId é obrigatório');

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

      // Template resolvido na ordem: mensagem do ICP pedido (o filtro da tela manda
      // icpId) > do ICP que qualificou o lead > do ICP padrão > secret > LLM. Cada
      // ICP fala com um público diferente, então a mensagem também é dele.
      const requestedIcpId = typeof body.icpId === 'string' && body.icpId.trim() ? body.icpId.trim() : null;
      let icpTemplate: string | null = null;
      // De qual ICP saiu o texto. Vai gravado junto porque lead_outreach é unique por
      // lead: com dois ICPs, gerar a mensagem no segundo sobrescreve a do primeiro, e
      // sem esta coluna não havia como a tela avisar que o texto guardado foi escrito
      // para outro público.
      let messageIcpId: string | null = null;
      for (const candidate of [requestedIcpId, lead.qualification_icp_id]) {
        if (!candidate) continue;
        const { data: icp } = await client.from('icp_profiles').select('message_template').eq('id', candidate).maybeSingle();
        if (icp?.message_template) { icpTemplate = icp.message_template; messageIcpId = candidate; break; }
        if (icp) { messageIcpId = candidate; break; } // ICP existe mas sem mensagem própria: cai no padrão
      }
      if (!icpTemplate) {
        const { data: fallbackIcp } = await client.from('icp_profiles')
          .select('id, message_template').eq('is_default', true).maybeSingle();
        icpTemplate = fallbackIcp?.message_template || null;
        if (icpTemplate && fallbackIcp?.id) messageIcpId = fallbackIcp.id;
      }
      const template = icpTemplate || Deno.env.get('PROSPECT_MESSAGE_TEMPLATE');
      const message = template
        ? fillTemplate(template, lead, post)
        : await generateMessage(lead, post, comment?.comment_text || null);
      const { data: outreach, error: outreachError } = await client.from('lead_outreach').upsert({
        lead_id: leadId,
        generated_message: message,
        message_icp_id: messageIcpId,
        angle: template ? 'template' : (Deno.env.get('PROSPECT_MESSAGE_ANGLE') ? 'custom' : 'default'),
        channel: 'linkedin',
      }, { onConflict: 'lead_id' }).select('id, status').single();
      if (outreachError) throw outreachError;
      return json({ success: true, message, outreachId: outreach.id, status: outreach.status, messageIcpId });
    }

    if (action === 'set_status') {
      const status = String(body.status || '');
      if (!['new', 'prospected', 'replied', 'ignored'].includes(status)) throw new Error(`Status inválido: ${status}`);
      const now = new Date().toISOString();
      const { error: statusError } = await client.from('lead_outreach').upsert({
        lead_id: leadId,
        status,
        prospected_at: status === 'prospected' ? now : null,
      }, { onConflict: 'lead_id' });
      if (statusError) throw statusError;

      // Marcar "Prospectado" = SELECIONAR o lead para a operação comercial. Não é o
      // 1º contato: o card nasce em 'a_prospectar' e NENHUM touchpoint é criado —
      // a distância entre "Prospectados" e "Contatados" é justamente a métrica que
      // o Kanban existe pra revelar.
      // Desmarcar arquiva o card sem destruir touchpoints nem eventos de etapa.
      // Ver docs/superpowers/plans/2026-08-27-kanban-e-funil-comercial.md
      let pipelineStage: string | null = null;
      try {
        if (status === 'prospected') {
          const icpId = typeof body.icpId === 'string' && body.icpId.trim() ? body.icpId.trim() : null;
          const owner = typeof body.owner === 'string' && body.owner.trim() ? body.owner.trim() : null;
          const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : null;
          const row = await enterPipeline(client, { leadId, icpId, owner, actor, now });
          pipelineStage = row.stage;
        } else {
          const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : null;
          await archivePipeline(client, {
            leadId, actor, now,
            reason: `Checkbox "Prospectado" desmarcado (status → ${status}).`,
          });
        }
      } catch (pipelineError) {
        // O status em lead_outreach já foi gravado e é o que a aba Leads ICP lê. Um
        // erro só no board não pode desfazer a marcação que o operador acabou de
        // fazer — ele reportaria "falhou" e clicaria de novo, gerando evento duplo.
        console.error('set_status: pipeline não atualizado:', errorMessage(pipelineError));
        return json({ success: true, leadId, status, pipelineWarning: errorMessage(pipelineError) });
      }
      return json({ success: true, leadId, status, pipelineStage });
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (error) {
    const message = errorMessage(error);
    return json({ success: false, error: message }, message.includes('autorizada') ? 401 : 500);
  }
});
