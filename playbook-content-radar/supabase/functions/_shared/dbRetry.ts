// Uma indisponibilidade curta do PostgREST matava a coleta do dia inteiro: em
// 14/08/2026 o banco ficou inacessível das 08:40 às 09:40 UTC ("upstream connect
// error ... delayed connect error: 111"), o insert do startRun estourou e
// collect-youtube (09:00) + collect-linkedin (09:30) devolveram 500 sem nem
// chegar na Apify. Pior: sem runId não havia linha em collection_runs, então o
// painel mostrava ausência de execução em vez de falha. Falha de conexão/gateway
// agora é retentada com backoff antes de derrubar a execução.
//
// Módulo separado do server.ts de propósito: server.ts importa `npm:@supabase/...`
// e só roda no Deno, então não é testável pelo vitest. Aqui não há dependência de
// runtime — mesmo padrão de tallySync.ts/leadPhoneMatch.ts.

import { errorMessage } from './content.ts';

// Só erro de transporte/gateway entra: um erro de constraint ou de permissão não
// melhora com espera e retentar só atrasaria a resposta em ~13s.
const TRANSIENT_DB_ERROR =
  /upstream connect|delayed connect|connect error|no healthy upstream|connection (closed|reset|refused|terminated)|econnreset|econnrefused|epipe|fetch failed|network error|socket hang up|timed? ?out|service unavailable|bad gateway|gateway time|(http|status)[ :]*50[234]\b/i;

export function isTransientDbError(error: unknown) {
  return TRANSIENT_DB_ERROR.test(errorMessage(error));
}

// Espera acumulada de ~13s (1s + 3s + 9s): sobra folga no orçamento do coletor
// (COLLECTOR_BUDGET_MS, padrão 240s) e cobre o blip de alguns segundos. Queda
// longa como a de 14/08 (1h) só se recupera com nova execução agendada.
export const DB_RETRY_ATTEMPTS = 4;
export const DB_RETRY_BASE_MS = 1000;

export type DbRetryOptions = {
  attempts?: number;
  baseMs?: number;
  sleep?: (milliseconds: number) => Promise<unknown>;
};

const defaultSleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Executa `operation` retentando enquanto o erro parecer transitório.
 *
 * `operation` precisa MONTAR a query a cada chamada: o builder do supabase-js só
 * executa uma vez, reaproveitá-lo devolveria o mesmo erro sem tocar no banco.
 */
export async function withDbRetry<T>(label: string, operation: () => PromiseLike<T>, options: DbRetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? DB_RETRY_ATTEMPTS);
  const baseMs = Math.max(0, options.baseMs ?? DB_RETRY_BASE_MS);
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt += 1) {
    const isLastAttempt = attempt >= attempts;
    let failure: unknown;
    try {
      const result = await operation();
      // O supabase-js devolve o erro no corpo (não lança), então a falha de rede
      // chega como `{ error }` — só lança de fato quando o fetch morre antes.
      const returnedError = result && typeof result === 'object' ? (result as { error?: unknown }).error : null;
      if (!returnedError || isLastAttempt || !isTransientDbError(returnedError)) return result;
      failure = returnedError;
    } catch (thrown) {
      if (isLastAttempt || !isTransientDbError(thrown)) throw thrown;
      failure = thrown;
    }
    const backoffMs = baseMs * 3 ** (attempt - 1);
    console.error(`${label}: falha transitória do banco (tentativa ${attempt}/${attempts}), nova tentativa em ${backoffMs}ms:`, errorMessage(failure));
    await sleep(backoffMs);
  }
}
