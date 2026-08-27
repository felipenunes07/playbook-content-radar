import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTransientDbError, withDbRetry } from './dbRetry.ts';

// A mensagem real que derrubou collect-linkedin e collect-youtube em 14/08/2026.
const OUTAGE_MESSAGE = 'upstream connect error or disconnect/reset before headers. retried and the latest reset reason: remote connection failure, transport failure reason: delayed connect error: 111';

// Sem espera real: o backoff de produção somaria ~13s por chamada.
const options = { sleep: async () => {}, baseMs: 1 };

describe('isTransientDbError', () => {
  it('reconhece a indisponibilidade de gateway de 14/08/2026', () => {
    expect(isTransientDbError({ message: OUTAGE_MESSAGE })).toBe(true);
  });

  it('reconhece outras falhas de transporte', () => {
    for (const message of ['fetch failed', 'ECONNRESET', 'socket hang up', 'no healthy upstream', 'connection reset by peer', '503 Service Unavailable', 'canceling statement due to statement timeout']) {
      expect(isTransientDbError(new Error(message)), message).toBe(true);
    }
  });

  it('não retenta erro de dado ou de permissão', () => {
    for (const message of [
      'duplicate key value violates unique constraint "content_posts_external_post_id_key"',
      'new row violates row-level security policy for table "collection_runs"',
      'invalid input syntax for type timestamp with time zone: "ontem"',
      'Could not find the \'title\' column of \'content_posts\' in the schema cache',
    ]) {
      expect(isTransientDbError({ message }), message).toBe(false);
    }
  });
});

describe('withDbRetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve o resultado sem retentar quando dá certo de primeira', async () => {
    const operation = vi.fn(async () => ({ data: { id: 'run-1' }, error: null }));
    const result = await withDbRetry('Abertura', operation, options);
    expect(result.data.id).toBe('run-1');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('recupera quando o banco volta depois de um blip', async () => {
    let call = 0;
    const operation = vi.fn(async () => {
      call += 1;
      return call < 3 ? { data: null, error: { message: OUTAGE_MESSAGE } } : { data: { id: 'run-2' }, error: null };
    });
    const result = await withDbRetry('Abertura', operation, options);
    expect(result.data.id).toBe('run-2');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('monta a query de novo em cada tentativa', async () => {
    // Reaproveitar o builder do supabase-js devolveria o mesmo erro sem tocar no
    // banco — o retry precisa chamar a fábrica, não um único thenable.
    const built: number[] = [];
    let call = 0;
    const result = await withDbRetry('Abertura', () => {
      call += 1;
      built.push(call);
      return Promise.resolve(call < 2 ? { error: { message: 'fetch failed' } } : { error: null, data: 'ok' });
    }, options);
    expect(built).toEqual([1, 2]);
    expect(result.data).toBe('ok');
  });

  it('desiste depois do limite de tentativas e devolve o último erro', async () => {
    const operation = vi.fn(async () => ({ data: null, error: { message: OUTAGE_MESSAGE } }));
    const result = await withDbRetry('Abertura', operation, { ...options, attempts: 4 });
    expect(result.error.message).toBe(OUTAGE_MESSAGE);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('devolve erro permanente na primeira tentativa, sem gastar backoff', async () => {
    const permanent = { message: 'duplicate key value violates unique constraint' };
    const operation = vi.fn(async () => ({ data: null, error: permanent }));
    const result = await withDbRetry('Abertura', operation, options);
    expect(result.error).toBe(permanent);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retenta quando a operação LANÇA erro transitório', async () => {
    let call = 0;
    const operation = vi.fn(async () => {
      call += 1;
      if (call < 2) throw new TypeError('fetch failed');
      return { data: { id: 'run-3' }, error: null };
    });
    const result = await withDbRetry('Abertura', operation, options);
    expect(result.data.id).toBe('run-3');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('propaga erro lançado que não é transitório', async () => {
    const operation = vi.fn(async () => {
      throw new Error('APIFY_TOKEN e APIFY_LINKEDIN_ACTOR_ID são obrigatórios');
    });
    await expect(withDbRetry('Abertura', operation, options)).rejects.toThrow('APIFY_TOKEN');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('cresce o backoff de forma exponencial', async () => {
    const waits: number[] = [];
    const operation = async () => ({ error: { message: OUTAGE_MESSAGE } });
    await withDbRetry('Abertura', operation, { attempts: 4, baseMs: 1000, sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([1000, 3000, 9000]);
  });
});
