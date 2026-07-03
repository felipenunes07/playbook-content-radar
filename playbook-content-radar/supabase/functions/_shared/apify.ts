// Cliente Apify com orçamento de tempo. As Edge Functions têm limite de parede
// (~400s) e o pg_net do cron aborta em 300s: se um actor demorar, a function era
// morta no meio SEM finalizar o collection_run (ficava "running" pra sempre —
// aconteceu com o YouTube em 03/07/2026). Aqui cada chamada respeita um deadline
// global: o actor recebe timeout na própria Apify, o poll para antes do limite e
// o chamador consegue encerrar o run com status honesto.

const APIFY_API = 'https://api.apify.com/v2';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function collectorDeadline() {
  const budget = Number(Deno.env.get('COLLECTOR_BUDGET_MS') || 240000);
  return Date.now() + clamp(budget, 60000, 350000);
}

export function remainingMs(deadlineAt: number) {
  return deadlineAt - Date.now();
}

export async function apify(path: string, token: string, init?: RequestInit & { timeoutMs?: number }) {
  const separator = path.includes('?') ? '&' : '?';
  const { timeoutMs, ...requestInit } = init || {};
  const response = await fetch(`${APIFY_API}/${path}${separator}token=${encodeURIComponent(token)}`, {
    ...requestInit,
    signal: AbortSignal.timeout(clamp(timeoutMs ?? 30000, 5000, 120000)),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `Apify API ${response.status}`);
  return body.data ?? body;
}

export async function runActor(actorId: string, token: string, input: Record<string, unknown>, deadlineAt: number) {
  const remaining = remainingMs(deadlineAt);
  if (remaining < 25000) throw new Error('Tempo do coletor esgotado antes de iniciar o actor');

  // O actor é abortado pela própria Apify se passar do orçamento (timeout em segundos),
  // e o waitForFinish segura a resposta no servidor — sem loop de espera local longo.
  const remainingSecs = Math.floor(remaining / 1000);
  const actorTimeoutSecs = clamp(remainingSecs - 15, 30, 300);
  const waitForFinishSecs = clamp(remainingSecs - 20, 10, 60);

  let run = await apify(
    `acts/${encodeURIComponent(actorId)}/runs?waitForFinish=${waitForFinishSecs}&timeout=${actorTimeoutSecs}`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      timeoutMs: (waitForFinishSecs + 15) * 1000,
    },
  );

  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    if (remainingMs(deadlineAt) < 15000) {
      // Aborta o run na Apify (best-effort) pra não seguir cobrando à toa.
      try {
        await apify(`actor-runs/${run.id}/abort`, token, { method: 'POST', timeoutMs: 10000 });
      } catch { /* run será encerrado pelo timeout do próprio actor */ }
      throw new Error(`Actor ${actorId} não terminou dentro do orçamento de tempo do coletor`);
    }
    await wait(5000);
    run = await apify(`actor-runs/${run.id}`, token);
  }
  if (run.status !== 'SUCCEEDED') throw new Error(`Actor terminou com status ${run.status || 'desconhecido'}`);
  return apify(`datasets/${run.defaultDatasetId}/items?clean=true&limit=1000`, token, { timeoutMs: 60000 });
}
