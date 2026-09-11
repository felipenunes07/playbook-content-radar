-- Religa o cron que drena a fila de análise de leads sozinho, a cada 10 min, sem
-- depender da tela aberta. Ele foi desligado (active=false) em 03/09/2026 quando o
-- enriquecimento estourava o crédito da Apify. Desde então o enriquecimento sai da
-- Bright Data (secret ENRICH_PROVIDER=brightdata), e a Apify só raspa comentários —
-- então o custo que motivou o desligamento não existe mais. Sem o cron, 673 leads
-- ficaram em "Aguardando análise" por dias (11/09/2026).
--
-- Lote reduzido de 25 para 10: a Bright Data responde em 20-140s por lote e a
-- function morre em ~150s no plano free. 10 leads × até 2 ICPs cabe na parede com
-- folga; um run morto deixa a trava de 8 min ligada e atrasa a fila.
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
    body := jsonb_build_object('scheduled', true, 'source', 'supabase_cron', 'limit', 10),
    timeout_milliseconds := 300000
  );
  $job$
);
