-- Coleta manual pelo hub sem expor o collector secret no bundle.
--
-- O botão "Executar agora" (Configurações → Coletas automáticas) chamava
-- `functions.invoke('collect-linkedin')` direto do navegador. Como o coletor exige
-- o header `x-collector-secret` (_shared/server.ts) e o navegador não tem esse
-- segredo, toda execução manual morria em 401 "Execução não autorizada" — ninguém
-- do time conseguia forçar coleta pela interface (constatado em 09/09/2026).
--
-- A rota `/jobs/collect-linkedin` da content-dashboard-api também não serve: ela
-- fica atrás do MESMO requireCollectorSecret.
--
-- Solução: mesmo padrão já usado pelo sync do Tally — RPC SECURITY DEFINER que lê
-- o segredo do Vault e dispara via pg_net. O navegador só conhece o NOME da função.

create or replace function public.trigger_content_collector(coletor text)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  nome_funcao text;
  fontes text[];
  novo_request bigint;
begin
  -- Instagram não passa por aqui: collect-instagram não exige o collector secret,
  -- então o botão dele já funciona chamando a function direto.
  case coletor
    when 'linkedin' then nome_funcao := 'collect-linkedin'; fontes := array['apify_linkedin'];
    when 'youtube'  then nome_funcao := 'collect-youtube';  fontes := array['apify_youtube', 'public_youtube'];
    else raise exception 'Coletor inválido: %', coletor;
  end case;

  -- Trava de concorrência: um run já em andamento (o coletor leva ~25s, e o
  -- orçamento de parede é de 150s) não pode ser duplicado por clique repetido.
  if exists (
    select 1 from public.collection_runs
    where source = any (fontes)
      and status = 'running'
      and started_at > now() - interval '30 minutes'
  ) then
    raise exception 'Já existe uma coleta em andamento para %', coletor;
  end if;

  -- Cada disparo custa um run de Apify, no mesmo orçamento que o enriquecimento
  -- de prospecção consome. Um minuto de intervalo evita queimar crédito no clique nervoso.
  if exists (
    select 1 from public.collection_runs
    where source = any (fontes)
      and started_at > now() - interval '1 minute'
  ) then
    raise exception 'Aguarde um minuto entre coletas';
  end if;

  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || nome_funcao,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    body := jsonb_build_object('manual', true, 'source', 'hub_manual'),
    timeout_milliseconds := 150000
  ) into novo_request;

  return novo_request;
end;
$$;

-- pg_net é assíncrono: o disparo devolve o id da requisição e o front pergunta
-- pelo resultado depois (mesmo contrato de tally_sync_result).
create or replace function public.content_collector_result(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $$
declare resposta jsonb;
begin
  select case when r.error_msg is not null then jsonb_build_object('success', false, 'error', r.error_msg)
              else r.content::jsonb end
    into resposta from net._http_response r where r.id = p_request_id;
  return resposta;
end;
$$;

revoke all on function public.trigger_content_collector(text) from public;
revoke all on function public.content_collector_result(bigint) from public;
grant execute on function public.trigger_content_collector(text) to anon, authenticated, service_role;
grant execute on function public.content_collector_result(bigint) to anon, authenticated, service_role;
