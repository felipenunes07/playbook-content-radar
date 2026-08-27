-- Vários ICPs, escolhidos na hora de prospectar (pedido do Felipe em 27/08/2026).
--
-- Antes: um ICP só, na linha única de prospect_settings, valendo pra todo lead que
-- entrasse no banco. O post comercial e o post do Second Brain atraem gente
-- diferente, mas o veredito saía do mesmo texto de critérios — e a regra dura em
-- SQL (liderança + área comercial + 200+) sobrescrevia o modelo em TODOS os leads,
-- inclusive nos de um público que nunca teve esse corte.
--
-- Agora: cada ICP é uma linha em icp_profiles (critérios + mensagem + a própria
-- configuração da regra dura), o botão Prospectar pergunta qual usar, e o veredito
-- vive em lead_qualifications (lead_id, icp_id) — a mesma pessoa pode ser rejeitada
-- no ICP comercial e aprovada no do Second Brain. Isso importa porque o público
-- repete comentário entre posts: sem separar por ICP, quem já estava no banco
-- nunca seria avaliado pelo ICP novo.
--
-- As colunas de veredito em `leads` continuam existindo como ESPELHO da última
-- qualificação (v_lead_phones, tally-sync, export e as contagens dos jobs leem de
-- lá). Quem quer o veredito de um ICP específico lê lead_qualifications.

create extension if not exists pgcrypto;

-- 1) Os ICPs.
create table if not exists public.icp_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Texto literal dos critérios que vai no prompt do agente de qualificação.
  icp_rules text,
  -- Mensagem de 1º contato deste ICP; null cai no template global/LLM.
  message_template text,
  is_default boolean not null default false,
  active boolean not null default true,
  -- Regra dura por ICP: o corte objetivo que não depende de sorte no prompt.
  -- Desligada por padrão — um ICP novo começa só com o texto de critérios, que é
  -- o que o Felipe escreve; ligar é decisão explícita de quem cria o ICP.
  hard_rules_enabled boolean not null default false,
  min_company_size integer check (min_company_size is null or min_company_size >= 0),
  approved_areas text[] not null default '{}',
  blocked_areas text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um default só. É o pré-selecionado no diálogo do botão Prospectar e o dono do
-- veredito dos leads antigos.
create unique index if not exists icp_profiles_single_default_idx
  on public.icp_profiles (is_default) where is_default;

comment on table public.icp_profiles is 'Perfis de ICP escolhíveis na prospecção: critérios do prompt, mensagem e configuração da regra dura';
comment on column public.icp_profiles.hard_rules_enabled is 'Quando true, icp_hard_verdict sobrescreve o LLM usando min_company_size/approved_areas/blocked_areas deste ICP';
comment on column public.icp_profiles.approved_areas is 'Áreas que a regra dura aprova junto com liderança + porte (valores do enum de area do agente)';
comment on column public.icp_profiles.blocked_areas is 'Áreas que a regra dura rejeita direto';

drop trigger if exists icp_profiles_updated_at on public.icp_profiles;
create trigger icp_profiles_updated_at before update on public.icp_profiles
for each row execute function public.set_content_updated_at();

-- Seed: o ICP que já estava rodando vira o default, preservando o texto que o
-- Felipe editou na UI (vem de prospect_settings, não de um literal desatualizado)
-- e a configuração da regra dura que estava cravada no código da migration de 17/08.
insert into public.icp_profiles (
  name, icp_rules, message_template, is_default, hard_rules_enabled,
  min_company_size, approved_areas, blocked_areas
)
select
  'Playbook Lab — comercial 200+',
  s.icp_rules,
  s.message_template,
  true,
  true,
  200,
  array['vendas', 'marketing', 'operacoes', 'growth', 'tecnologia'],
  array['financeiro', 'rh', 'juridico']
from public.prospect_settings s
where s.id
on conflict (name) do nothing;

-- Banco sem prospect_settings (ambiente novo): o default existe de qualquer forma,
-- com icp_rules null — o enrich-leads cai no default de código, como sempre fez.
insert into public.icp_profiles (
  name, is_default, hard_rules_enabled, min_company_size, approved_areas, blocked_areas
)
select
  'Playbook Lab — comercial 200+', true, true, 200,
  array['vendas', 'marketing', 'operacoes', 'growth', 'tecnologia'],
  array['financeiro', 'rh', 'juridico']
where not exists (select 1 from public.icp_profiles);

-- 2) Veredito por (lead, ICP). É aqui que "aprovado" passa a depender do ICP.
create table if not exists public.lead_qualifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  icp_id uuid not null references public.icp_profiles(id) on delete cascade,
  -- 'review' é herança: o terceiro status foi extinto em 05/07 (limítrofe virou
  -- aprovado), mas linhas antigas de leads ainda carregam ele e a tela conta review
  -- como aprovado. Aceitar aqui é o que evita o backfill jogar essas linhas de volta
  -- na fila do LLM só por não ter onde guardar o valor.
  status text not null default 'pending'
    check (status in ('pending', 'qualified', 'disqualified', 'review')),
  score integer check (score is null or (score >= 0 and score <= 100)),
  reason text,
  suggested_angle text,
  -- De onde saiu o veredito, pra não confundir julgamento do modelo com if.
  decided_by text check (decided_by is null or decided_by in ('llm', 'hard_rule', 'prefilter', 'enrichment_error')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, icp_id)
);

