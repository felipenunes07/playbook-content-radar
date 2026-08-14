-- Cron da tally-sync: puxa as submissions novas do Tally e roda o matcher sozinho.
--
-- 1x por hora, janela de 7 dias. A janela existe para o incremental não rebaixar as
-- ~19 mil submissions históricas toda hora: o `since` vira o startDate da API do
-- Tally, então cada execução só traz quem preencheu na última semana. Sete dias (e
-- não uma hora) dá folga para uma execução falhar sem criar buraco na base.
--
-- Escala: 6 formulários = 7 requests por execução (1 de /forms + 6 de submissions).
-- O limite do Tally é 100 req/min, então sobra muito. O upsert é por submission_id,
-- então reprocessar a mesma semana a cada hora não duplica nada — só atualiza.
--
-- O matcher roda depois da ingestão e só toca lead qualified que ainda não tem
-- MATCHED com telefone. É isso que faz um MATCHED_NO_PHONE virar MATCHED sozinho
-- na primeira hora depois da pessoa preencher um formulário com telefone.
--
-- Os formulários são fixos de propósito: são os 6 ativos, os únicos que coletam (ou
-- passaram a coletar) telefone. Omitir formIds traria os 59, o que hoje só aumentaria
-- volume sem aumentar telefone. Para incluir um lead magnet novo, adicione o form_id
-- aqui e o vínculo em post_lead_magnets.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tally-sync-hourly') then
    perform cron.unschedule('tally-sync-hourly');
  end if;
end
$$;

-- Minuto 15 para não cair junto com as collectors diárias (09:00, 09:30, 10:00 UTC),
-- que disputariam a mesma janela de execução.
select cron.schedule(
  'tally-sync-hourly',
  '15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/tally-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    body := jsonb_build_object(
      'formIds', jsonb_build_array('VLaVrE', '7RO9QA', 'EkEkX4', 'kdpqLe', 'jaqkJJ', 'lb1gzV'),
      'since', to_char((now() - interval '7 days')::date, 'YYYY-MM-DD'),
      'scheduled', true,
      'source', 'supabase_cron'
    ),
    -- Timeout generoso para que net._http_response guarde a resposta completa: é por
    -- ela que se monitora a execução (quantas novas, quantos MATCHED).
    timeout_milliseconds := 150000
  );
  $job$
);
