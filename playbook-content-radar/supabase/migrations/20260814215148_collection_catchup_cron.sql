-- Segunda tentativa diária dos coletores de conteúdo.
--
-- Em 14/08/2026 o PostgREST ficou inacessível das 08:40 às 09:40 UTC ("upstream
-- connect error ... delayed connect error: 111"). O pg_cron disparou os três jobs
-- normalmente, mas collect-youtube (09:00) e collect-linkedin (09:30) caíram no
-- primeiro insert do startRun e devolveram 500 sem nem chamar a Apify. Como o
-- insert em collection_runs era justamente o que falhou, o dia não deixou NENHUMA
-- linha — o painel mostrava ausência de execução, não falha, e o snapshot diário
-- de likes/comentários de 14/08 só não virou buraco permanente porque a coleta foi
-- reexecutada à mão.
--
-- O retry com backoff em _shared/dbRetry.ts cobre blip de segundos; queda de uma
-- hora só se recupera com nova execução agendada. Este job roda às 14:00 UTC
-- (11:00 em America/Sao_Paulo) e redispara apenas os coletores que ainda não
-- registraram execução no dia — se tudo correu bem de manhã, ele não gasta nada.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'content-dashboard-catchup') then
    perform cron.unschedule('content-dashboard-catchup');
  end if;
end
$$;

select cron.schedule(
  'content-dashboard-catchup',
  '0 14 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || target.function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'supabase_cron_catchup')
  )
  -- collect-youtube grava 'apify_youtube' ou 'public_youtube' conforme APIFY_TOKEN
  -- esteja configurado; os dois contam como coleta feita.
  from (values
    ('collect-youtube', array['apify_youtube', 'public_youtube']),
    ('collect-linkedin', array['apify_linkedin']),
    ('collect-instagram', array['apify_instagram'])
  ) as target(function_name, sources)
  where not exists (
    select 1
    from public.collection_runs run
    where run.source = any (target.sources)
      and (
        -- Janela de 12h em vez de "hoje": às 14:00 UTC ela cobre os slots das
        -- 09:00/09:30/10:00 sem depender de fuso nem de virada de data.
        -- 'partial' conta como executado — houve coleta, ainda que degradada;
        -- só ausência total ou 'failed' merece gastar Apify de novo.
        (run.status in ('success', 'partial') and run.started_at > now() - interval '12 hours')
        -- Defensivo: não atropela um run ainda em andamento.
        or (run.status = 'running' and run.started_at > now() - interval '30 minutes')
      )
  );
  $job$
);

-- Verificação:
-- select jobid, jobname, schedule, active from cron.job where jobname like 'content-dashboard-%';
-- Simulação (mostra quais coletores seriam redisparados agora, sem disparar):
-- select target.function_name from (values
--   ('collect-youtube', array['apify_youtube','public_youtube']),
--   ('collect-linkedin', array['apify_linkedin']),
--   ('collect-instagram', array['apify_instagram'])
-- ) as target(function_name, sources)
-- where not exists (select 1 from public.collection_runs run where run.source = any (target.sources)
--   and ((run.status in ('success','partial') and run.started_at > now() - interval '12 hours')
--     or (run.status = 'running' and run.started_at > now() - interval '30 minutes')));