create index if not exists lead_qualifications_pending_idx
  on public.lead_qualifications (icp_id) where status = 'pending';
create index if not exists lead_qualifications_icp_status_idx
  on public.lead_qualifications (icp_id, status);
create index if not exists lead_qualifications_lead_idx
  on public.lead_qualifications (lead_id);

comment on table public.lead_qualifications is 'Veredito do lead em CADA ICP. A mesma pessoa pode ser aprovada num ICP e rejeitada em outro';

drop trigger if exists lead_qualifications_updated_at on public.lead_qualifications;
create trigger lead_qualifications_updated_at before update on public.lead_qualifications
for each row execute function public.set_content_updated_at();

-- 3) Espelho em leads: qual ICP produziu o veredito que está nas colunas antigas.
alter table public.leads
  add column if not exists qualification_icp_id uuid references public.icp_profiles(id) on delete set null;

comment on column public.leads.qualification_status is 'ESPELHO do veredito da última qualificação (ICP em qualification_icp_id). A verdade por ICP está em lead_qualifications';
comment on column public.leads.qualification_icp_id is 'ICP dono do veredito espelhado nas colunas qualification_status/score/qualification_reason';

-- 4) Qual ICP cada prospecção usou.
alter table public.prospecting_jobs
  add column if not exists icp_id uuid references public.icp_profiles(id) on delete set null;

comment on column public.prospecting_jobs.icp_id is 'ICP escolhido no diálogo do botão Prospectar; os leads deste job são qualificados por ele';

-- 5) Backfill: o histórico inteiro passa a pertencer ao ICP default, com o veredito
-- que já tinha. Sem isso, milhares de leads voltariam pra fila do LLM à toa —
-- e a Apify/LLM é justamente o recurso escasso aqui.
insert into public.lead_qualifications (lead_id, icp_id, status, score, reason, suggested_angle, decided_by, decided_at)
select
  l.id,
  d.id,
  case when l.qualification_status = 'pending' then 'pending' else l.qualification_status end,
  l.score,
  l.qualification_reason,
  l.suggested_angle,
  case when l.qualification_status = 'pending' then null else 'llm' end,
  case when l.qualification_status = 'pending' then null else l.updated_at end
from public.leads l
cross join (select id from public.icp_profiles where is_default limit 1) d
on conflict (lead_id, icp_id) do nothing;

update public.leads l
set qualification_icp_id = d.id
from (select id from public.icp_profiles where is_default limit 1) d
where l.qualification_icp_id is null;

update public.prospecting_jobs j
set icp_id = d.id
from (select id from public.icp_profiles where is_default limit 1) d
where j.icp_id is null;

-- 6) Regra dura parametrizada pelo ICP. O corpo é o mesmo de 17/08 (os regexes de
-- cargo seguem valendo pra qualquer ICP: "estagiário" é estagiário em todo lugar);
-- o que era literal — 200, a lista de áreas — vira argumento.
--
-- A versão de 5 argumentos precisa CAIR antes: com defaults na nova, uma chamada de
-- 5 argumentos casaria com as duas e o Postgres erra por ambiguidade.
drop function if exists public.icp_hard_verdict(text, text, text, integer, text);

create or replace function public.icp_hard_verdict(
  p_job_title text,
  p_headline text,
  p_area text,
  p_company_size integer,
  p_company_name text default null,
  p_min_company_size integer default 200,
  p_approved_areas text[] default array['vendas', 'marketing', 'operacoes', 'growth', 'tecnologia'],
  p_blocked_areas text[] default array['financeiro', 'rh', 'juridico']
) returns text
language plpgsql
immutable
as $$
declare
  titulo text := lower(coalesce(nullif(p_job_title, ''), p_headline, ''));
  empresa text := lower(coalesce(p_company_name, ''));
  porte integer := p_company_size;
  tem_lideranca boolean;
  tem_barrado boolean;
  tem_ambiguo boolean;
