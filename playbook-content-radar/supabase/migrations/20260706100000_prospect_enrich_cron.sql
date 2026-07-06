-- Cron que drena a fila de análise de leads sozinho, a cada 10 min, mesmo com o
-- navegador fechado. É o que garante "terminar a leitura completa" (pedido do
-- Felipe em 06/07): se o Google limitar/erra, os leads voltam pra fila (pending) e
-- o próximo tick tenta de novo — a lista sempre termina, no ritmo que a cota permitir.
-- A trava de concorrência de 8 min no enrich-leads impede sobreposição com uma
-- análise disparada pela UI (o segundo a chegar recebe "busy" e não faz nada).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prospect-enrich-drain') then
    perform cron.unschedule('prospect-enrich-drain');
  end if;
end
$$;

select cron.schedule(
  'prospect-enrich-drain',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/enrich-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    -- Lote pequeno: respeita o rate limit do LLM e o orçamento de parede da function.
    body := jsonb_build_object('scheduled', true, 'source', 'supabase_cron', 'limit', 3),
    timeout_milliseconds := 300000
  );
  $job$
);

-- Verificação:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'prospect-enrich-drain';
-- select count(*) from public.leads where enrichment_status = 'pending'; -- deve cair ao longo do tempo
