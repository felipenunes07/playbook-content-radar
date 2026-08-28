import { describe, expect, it } from 'vitest';
import { loadContentMetrics } from './repository.js';
import bundledYoutubeHistory from './data/youtube-history.json';

// `withCount: false` imita um servidor que nao devolve o total no Content-Range —
// e o que faz o loader voltar a pedir pagina por pagina.
function fakeSupabase(results, calls = [], { withCount = true, concurrency = null } = {}) {
  return {
    from(name) {
      return {
        // O client real devolve um builder encadeável e só resolve no await. Sem
        // suportar order/limit/eq/not/head aqui, qualquer consulta filtrada lançaria
        // e o loader cairia no snapshot local — mascarando o que a tela realmente pede.
        select(columns = '*', options = {}) {
          const call = { name, columns, head: options.head === true, count: options.count };
          calls.push(call);
          const resolved = results[name] || { data: [], error: null };
          const builder = {
            order() { return builder; },
            limit() { return builder; },
            eq() { return builder; },
            not() { return builder; },
            // As consultas de lead são paginadas para escapar do teto de 1.000 linhas
            // do PostgREST. O fake precisa FATIAR de verdade, senão cada página
            // devolveria a lista inteira e o loop de paginação nunca terminaria.
            range(from, to) {
              const all = resolved.data || [];
              const ranged = resolved.error
                ? resolved
                : {
                  data: all.slice(from, to + 1),
                  error: null,
                  // O PostgREST so manda o total quando a consulta pediu `count`, e e
                  // esse total que permite disparar as paginas restantes de uma vez.
                  count: withCount && options.count === 'exact' ? all.length : null,
                };
              // Registra quantas paginas desta tabela estao no ar ao mesmo tempo: e a
              // diferenca entre pedir em fila indiana e pedir em paralelo.
              if (concurrency) {
                const state = concurrency[name] || (concurrency[name] = { emVoo: 0, pico: 0 });
                state.emVoo += 1;
                state.pico = Math.max(state.pico, state.emVoo);
              }
              const settle = () => {
                if (concurrency && concurrency[name]) concurrency[name].emVoo -= 1;
                return ranged;
              };
              // Resolve num tick posterior para que paginas disparadas juntas de fato
              // se sobreponham — resolvendo na hora, nada nunca ficaria concorrente.
              const pending = new Promise((resolve) => { setTimeout(() => resolve(settle()), 0); });
              return {
                then(resolve, reject) { return pending.then(resolve, reject); },
                catch(fn) { return pending.catch(fn); },
              };
            },
            then(resolve, reject) { return Promise.resolve(resolved).then(resolve, reject); },
            catch(fn) { return Promise.resolve(resolved).catch(fn); },
          };
          return builder;
        },
      };
    },
  };
}

