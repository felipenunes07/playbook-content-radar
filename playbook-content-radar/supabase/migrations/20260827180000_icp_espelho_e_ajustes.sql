-- Ajustes do multi-ICP depois do teste da tela (27/08/2026).
--
-- A migration de hoje mais cedo (20260827120000_icp_multiplos.sql) criou icp_profiles
-- e lead_qualifications, mas deixou o ESPELHO em `leads` como "o último veredito que
-- chegou". Com um ICP só isso nunca doeu. Com dois, quebra a tela inteira de
-- aprovados — que é justamente o que o Felipe pediu para poder ver.
--
-- O caminho do LLM (enrich-leads, persistQualification) sobrescrevia
-- leads.qualification_status a cada veredito, de qualquer ICP, sem guarda. Então um
-- lead aprovado no ICP comercial e depois rejeitado no ICP novo ficava com o espelho
-- 'disqualified' e:
--   - sumia da aba Aprovados quando não há filtro de ICP;
--   - saía do cruzamento com a Base Tally, porque v_lead_phones e o tally-sync
--     filtram por leads.qualification_status = 'qualified';
--   - perdia o telefone já encontrado na tela.
-- Ou seja: rodar o segundo ICP APAGAVA leads bons do primeiro.
--
-- A regra certa é a que o Felipe descreveu em voz alta: "eu pudesse ver todo mundo
-- que está aprovado, e duas colunas pra saber pra qual ICP foi aprovado". Quem é
-- aprovado em QUALQUER ICP é um lead aprovado; a coluna de cada ICP conta em qual.
-- Então o espelho passa a ser o MELHOR veredito entre os ICPs, não o último.
--
-- Fica num TRIGGER e não no código da Edge Function de propósito: são quatro
-- escritores de veredito (o LLM, o pré-filtro, o erro de enriquecimento e a regra
-- dura em SQL) e qualquer um que esquecesse de espelhar reintroduziria o bug.

-- 1) Melhor veredito de um lead entre todos os ICPs, e quem o produziu.
--    Ordem: aprovado > 'review' (legado, a tela conta como aprovado) > aguardando
--    análise > descartado. 'pending' na frente de 'disqualified' porque "ainda não
--    sei" é mais honesto que "não" enquanto algum ICP não terminou de julgar.
--    Empate: o veredito decidido mais recentemente.
create or replace function public.best_lead_qualification(p_lead_id uuid)
returns table (status text, score integer, reason text, suggested_angle text, icp_id uuid)
language sql
stable
as $$
  select q.status, q.score, q.reason, q.suggested_angle, q.icp_id
  from public.lead_qualifications q
  where q.lead_id = p_lead_id
  order by
    case q.status
      when 'qualified' then 1
      when 'review' then 2
      when 'pending' then 3
      when 'disqualified' then 4
      else 5
    end,
    q.decided_at desc nulls last,
    q.updated_at desc
  limit 1
$$;

comment on function public.best_lead_qualification is 'Melhor veredito do lead entre todos os ICPs — aprovado em qualquer ICP vence. Fonte do espelho em leads.';

-- 2) Reescreve o espelho de um lead a partir de lead_qualifications.
create or replace function public.refresh_lead_qualification_mirror(p_lead_id uuid)
returns void
language plpgsql
as $$
declare
  melhor record;
begin
  select * into melhor from public.best_lead_qualification(p_lead_id);

  -- NOT FOUND em vez de `melhor is null`: para um record, IS NULL só é verdadeiro
  -- quando TODOS os campos são nulos, o que confundiria "não há qualificação" com
  -- uma qualificação de campos vazios.
  if not found then
    -- Sem nenhuma qualificação (ICP apagado, por exemplo): volta pra fila em vez de
    -- congelar o veredito de um ICP que não existe mais.
    update public.leads
    set qualification_status = 'pending',
        qualification_reason = null,
        score = null,
        suggested_angle = null,
        qualification_icp_id = null
    where id = p_lead_id;
    return;
  end if;

  update public.leads
  set qualification_status = melhor.status,
      qualification_reason = melhor.reason,
      score = melhor.score,
      suggested_angle = melhor.suggested_angle,
      qualification_icp_id = melhor.icp_id
  where id = p_lead_id;
end $$;

comment on function public.refresh_lead_qualification_mirror is 'Recalcula leads.qualification_status/score/reason/qualification_icp_id a partir do melhor veredito entre os ICPs';

-- 3) O trigger. AFTER, por linha: quem escreve veredito não precisa saber que o
--    espelho existe. Cobre também o DELETE (ICP apagado leva os vereditos junto).
create or replace function public.tg_refresh_lead_qualification_mirror()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_lead_qualification_mirror(coalesce(new.lead_id, old.lead_id));
  return null;
end $$;

drop trigger if exists lead_qualifications_mirror on public.lead_qualifications;
create trigger lead_qualifications_mirror
after insert or update or delete on public.lead_qualifications
for each row execute function public.tg_refresh_lead_qualification_mirror();

-- 4) Recalcula o espelho de quem já tem qualificação, agora pela regra nova. Roda
--    depois do backfill da migration anterior, então corrige de uma vez qualquer
--    lead que já tenha sido atropelado por um segundo ICP.
do $$
declare
  lead_row record;
