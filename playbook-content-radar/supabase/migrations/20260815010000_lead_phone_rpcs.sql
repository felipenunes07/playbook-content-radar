-- Operações privilegiadas da Base Tally expostas como funções do Postgres.
--
-- Por que assim, e não por um proxy com service role numa env var: o Hub é um bundle
-- público num endereço público, sem login. Qualquer segredo que chegue ao navegador é
-- legível — e o service role ignora RLS, ou seja, daria escrita total no banco a quem
-- abrisse o DevTools. Aqui o navegador só conhece o NOME da função; a senha (Vault) e
-- o privilégio ficam dentro do banco.
--
-- SECURITY DEFINER com search_path fixo: a função roda com o dono, mas só faz o que
-- está escrito aqui. Não é um canal genérico de escrita — cada função tem uma
-- responsabilidade e valida os argumentos.
--
-- O que continua impossível por estas funções:
--   - gravar telefone fora de MATCHED (regra reafirmada no corpo + CHECK da tabela)
--   - tocar leads, qualificação ICP ou qualquer outra tabela
--   - ler ou vazar o collector_shared_secret

-- Registro das execuções disparadas pela interface. Serve para três coisas ao mesmo
-- tempo: a UI acompanhar o resultado (pg_net é assíncrono), o rótulo de última sync,
-- e o limite de uma execução por minuto.
create table if not exists public.tally_sync_runs (
  id uuid primary key default gen_random_uuid(),
  request_id bigint,
  requested_by text,
  requested_at timestamptz not null default now()
);

create index if not exists tally_sync_runs_requested_at_idx on public.tally_sync_runs (requested_at desc);

alter table public.tally_sync_runs enable row level security;
drop policy if exists "tally sync runs read" on public.tally_sync_runs;
create policy "tally sync runs read" on public.tally_sync_runs for select to anon, authenticated using (true);
revoke all on table public.tally_sync_runs from anon, authenticated;
grant select on table public.tally_sync_runs to anon, authenticated;

-- Perfis aceitos. Não é autenticação — o Hub não tem login — mas impede que a coluna
-- reviewed_by receba texto arbitrário vindo do navegador.
create or replace function public.tally_perfil_valido(perfil text)
returns boolean language sql immutable as $$
  select perfil in ('Felipe', 'Victor', 'Fernando', 'Junior')
$$;

-- ============================================================ disparar a sync
-- Chama a MESMA edge function que o cron usa. Nenhuma lógica de ingestão nova.
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

  -- Uma execução por minuto: a sincronização é idempotente, mas o Tally limita a
  -- 100 requisições/min e não há motivo para alguém marteler o botão.
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
      'formIds', jsonb_build_array('VLaVrE', '7RO9QA', 'EkEkX4', 'kdpqLe', 'jaqkJJ', 'lb1gzV'),
      'source', 'hub_manual'
    ),
    timeout_milliseconds := 150000
  ) into novo_request;

  insert into public.tally_sync_runs (request_id, requested_by) values (novo_request, perfil);
  return novo_request;
end;
$$;