describe('loadContentMetrics', () => {
  it('uses Supabase as the authoritative source when the metrics view exists', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'db-post' }], error: null },
        v_latest_youtube_video_metrics: { data: [{ id: 'db-video' }], error: null },
        content_accounts: { data: [{ id: 'account' }], error: null },
        import_batches: { data: [{ id: 'import' }], error: null },
        collection_runs: { data: [{ id: 'run' }], error: null },
        account_daily_metrics: { data: [{ account_id: 'account', metric_date: '2026-07-01', followers: 123, source: 'apify_linkedin_profile' }], error: null },
      }),
      fallback: { records: [{ id: 'local' }], collected_at: '2026-05-12' },
    });

    expect(result.source).toBe('supabase');
    expect(result.linkedin).toEqual([{ id: 'db-post' }]);
    expect(result.youtube).toEqual([{ id: 'db-video' }]);
  });

  it('does not treat generated historical account growth as real audience data', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'db-post' }], error: null },
        v_latest_youtube_video_metrics: { data: [], error: null },
        content_accounts: { data: [
          { id: 'linkedin-fernando', owner_name: 'Fernando Tedesco', platform: 'linkedin', account_name: 'Fernando LinkedIn', account_url: 'https://www.linkedin.com/in/fernando-tedesco/' },
          { id: 'youtube-fernando', owner_name: 'Fernando Tedesco', platform: 'youtube', account_name: 'Fernando YouTube', account_url: 'https://www.youtube.com/@fernando_tedesco' },
        ], error: null },
        import_batches: { data: [], error: null },
        collection_runs: { data: [], error: null },
        account_daily_metrics: { data: [
          { account_id: 'linkedin-fernando', metric_date: '2026-06-26', followers: 12450, source: 'historical_json' },
          { account_id: 'linkedin-fernando', metric_date: '2026-06-27', followers: 12501, source: 'apify_linkedin_profile' },
          { account_id: 'youtube-fernando', metric_date: '2026-06-26', subscribers: 2890, total_views: 92000, source: 'historical_json' },
          { account_id: 'youtube-fernando', metric_date: '2026-06-27', subscribers: 2, total_views: null, total_videos: 3, source: 'public_youtube' },
        ], error: null },
      }),
      fallback: { records: [], collected_at: '2026-05-12' },
    });

    expect(result.growth).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'linkedin-fernando', owner_name: 'Fernando Tedesco', platform: 'linkedin', followers: 12501, source: 'apify_linkedin_profile' }),
      expect.objectContaining({ account_id: 'youtube-fernando', owner_name: 'Fernando Tedesco', platform: 'youtube', subscribers: 2, total_videos: 3, source: 'public_youtube' }),
    ]));
    expect(result.growth).toHaveLength(2);
    expect(result.growth).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'linkedin-fernando', followers: 12450, source: 'historical_json' }),
      expect.objectContaining({ account_id: 'youtube-fernando', subscribers: 2890, source: 'historical_json' }),
    ]));
  });

  it('falls back to the bundled historical snapshot when the schema is unavailable', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: null, error: { message: 'relation does not exist' } },
      }),
      fallback: { records: [{ id: 'local' }], collected_at: '2026-05-12' },
    });

    expect(result).toMatchObject({
      source: 'local_snapshot',
      linkedin: [{ id: 'local' }],
      youtube: bundledYoutubeHistory.records || [],
      growth: [],
      freshness: '2026-05-12',
      warning: 'linkedin: relation does not exist',
    });
  });

  it('loads only the lightweight data needed by the Leads ICP page', async () => {
    const calls = [];
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1', hook: 'Post' }], error: null },
        leads: { data: [{ id: 'lead-1', full_name: 'Lead', created_at: '2026-08-05' }], error: null },
      }, calls),
      mode: 'leads',
      force: true,
    });

    expect(result.source).toBe('supabase');
    expect(result.leads).toEqual([expect.objectContaining({ id: 'lead-1' })]);
    // Ordem deixou de ser determinística quando as consultas de lead passaram a
    // paginar: elas montam a query dentro do loop, não na montagem do plano. O que
    // este teste protege é QUAIS tabelas a tela pede, não em que ordem.
    expect(calls.map((call) => call.name).sort()).toEqual([
      'v_latest_linkedin_post_metrics',
      'leads',
      'lead_outreach',
      'lead_comments',
      // Telefone da Base Tally: a view do match, mais três consultas SEM payload de
      // linha (count/head e um order+limit 1) para o rótulo de última sincronização.
      // A tabela vai a ~19k linhas, então baixá-la só para contar quebraria a
      // promessa de carga leve desta tela.
      'v_lead_phones',
      'tally_submissions',
      'tally_submissions',
      'tally_submissions',
      // Veredito por ICP + a lista de ICPs: é o que permite a tela mostrar
      // "aprovado" segundo o ICP escolhido, e não um veredito global.
      'lead_qualifications',
      'icp_profiles',
    ].sort());
    const tallyCalls = calls.filter((call) => call.name === 'tally_submissions');
    expect(tallyCalls).toHaveLength(3);
    expect(tallyCalls.filter((call) => call.head === true)).toHaveLength(2);
    expect(calls.find((call) => call.name === 'leads')?.columns).not.toBe('*');
    expect(calls.find((call) => call.name === 'leads')?.columns).not.toContain('profile_raw');
    expect(calls.find((call) => call.name === 'leads')?.columns).not.toContain('company_raw');
    expect(calls.find((call) => call.name === 'v_latest_linkedin_post_metrics')?.columns).toContain('post_url');
  });

  it('marks a leads query failure instead of reporting an empty successful database', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1' }], error: null },
        leads: { data: null, error: { message: 'statement timeout' } },
      }),
      fallback: { records: [], collected_at: '2026-05-12' },
      mode: 'leads',
      force: true,
    });

    expect(result.source).toBe('local_snapshot');
    expect(result.loadError).toBe(true);
    expect(result.warning).toContain('leads: statement timeout');
  });
});

