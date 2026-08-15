-- Sincroniza TODOS os formulários do Tally, não uma lista fixa.
--
-- A lista fixa de 6 form_id existia porque, sem janela de tempo, incluir os 59
-- formulários significaria baixar ~19 mil submissions históricas a cada rodada. Com o
-- `since` isso deixou de ser verdade: formulário parado devolve zero e sai barato.
--
-- O efeito prático é o que faltava: um lead magnet novo passa a ser ingerido sozinho,
-- e aparece no dropdown de "Lead Magnets" assim que alguém preenche. Antes, um Tally
-- novo ficava invisível até alguém editar este arquivo.
--
-- Custo: ~60 requisições por rodada em vez de 7. O limite do Tally é 100/min e o
-- cliente pausa 250ms entre chamadas, então roda a ~4/min.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tally-sync-hourly') then
    perform cron.unschedule('tally-sync-hourly');
  end if;
end
$$;

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
    -- Sem formIds: a function sincroniza todo formulário que tenha submissão. O
    -- `since` é o que segura o volume.
    body := jsonb_build_object(
      'since', to_char((now() - interval '7 days')::date, 'YYYY-MM-DD'),
      'scheduled', true,
      'source', 'supabase_cron'
    ),
    timeout_milliseconds := 150000
  );
  $job$
);

-- O botão "Sincronizar Tally" usa uma janela maior: quem clica normalmente acabou de
-- criar um lead magnet ou pediu para alguém preencher, e 30 dias garante que um
-- formulário novo entre inteiro na primeira sincronização manual.
create or replace function public.trigger_tally_sync(perfil text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  ultimo timestamptz;
  novo_request bigint;
begin
  if not public.tally_perfil_valido(perfil) then
    raise exception 'Perfil inválido';
  end if;

  select max(requested_at) into ultimo from public.tally_sync_runs;
  if ultimo is not null and ultimo > now() - interval '1 minute' then
    raise exception 'Aguarde um minuto entre sincronizações';
  end if;

  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/tally-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    body := jsonb_build_object(
      'since', to_char((now() - interval '30 days')::date, 'YYYY-MM-DD'),
      'source', 'hub_manual'
    ),
    timeout_milliseconds := 150000
  ) into novo_request;

  insert into public.tally_sync_runs (request_id, requested_by) values (novo_request, perfil);
  return novo_request;
end;
$$;

revoke all on function public.trigger_tally_sync(text) from public;
grant execute on function public.trigger_tally_sync(text) to anon, authenticated;