begin
  if titulo = '' then return null; end if;

  -- "Self-Employed" é uma página do LinkedIn com mais de um milhão de "colaboradores".
  -- Sem esta guarda a regra dura aprovaria autônomo como multinacional.
  if empresa ~ '(self.?employed|aut[ôo]nom|freelanc|home.?office|^pj$|^pj[^[:alnum:]]|profissional liberal)' then
    porte := null;
  end if;

  -- Acrônimos exigem borda nos DOIS lados. Sem a borda à direita, "coo" casava com o
  -- começo de "Coordenador" e a regra aprovou quatro coordenadores como se fossem
  -- C-level. Mesmo motivo para não usar "owner" solto: casava com "Product Owner".
  -- E "s[óo]ci[oa]" sem borda casaria com "sociologia".
  tem_lideranca :=
       titulo ~ '(^|[^[:alnum:]])(ceo|cto|cfo|coo|cmo|cro|cso|vp)([^[:alnum:]]|$)'
    or titulo ~ '(^|[^[:alnum:]])(founder|co-?founder|fundador|cofundador|chief|presidente|vice-presidente|diretor|director|gerente|superintendente|propriet[áa]ri)'
    or titulo ~ '(^|[^[:alnum:]])(s[óo]ci[oa]|head)([^[:alnum:]]|$)'
    -- "manager" é liderança em título comercial, mas não em Account/Product/Project
    -- Manager — esses são individual contributor, mesma família do Account Executive.
    or (titulo ~ '(^|[^[:alnum:]])manager([^[:alnum:]]|$)'
        and titulo !~ '(account|product|project|community|social media|office|program) manager');

  tem_barrado := titulo ~ '(^|[^[:alnum:]])(estagi[áa]ri|estudante|trainee|aprendiz|assistente|auxiliar|analista|sdr|bdr|sales development|business development representative|pr[ée]-vend|pre-vend|inside sales|closer|social seller|recepcion)';

  -- Coordenação/supervisão/liderança de time é a faixa cinza: não é cargo alto pela
  -- regra do Victor, mas também não é operacional puro. "Coordenador de Vendas e SDR"
  -- não pode ser rejeitado só por conter SDR no título — quem decide é o modelo.
  tem_ambiguo := titulo ~ '(^|[^[:alnum:]])(coordenador|coordenadora|supervisor|supervisora|l[íi]der|lead)([^[:alnum:]]|$)';
  if tem_ambiguo and not tem_lideranca then
    return null;
  end if;

  -- Cargo operacional SEM nenhum marcador de liderança no título: rejeita.
  if tem_barrado and not tem_lideranca then
    return 'disqualified';
  end if;

  -- REGRA DURA: liderança + área aprovada pelo ICP + porte mínimo do ICP é
  -- aprovado. Sem exceção, sem "não parece ter poder de compra".
  -- 'outro' e 'desconhecido' ficam fora de propósito: aí a área não foi determinada.
  if tem_lideranca
     and p_area = any(coalesce(p_approved_areas, '{}'::text[]))
     and coalesce(porte, 0) >= coalesce(p_min_company_size, 0)
  then
    return 'qualified';
  end if;

  if p_area = any(coalesce(p_blocked_areas, '{}'::text[])) then
    return 'disqualified';
  end if;

  return null; -- caso difuso: quem decide é o LLM
end $$;

comment on function public.icp_hard_verdict is 'Veredito determinístico do ICP a partir de cargo, área e porte, com corte/áreas do ICP escolhido. NULL = caso difuso, decide o LLM.';

-- 7) Corretor por ICP: só toca qualificação cujo ICP tem a regra dura LIGADA, e usa
-- o corte daquele ICP. Um ICP com hard_rules_enabled = false fica inteiramente na
-- mão do modelo, que é o combinado pra públicos fora do corte comercial.
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
    returning q.lead_id, q.icp_id, q.status, q.score, q.reason
  ), espelhado as (
    -- O espelho em leads só muda se a linha corrigida for do ICP que ele espelha:
    -- sobrescrever o espelho com o veredito de outro ICP faria v_lead_phones e o
    -- tally-sync mentirem.
    update public.leads l
    set qualification_status = c.status,
        score = c.score,
        qualification_reason = c.reason
    from corrigido c
    where l.id = c.lead_id and l.qualification_icp_id = c.icp_id
    returning l.id
  )
  select count(*) filter (where status = 'qualified')::integer,
         count(*) filter (where status = 'disqualified')::integer
    into v_aprovados, v_rejeitados
  from corrigido;

  return query select coalesce(v_aprovados, 0), coalesce(v_rejeitados, 0);
end $$;

comment on function public.apply_icp_hard_rules is 'Sobrescreve vereditos que contradizem a regra dura do ICP de cada qualificação (só ICPs com hard_rules_enabled). Idempotente; aceita post_id para escopo.';

-- 8) Leitura pra UI: veredito por ICP já com o nome do ICP, pra tela não precisar
-- cruzar duas tabelas na mão.
create or replace view public.v_lead_qualifications with (security_invoker = true) as
select q.lead_id, q.icp_id, p.name as icp_name, p.is_default as icp_is_default,
       q.status, q.score, q.reason, q.suggested_angle, q.decided_by, q.decided_at
from public.lead_qualifications q
join public.icp_profiles p on p.id = q.icp_id;

-- 9) RLS no padrão das outras tabelas de prospecção: front lê, escrita só pelo
-- service role das Edge Functions.
do $$
declare table_name text;
begin
  foreach table_name in array array['icp_profiles', 'lead_qualifications'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "prospecting read" on public.%I', table_name);
    execute format('create policy "prospecting read" on public.%I for select to anon, authenticated using (true)', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to anon, authenticated', table_name);
  end loop;
end
$$;

grant select on public.v_lead_qualifications to anon, authenticated;

-- Verificação:
-- select name, is_default, hard_rules_enabled, min_company_size from public.icp_profiles;
-- select icp_name, status, count(*) from public.v_lead_qualifications group by 1, 2 order by 1, 2;
-- select * from public.apply_icp_hard_rules();