// O PostgREST corta em 1.000 linhas sem sinalizar erro. Sem paginação a tela de
// Leads ICP mostrava 230 dos 2.199 leads do post das 36 Skills e parecia correta —
// o comercial trabalharia a lista achando que era tudo.
describe('paginação das consultas de lead', () => {
  const manyLeads = Array.from({ length: 2199 }, (_, index) => ({
    id: `lead-${String(index).padStart(4, '0')}`,
    full_name: `Lead ${index}`,
    created_at: '2026-08-17',
  }));
  const manyComments = Array.from({ length: 2263 }, (_, index) => ({
    lead_id: `lead-${String(index).padStart(4, '0')}`,
    post_id: 'post-1',
  }));

  it('busca todas as páginas em vez de parar no teto de 1.000 linhas', async () => {
    const calls = [];
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1', hook: 'Post' }], error: null },
        leads: { data: manyLeads, error: null },
        lead_comments: { data: manyComments, error: null },
      }, calls),
      mode: 'leads',
      force: true,
    });

    expect(result.leads).toHaveLength(2199);
    expect(result.leadComments).toHaveLength(2263);
    // 2.199 leads = 3 páginas (1.000 + 1.000 + 199). A contagem vem junto da
    // primeira, então são exatamente 3 consultas — nenhuma sonda extra.
    expect(calls.filter((call) => call.name === 'leads')).toHaveLength(3);
    expect(calls.filter((call) => call.name === 'lead_comments')).toHaveLength(3);
    // A primeira página é quem pede o total; as seguintes não repetem a contagem.
    const leadCalls = calls.filter((call) => call.name === 'leads');
    expect(leadCalls[0].count).toBe('exact');
    expect(leadCalls.slice(1).every((call) => !call.count)).toBe(true);
  });

  // Doze idas e voltas encadeadas (4 páginas × leads, lead_comments e
  // lead_qualifications) eram metade do tempo de abrir a tela de Leads ICP.
  it('dispara as páginas restantes juntas em vez de uma esperar a outra', async () => {
    const concurrency = {};
    await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1', hook: 'Post' }], error: null },
        leads: { data: manyLeads, error: null },
      }, [], { concurrency }),
      mode: 'leads',
      force: true,
    });

    // 3 páginas: a 1ª sozinha (é ela que traz o total), a 2ª e a 3ª sobrepostas.
    expect(concurrency.leads.pico).toBe(2);
  });

  it('volta a paginar em sequência quando o servidor não informa o total', async () => {
    const calls = [];
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1', hook: 'Post' }], error: null },
        leads: { data: manyLeads, error: null },
      }, calls, { withCount: false }),
      mode: 'leads',
      force: true,
    });

    // Sem total, a única forma segura de saber que acabou é a página incompleta —
    // mais lento, mas nunca uma lista cortada passando por completa.
    expect(result.leads).toHaveLength(2199);
    expect(calls.filter((call) => call.name === 'leads')).toHaveLength(3);
  });

  it('propaga erro de uma página em vez de devolver lista parcial como sucesso', async () => {
    const result = await loadContentMetrics({
      supabase: fakeSupabase({
        v_latest_linkedin_post_metrics: { data: [{ id: 'post-1' }], error: null },
        leads: { data: null, error: { message: 'statement timeout' } },
      }),
      mode: 'leads',
      force: true,
    });

    expect(result.loadError).toBe(true);
    expect(result.warning).toContain('leads: statement timeout');
  });
});
