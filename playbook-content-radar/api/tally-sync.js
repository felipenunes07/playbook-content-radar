// Proxy serverless (Vercel) entre o Hub e as operações privilegiadas da Base Tally.
//
// Existe por um motivo só: o frontend é um bundle Vite PÚBLICO. Qualquer segredo
// colocado lá é legível por quem abrir o DevTools — e a resposta da tally-sync inclui
// nome e e-mail de submissions, ou seja, dado de terceiro. Então o
// COLLECTOR_SHARED_SECRET e o SERVICE_ROLE_KEY ficam aqui, em env var de servidor, e
// o browser nunca os vê.
//
// Env vars necessárias na Vercel (Settings -> Environment Variables), SEM prefixo
// VITE_ (prefixo VITE_ é exposto no bundle):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   escrita em lead_phone_matches / post_lead_magnets
//   COLLECTOR_SHARED_SECRET     mesmo secret que o cron usa
//
// Não implementa ingestão nem matching: a ação `sync` só repassa a chamada para a
// edge function tally-sync que o cron já usa. Uma segunda lógica de sincronização é
// exatamente o que este arquivo evita.

const FORM_IDS = ['VLaVrE', '7RO9QA', 'EkEkX4', 'kdpqLe', 'jaqkJJ', 'lb1gzV'];
const PERFIS = ['Felipe', 'Victor', 'Fernando', 'Junior'];

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado nas env vars da Vercel`);
  return value;
}

async function supabaseRest(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${path} respondeu ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Dispara a MESMA edge function que o cron usa. */
async function acaoSync(body) {
  const response = await fetch(`${env('SUPABASE_URL')}/functions/v1/tally-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-collector-secret': env('COLLECTOR_SHARED_SECRET'),
    },
    body: JSON.stringify({
      formIds: Array.isArray(body.formIds) && body.formIds.length ? body.formIds : FORM_IDS,
      ...(body.since ? { since: body.since } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `tally-sync respondeu ${response.status}`);
  return payload;
}

/** Lista os formulários do Tally para o dropdown de vínculo Post <-> Form. */
async function acaoListForms() {
  const response = await fetch('https://api.tally.so/forms?page=1&limit=500', {
    headers: { Authorization: `Bearer ${env('TALLY_API_KEY')}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Tally /forms respondeu ${response.status}`);
  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload?.forms) ? payload.forms : []);
  return {
    forms: items
      .map((form) => ({ id: form.id, name: form.name, submissions: form.numberOfSubmissions ?? 0 }))
      .sort((a, b) => b.submissions - a.submissions),
  };
}

/** Decisão humana na fila de REVIEW. A regra do telefone é aplicada AQUI, no
 *  servidor, e não no browser: confirmar só libera número se a submission escolhida
 *  realmente tiver um. */
async function acaoReview(body) {
  const { leadId, submissionId, decision, reviewer } = body;
  if (!leadId || !decision) throw new Error('leadId e decision são obrigatórios');
  if (!['confirmed', 'rejected'].includes(decision)) throw new Error('decision inválida');
  if (!PERFIS.includes(reviewer)) throw new Error('reviewer inválido');

  const atual = await supabaseRest(`lead_phone_matches?lead_id=eq.${leadId}&select=*`);
  const linha = atual?.[0];
  if (!linha) throw new Error('Lead sem linha de match');
  if (linha.match_status !== 'REVIEW') throw new Error(`Lead não está em REVIEW (está em ${linha.match_status})`);

  const agora = new Date().toISOString();
  const rejeitados = Array.isArray(linha.rejected_submission_ids) ? linha.rejected_submission_ids : [];

  if (decision === 'rejected') {
    if (!submissionId) throw new Error('submissionId é obrigatório para rejeitar');
    // Rejeitar não associa telefone e é memorizado para o matcher não sugerir de novo.
    await supabaseRest(`lead_phone_matches?lead_id=eq.${leadId}`, {
      method: 'PATCH',
      body: {
        rejected_submission_ids: [...new Set([...rejeitados, submissionId])],
        review_decision: 'rejected',
        reviewed_by: reviewer,
        reviewed_at: agora,
      },
    });
    return { ok: true, leadId, status: 'REVIEW', decision: 'rejected' };
  }

  if (!submissionId) throw new Error('submissionId é obrigatório para confirmar');
  const submissoes = await supabaseRest(
    `tally_submissions?submission_id=eq.${submissionId}&select=submission_id,phone_e164,form_id,form_name,submitted_at`,
  );
  const submissao = submissoes?.[0];
  if (!submissao) throw new Error('Submission não encontrada');

  const temTelefone = Boolean(submissao.phone_e164);
  await supabaseRest(`lead_phone_matches?lead_id=eq.${leadId}`, {
    method: 'PATCH',
    body: {
      match_status: temTelefone ? 'MATCHED' : 'MATCHED_NO_PHONE',
      match_method: 'humano',
      confidence: 1,
      submission_id: submissao.submission_id,
      // Sem telefone na submission, o status vira MATCHED_NO_PHONE e o campo fica
      // nulo — o CHECK do banco recusaria qualquer outra combinação.
      phone_e164: temTelefone ? submissao.phone_e164 : null,
      phone_form_id: temTelefone ? submissao.form_id : null,
      phone_form_name: temTelefone ? submissao.form_name : null,
      phone_submitted_at: temTelefone ? submissao.submitted_at : null,
      review_decision: 'confirmed',
      reviewed_by: reviewer,
      reviewed_at: agora,
    },
  });
  return {
    ok: true, leadId, decision: 'confirmed',
    status: temTelefone ? 'MATCHED' : 'MATCHED_NO_PHONE',
  };
}

/** Cria ou corrige o vínculo Post <-> Tally Form, sempre com source='manual'. */
async function acaoVincular(body) {
  const { postId, tallyFormId, tallyFormName, reviewer } = body;
  if (!postId) throw new Error('postId é obrigatório');
  if (!PERFIS.includes(reviewer)) throw new Error('reviewer inválido');

  if (!tallyFormId) {
    // Remover o vínculo: só apaga os manuais e os semeados deste post.
    await supabaseRest(`post_lead_magnets?post_id=eq.${postId}`, { method: 'DELETE' });
    return { ok: true, postId, removido: true };
  }

  await supabaseRest('post_lead_magnets', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [{
      post_id: postId,
      tally_form_id: tallyFormId,
      tally_form_name: tallyFormName || null,
      source: 'manual',
      confirmed_by: reviewer,
    }],
  });
  return { ok: true, postId, tallyFormId };
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ ok: false, error: 'Use POST' });

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  const acao = body.action || 'sync';

  try {
    if (acao === 'sync') return response.status(200).json(await acaoSync(body));
    if (acao === 'listForms') return response.status(200).json(await acaoListForms());
    if (acao === 'review') return response.status(200).json(await acaoReview(body));
    if (acao === 'linkForm') return response.status(200).json(await acaoVincular(body));
    return response.status(400).json({ ok: false, error: `Ação desconhecida: ${acao}` });
  } catch (error) {
    console.error(`tally-sync proxy (${acao}) falhou:`, error);
    return response.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
