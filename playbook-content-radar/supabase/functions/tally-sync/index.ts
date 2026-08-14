import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json, requireCollectorSecret } from '../_shared/server.ts';
import { createTallyApi } from '../_shared/tallyApi.ts';
import { ingestTallyForms, matchQualifiedLeads } from '../_shared/tallySync.ts';

// Ingestão Tally API → tally_submissions e, em seguida, o matcher nos leads qualified.
// Feita para rodar na mão agora e por cron depois (pg_cron + pg_net, igual ao
// content_collection_cron.sql) sem mudar nada aqui.
//
// Secrets necessários (Supabase → Edge Functions → Secrets):
//   TALLY_API_KEY            token da API do Tally
//   COLLECTOR_SHARED_SECRET  já usado pelas outras collectors; protege a invocação
//
// Corpo (todos opcionais):
//   { "formIds": ["7RO9QA"],    // só esses formulários; omitido = todos com submissão
//     "since": "2026-08-01",    // startDate da API, para sync incremental
//     "skipMatch": false,       // só ingerir, sem rodar o matcher
//     "dryRun": false }         // roda o matcher sem gravar lead_phone_matches
//
// A resposta traz o relatório completo: formulários lidos, submissions recebidas,
// novas, atualizadas, com telefone, leads reprocessados e a distribuição de status.

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const logs: string[] = [];
  const log = (message: string) => { logs.push(message); console.log(message); };

  try {
    requireCollectorSecret(request);

    const token = Deno.env.get('TALLY_API_KEY');
    if (!token) throw new Error('TALLY_API_KEY não configurado nos secrets da function');

    let body: Record<string, any> = {};
    if (request.method === 'POST') {
      try { body = await request.json(); } catch { body = {}; }
    }

    const client = adminClient();
    const api = createTallyApi({ token });

    const ingest = await ingestTallyForms({
      api,
      client,
      formIds: Array.isArray(body.formIds) ? body.formIds : undefined,
      since: typeof body.since === 'string' ? body.since : null,
      log,
    });

    const match = body.skipMatch
      ? null
      : await matchQualifiedLeads({ client, log, dryRun: Boolean(body.dryRun) });

    // Amostra dos matches para inspeção humana. Telefone só aparece em MATCHED —
    // REVIEW expõe apenas os candidatos e as evidências, nunca o número.
    const sample = (match?.results || [])
      .filter((result) => result.status === 'MATCHED' || result.status === 'REVIEW')
      .slice(0, 25)
      .map((result) => ({
        lead: result.leadName,
        status: result.status,
        method: result.method,
        confidence: result.confidence,
        evidence: result.evidence,
        phone: result.status === 'MATCHED' ? result.phoneE164 : null,
        phoneForm: result.status === 'MATCHED' ? result.phoneFormName : null,
        candidates: result.candidates.slice(0, 3).map((candidate) => ({
          name: candidate.fullName,
          email: candidate.email,
          form: candidate.formName,
          hasPhone: Boolean(candidate.phoneE164),
          evidence: candidate.evidence,
        })),
      }));

    return json({
      ok: true,
      ingestao: {
        formularios_lidos: ingest.formsRead,
        submissions_recebidas: ingest.received,
        novas_inseridas: ingest.inserted,
        atualizadas: ingest.updated,
        com_telefone: ingest.withPhone,
        lixo_marcado: ingest.junk,
        por_formulario: ingest.perForm.filter((stat) => stat.received || stat.error),
      },
      matching: match ? {
        leads_qualified: match.stats.qualified,
        pulados_com_telefone_confirmado: match.stats.skippedAlreadyMatched,
        leads_reprocessados: match.stats.reprocessed,
        submissions_candidatas: match.stats.candidateSubmissions,
        MATCHED: match.stats.MATCHED,
        MATCHED_NO_PHONE: match.stats.MATCHED_NO_PHONE,
        REVIEW: match.stats.REVIEW,
        NOT_FOUND: match.stats.NOT_FOUND,
        telefones_seguros: match.stats.telefones,
        gravado: !body.dryRun,
      } : null,
      amostra: sample,
      logs,
    });
  } catch (error) {
    console.error('tally-sync falhou:', errorMessage(error));
    return json({ ok: false, error: errorMessage(error), logs }, 500);
  }
});