begin
  for lead_row in select distinct lead_id from public.lead_qualifications loop
    perform public.refresh_lead_qualification_mirror(lead_row.lead_id);
  end loop;
end $$;

-- 5) A regra dura em SQL não precisa mais espelhar na mão — o trigger faz. Manter a
--    escrita manual criaria duas verdades: apply_icp_hard_rules só espelhava quando
--    o ICP corrigido era o dono do espelho, regra que o trigger acabou de substituir.
create or replace function public.apply_icp_hard_rules(p_post_id uuid default null)
returns table (aprovados_corrigidos integer, rejeitados_corrigidos integer)
language plpgsql
as $$
declare
  v_aprovados integer;
  v_rejeitados integer;
begin
  with alvo as (
    select q.id, q.lead_id, q.icp_id, q.status, q.score, q.reason,
           public.icp_hard_verdict(
             l.job_title, l.headline, l.area, l.company_size, l.company_name,
             p.min_company_size, p.approved_areas, p.blocked_areas
           ) as veredito
    from public.lead_qualifications q
    join public.leads l on l.id = q.lead_id
    join public.icp_profiles p on p.id = q.icp_id
    where p.hard_rules_enabled
      and l.enrichment_status = 'enriched'
      and q.status <> 'pending'
      and (p_post_id is null or l.first_seen_post_id = p_post_id)
  ), divergente as (
    select * from alvo
    where veredito is not null and veredito <> status
  ), corrigido as (
    update public.lead_qualifications q
    set status = d.veredito,
        score = case when d.veredito = 'qualified'
                     then greatest(coalesce(d.score, 0), 70)
                     else least(coalesce(d.score, 100), 40) end,
        decided_by = 'hard_rule',
        decided_at = now(),
        reason = case when d.veredito = 'qualified'
          then 'Aprovado pela regra dura deste ICP (liderança + área aprovada + porte mínimo); veredito do modelo foi sobrescrito. Motivo original: ' || coalesce(d.reason, '(sem motivo)')
          else 'Rejeitado pela regra dura deste ICP (cargo operacional ou área barrada); veredito do modelo foi sobrescrito. Motivo original: ' || coalesce(d.reason, '(sem motivo)') end
    from divergente d
    where q.id = d.id
    returning q.lead_id, q.status
  )
  -- Sem update manual em `leads`: o trigger lead_qualifications_mirror já reescreveu
  -- o espelho de cada linha corrigida com o melhor veredito entre os ICPs.
  select count(*) filter (where status = 'qualified')::integer,
         count(*) filter (where status = 'disqualified')::integer
    into v_aprovados, v_rejeitados
  from corrigido;

  return query select coalesce(v_aprovados, 0), coalesce(v_rejeitados, 0);
end $$;

comment on function public.apply_icp_hard_rules is 'Sobrescreve vereditos que contradizem a regra dura do ICP de cada qualificação (só ICPs com hard_rules_enabled). O espelho em leads é atualizado pelo trigger. Idempotente; aceita post_id para escopo.';

-- 6) Prospecção com VÁRIOS ICPs de uma vez. prospecting_jobs.icp_id guarda um só, e
-- o pedido é clicar uma vez em Prospectar e o post ser julgado pelos dois públicos.
-- icp_id continua existindo apontando para o primeiro (é o que nomeia o job na tela);
-- a lista completa fica aqui e é ela que manda na contagem de "novos qualificados".
alter table public.prospecting_jobs
  add column if not exists icp_ids uuid[] not null default '{}';

comment on column public.prospecting_jobs.icp_ids is 'Todos os ICPs que esta prospecção enfileirou. icp_id é o primeiro deles, mantido para leitura antiga';

-- Histórico: um job antigo julgou exatamente um ICP.
update public.prospecting_jobs
set icp_ids = array[icp_id]
where icp_id is not null and cardinality(icp_ids) = 0;

-- 7) Mensagem de 1º contato por ICP. lead_outreach tem unique(lead_id), então com
--    dois ICPs a mensagem do segundo sobrescrevia a do primeiro e não havia como
--    saber para qual público o texto tinha sido escrito. Guardar o ICP não resolve
--    sozinho (a unicidade continua por lead), mas para de mentir sobre a origem do
--    texto e deixa a tela avisar quando a mensagem guardada é de outro ICP.
alter table public.lead_outreach
  add column if not exists message_icp_id uuid references public.icp_profiles(id) on delete set null;

comment on column public.lead_outreach.message_icp_id is 'ICP cuja mensagem de 1º contato gerou generated_message. Null = texto anterior ao multi-ICP';

-- Verificação:
-- select l.qualification_status as espelho, count(*) from public.leads l group by 1;
-- select icp_name, status, count(*) from public.v_lead_qualifications group by 1,2 order by 1,2;
-- -- espelho tem que bater com o melhor veredito de todo lead (esperado: 0 linhas):
-- select l.id, l.qualification_status, b.status
-- from public.leads l
-- join lateral public.best_lead_qualification(l.id) b on true
-- where l.qualification_status is distinct from b.status;
