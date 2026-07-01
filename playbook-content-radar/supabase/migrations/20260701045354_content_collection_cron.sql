create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'content-dashboard-youtube-daily') then
    perform cron.unschedule('content-dashboard-youtube-daily');
  end if;
  if exists (select 1 from cron.job where jobname = 'content-dashboard-linkedin-daily') then
    perform cron.unschedule('content-dashboard-linkedin-daily');
  end if;
end
$$;

-- Supabase Cron evaluates these expressions in UTC. 09:00/09:30 UTC correspond
-- to 06:00/06:30 in America/Sao_Paulo under the current UTC-03 offset.
select cron.schedule(
  'content-dashboard-youtube-daily',
  '0 9 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/collect-youtube',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'supabase_cron')
  );
  $job$
);

select cron.schedule(
  'content-dashboard-linkedin-daily',
  '30 9 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/collect-linkedin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'supabase_cron')
  );
  $job$
);

-- Required Vault setup, run once with real values before relying on the jobs:
-- select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_PUBLISHABLE_KEY', 'publishable_key');
-- select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'collector_shared_secret');
-- Verification:
-- select jobid, jobname, schedule, active from cron.job where jobname like 'content-dashboard-%';
-- select * from cron.job_run_details order by start_time desc limit 20;