-- pg_net é assíncrono: a UI pergunta pelo resultado até ele chegar. Devolve só o
-- corpo da resposta da function — nunca headers, que carregam o secret.
create or replace function public.tally_sync_result(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  resposta jsonb;
begin
  select case
           when r.error_msg is not null then jsonb_build_object('ok', false, 'error', r.error_msg)
           else r.content::jsonb
         end
    into resposta
  from net._http_response r
  where r.id = p_request_id;

  return resposta;  -- null enquanto a execução não terminou
end;
$$;

-- ============================================================ fila de REVIEW
-- A regra do telefone é reafirmada aqui, em SQL: confirmar só libera número se a
-- submission escolhida tiver um, e rejeitar nunca associa nada.
create or replace function public.resolve_lead_phone_review(
  p_lead_id uuid,
  p_submission_id text,
  p_decision text,
  p_reviewer text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.lead_phone_matches%rowtype;
  sub public.tally_submissions%rowtype;
  tem_telefone boolean;
  novo_status text;
begin
  if not public.tally_perfil_valido(p_reviewer) then
    raise exception 'Perfil inválido';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'Decisão inválida';
  end if;

  select * into atual from public.lead_phone_matches where lead_id = p_lead_id;
  if not found then
    raise exception 'Lead sem linha de match';
  end if;
  if atual.match_status <> 'REVIEW' then
    raise exception 'Lead não está em REVIEW (está em %)', atual.match_status;
  end if;

  if p_decision = 'rejected' then
    update public.lead_phone_matches
       set rejected_submission_ids = (
             select jsonb_agg(distinct valor)
             from jsonb_array_elements_text(
               coalesce(rejected_submission_ids, '[]'::jsonb) || to_jsonb(p_submission_id)
             ) as t(valor)
           ),
           review_decision = 'rejected',
           reviewed_by = p_reviewer,
           reviewed_at = now()
     where lead_id = p_lead_id;
    return jsonb_build_object('ok', true, 'status', 'REVIEW', 'decision', 'rejected');
  end if;

  select * into sub from public.tally_submissions where submission_id = p_submission_id;
  if not found then
    raise exception 'Submission não encontrada';
  end if;

  tem_telefone := sub.phone_e164 is not null and sub.phone_e164 <> '';
  novo_status := case when tem_telefone then 'MATCHED' else 'MATCHED_NO_PHONE' end;

  update public.lead_phone_matches
     set match_status = novo_status,
         match_method = 'humano',
         confidence = 1,
         submission_id = sub.submission_id,
         -- Sem telefone na submission o campo fica nulo: o CHECK da tabela recusaria
         -- qualquer outra combinação.
         phone_e164 = case when tem_telefone then sub.phone_e164 else null end,
         phone_form_id = case when tem_telefone then sub.form_id else null end,
         phone_form_name = case when tem_telefone then sub.form_name else null end,
         phone_submitted_at = case when tem_telefone then sub.submitted_at else null end,
         review_decision = 'confirmed',
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where lead_id = p_lead_id;

  return jsonb_build_object('ok', true, 'status', novo_status, 'decision', 'confirmed');
end;
$$;

-- ============================================================ vínculo post ↔ form
create or replace function public.set_post_lead_magnet(
  p_post_id uuid,
  p_tally_form_id text,
  p_tally_form_name text,
  p_reviewer text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tally_perfil_valido(p_reviewer) then
    raise exception 'Perfil inválido';
  end if;
  if not exists (select 1 from public.content_posts where id = p_post_id) then
    raise exception 'Post não encontrado';
  end if;

  if p_tally_form_id is null or p_tally_form_id = '' then
    delete from public.post_lead_magnets where post_id = p_post_id;
    return jsonb_build_object('ok', true, 'removido', true);
  end if;

  delete from public.post_lead_magnets where post_id = p_post_id;
  insert into public.post_lead_magnets (post_id, tally_form_id, tally_form_name, source, confirmed_by)
  values (p_post_id, p_tally_form_id, nullif(p_tally_form_name, ''), 'manual', p_reviewer);

  return jsonb_build_object('ok', true, 'tallyFormId', p_tally_form_id);
end;
$$;

-- ============================================================ formulários conhecidos
-- Alimenta o dropdown sem chamar a API do Tally: os formulários que interessam são
-- exatamente os que já temos submissions.
create or replace view public.v_tally_forms with (security_invoker = true) as
select form_id, max(form_name) as form_name, count(*) as submissions
from public.tally_submissions
group by form_id
order by count(*) desc;

grant select on public.v_tally_forms to anon, authenticated;

-- ============================================================ permissões
revoke all on function public.trigger_tally_sync(text) from public;
revoke all on function public.tally_sync_result(bigint) from public;
revoke all on function public.resolve_lead_phone_review(uuid, text, text, text) from public;
revoke all on function public.set_post_lead_magnet(uuid, text, text, text) from public;

grant execute on function public.trigger_tally_sync(text) to anon, authenticated;
grant execute on function public.tally_sync_result(bigint) to anon, authenticated;
grant execute on function public.resolve_lead_phone_review(uuid, text, text, text) to anon, authenticated;
grant execute on function public.set_post_lead_magnet(uuid, text, text, text) to anon, authenticated;
