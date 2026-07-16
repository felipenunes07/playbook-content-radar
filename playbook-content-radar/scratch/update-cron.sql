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
    body := jsonb_build_object('scheduled', true, 'source', 'supabase_cron', 'limit', 25),
    timeout_milliseconds := 300000
  );
  $job$
);
