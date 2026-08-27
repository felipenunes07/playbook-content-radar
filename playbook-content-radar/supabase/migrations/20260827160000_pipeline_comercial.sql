-- Pipeline comercial: Kanban de acompanhamento + base do Funil (pedido do Felipe,
-- 27/08/2026). Ver docs/superpowers/plans/2026-08-27-kanban-e-funil-comercial.md
--
-- A correção que organiza tudo: marcar "Prospectado" na aba Leads ICP significa que
-- o lead foi SELECIONADO para a operação comercial — NÃO que o 1º contato saiu. O
-- card nasce em 'a_prospectar' devendo o primeiro contato, e marcar o checkbox não
-- cria touchpoint nenhum. A distância entre "Prospectados" e "Contatados" é
-- justamente o vazamento que hoje ninguém enxerga.
--
-- Três tabelas com papéis distintos, e a separação é o ponto do desenho:
--   lead_touchpoints  → cada contato REAL. Daqui sai a frequência e o marco "contatado".
--   lead_stage_events → cada movimentação de etapa. APPEND-ONLY. Daqui sai a conversão.
--   lead_pipeline     → o estado atual do card. Cache navegável dos dois acima.
-- Mais pipeline_settings, que guarda a cadência (nada de 3 toques hardcoded).
--
-- Idempotente: pode rodar de novo sem efeito colateral. O rollback está no fim do
-- arquivo, em bloco comentado.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Estado atual do card. 1 linha por lead.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lead_pipeline (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  stage text not null default 'a_prospectar' check (stage in (
    'a_prospectar', 'em_cadencia', 'respondeu', 'reuniao',
    'proposta', 'cliente', 'perdido'
  )),
  -- ICP de ORIGEM do card (por qual público a pessoa entrou). O veredito por ICP
  -- continua em lead_qualifications; aqui é só atribuição do funil.
  icp_id uuid references public.icp_profiles(id) on delete set null,
  owner text,
  -- Nullable de propósito: campanha ainda não é derivável (content_production_items
  -- .campaign é texto livre sem FK pro post publicado). Atribuição confiável é
  -- first_seen_post_id. Preencher na mão é opcional; NÃO fazer match por URL.
  campaign text,
  next_action_at date,
  -- Observações do LEAD, não de um evento: o que não pertence a nenhum contato
  -- específico ("empresa em fusão", "só depois do Q4"). Sem isso essa informação
  -- ficava presa na nota de um toque, onde ninguém acha depois.
  notes text,
  lost_reason text,
  -- Arquivar tira o card da operação ativa SEM destruir histórico. Diferente de
  -- 'perdido', que foi trabalhado e não fechou (e conta como perda no funil).
  archived_at timestamptz,
  archive_reason text,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_pipeline_board_idx
  on public.lead_pipeline (stage, next_action_at) where archived_at is null;
create index if not exists lead_pipeline_owner_idx
  on public.lead_pipeline (owner) where archived_at is null;
create index if not exists lead_pipeline_icp_idx on public.lead_pipeline (icp_id);

comment on table public.lead_pipeline is 'Estado atual do card no Kanban comercial. A verdade histórica está em lead_touchpoints e lead_stage_events';
comment on column public.lead_pipeline.entered_at is 'Quando o lead foi SELECIONADO para a operação (checkbox Prospectado) — não quando foi contatado';
comment on column public.lead_pipeline.archived_at is 'Saiu da operação ativa preservando histórico. Não conta no funil (diferente de stage = perdido)';
comment on column public.lead_pipeline.campaign is 'Nullable até existir atribuição confiável de campanha; usar first_seen_post_id como origem';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Cada contato real, um registro. É a evidência de todo marco de contato.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lead_touchpoints (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  channel text not null default 'linkedin'
    check (channel in ('linkedin', 'whatsapp', 'email', 'call')),
  -- 1, 2, 3… entre os 'out'. Null nos 'in' (resposta não tem número de cadência).
  touch_number integer check (touch_number is null or touch_number > 0),
  touched_at timestamptz not null default now(),
  note text,
  created_by text,
  -- Toque registrado por engano é ANULADO, não apagado: some das contagens e do
  -- funil, mas a linha fica pra auditoria. Apagar destruiria histórico comercial,
  -- que é justamente o que não se faz aqui.
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  created_at timestamptz not null default now()
);

-- Todo cálculo do board e do funil olha só os toques ativos, daí o índice parcial.
create index if not exists lead_touchpoints_lead_idx
  on public.lead_touchpoints (lead_id, touched_at desc) where cancelled_at is null;
create index if not exists lead_touchpoints_direction_idx
  on public.lead_touchpoints (direction, touched_at) where cancelled_at is null;

comment on table public.lead_touchpoints is 'Cada ponto de contato real. O marco "contatado" do funil é derivado daqui (1º out ativo), nunca de movimentação manual de etapa';
comment on column public.lead_touchpoints.cancelled_at is 'Toque anulado (registrado por engano). Sai de toda contagem/marco, mas a linha permanece para auditoria';
comment on column public.lead_touchpoints.touch_number is 'Posição na cadência entre os toques ATIVOS. É renumerado quando um toque anterior é anulado';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Auditoria de etapa. APPEND-ONLY: nem update nem delete.
-- ─────────────────────────────────────────────────────────────────────────────
-- 'arquivado'/'reativado' não são etapas do board — são eventos de auditoria que
-- precisam de data/hora igual às etapas. Ficam no mesmo CHECK pra não abrir a porta
-- pra typo virar evento fantasma, e as views filtram pelos 7 nomes reais, então
-- eles não contaminam marco nenhum do funil.
create table if not exists public.lead_stage_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_stage text check (from_stage is null or from_stage in (
    'a_prospectar', 'em_cadencia', 'respondeu', 'reuniao',
    'proposta', 'cliente', 'perdido'
  )),                         -- null na entrada no board
  to_stage text not null check (to_stage in (
    'a_prospectar', 'em_cadencia', 'respondeu', 'reuniao',
    'proposta', 'cliente', 'perdido', 'arquivado', 'reativado'
  )),
  occurred_at timestamptz not null default now(),
  actor text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lead_stage_events_lead_idx
  on public.lead_stage_events (lead_id, occurred_at);
create index if not exists lead_stage_events_stage_idx
  on public.lead_stage_events (to_stage, occurred_at);

comment on table public.lead_stage_events is 'APPEND-ONLY. Guarda TODAS as movimentações, inclusive reentradas na mesma etapa. As views resumem com first/latest; o histórico nunca é destruído';

-- Append-only de verdade, não por convenção: um UPDATE/DELETE aqui aborta.
-- search_path vazio pelo mesmo motivo da migration 20260814222256 — a função não
-- referencia objeto de schema nenhum, só levanta exceção.
--
-- CONSEQUÊNCIA CONHECIDA: `leads` tem `on delete cascade` pra cá, então apagar um
-- lead que já tem histórico passa a falhar com este erro em vez de cascatear.
-- É deliberado (o combinado é que histórico comercial não se destrói), e hoje nada
-- no app apaga lead. Quem realmente precisar remover uma pessoa (LGPD, por exemplo)
-- desarma o trigger no escopo da transação:
--   begin;
--     alter table public.lead_stage_events disable trigger lead_stage_events_no_mutation;
--     delete from public.leads where id = '...';
--     alter table public.lead_stage_events enable trigger lead_stage_events_no_mutation;
--   commit;
create or replace function public.lead_stage_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'lead_stage_events é append-only: % não é permitido (histórico comercial não se destrói). Para apagar um lead, desarme o trigger lead_stage_events_no_mutation dentro da transação.',
    tg_op;
end;
$$;
alter function public.lead_stage_events_append_only() set search_path = '';

drop trigger if exists lead_stage_events_no_mutation on public.lead_stage_events;
create trigger lead_stage_events_no_mutation
before update or delete on public.lead_stage_events
for each row execute function public.lead_stage_events_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Cadência configurável. Linha única, padrão do prospect_settings.
-- ─────────────────────────────────────────────────────────────────────────────
-- intervalo_dias conta a partir do TOQUE ANTERIOR, não da entrada: se o 1º contato
-- atrasa 3 dias, o 2º não dispara junto. O default dá 3 toques em ~14 dias, com
-- sugestão de descarte aos 21 — combinado com o Felipe, e trocável sem deploy.
create table if not exists public.pipeline_settings (
  id boolean primary key default true check (id),
  cadence jsonb not null default '{
    "steps": [
      { "n": 1, "intervalo_dias": 0,  "label": "1º contato" },
      { "n": 2, "intervalo_dias": 5,  "label": "2º contato" },
      { "n": 3, "intervalo_dias": 9,  "label": "3º contato" }
    ],
    "sem_resposta_atencao_dias": 3,
    "sem_resposta_alerta_dias": 7,
    "sugerir_descarte_apos_dias": 21
  }'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.pipeline_settings (id) values (true) on conflict (id) do nothing;

comment on table public.pipeline_settings is 'Cadência do Kanban (linha única). Para variar por público, adicionar cadence jsonb nullable em icp_profiles que sobrescreva esta';

-- Triggers de updated_at (reaproveitam a função que já existe no schema).
drop trigger if exists lead_pipeline_updated_at on public.lead_pipeline;
create trigger lead_pipeline_updated_at before update on public.lead_pipeline
for each row execute function public.set_content_updated_at();

drop trigger if exists pipeline_settings_updated_at on public.pipeline_settings;
create trigger pipeline_settings_updated_at before update on public.pipeline_settings
for each row execute function public.set_content_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) View do board: tudo que o card mostra, já calculado.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_lead_pipeline with (security_invoker = true) as
select
  p.lead_id, p.stage, p.icp_id, p.owner, p.campaign, p.next_action_at, p.notes,
  p.lost_reason, p.archived_at, p.archive_reason, p.entered_at, p.updated_at,
  l.full_name, l.company_name, l.company_size, l.job_title, l.score,
  l.first_seen_post_id,
  coalesce(t.toques, 0)                                        as toques,
  t.ultimo_toque,
  t.primeiro_toque,
  coalesce(t.respondeu, false)                                 as respondeu,
  t.primeira_resposta_em,
  -- Silêncio do lead: só faz sentido depois do 1º toque e antes da resposta.
  case
    when coalesce(t.respondeu, false) then null
    when t.ultimo_toque is null then null
    else (current_date - t.ultimo_toque::date)
  end                                                          as dias_sem_resposta,
  -- Atraso nosso: quantos dias o próximo contato já venceu.
  case
    when p.next_action_at is null then null
    else (current_date - p.next_action_at)
  end                                                          as dias_followup_atrasado,
  -- A fila operacional "Precisa de contato hoje" é este booleano.
  (
    p.archived_at is null
    and p.stage in ('a_prospectar', 'em_cadencia')
    and not coalesce(t.respondeu, false)
    and (p.next_action_at is null or p.next_action_at <= current_date)
  )                                                            as precisa_contato_hoje
from public.lead_pipeline p
join public.leads l on l.id = p.lead_id
left join lateral (
  select
    count(*) filter (where direction = 'out')                  as toques,
    max(touched_at) filter (where direction = 'out')           as ultimo_toque,
    min(touched_at) filter (where direction = 'out')           as primeiro_toque,
    bool_or(direction = 'in')                                  as respondeu,
    min(touched_at) filter (where direction = 'in')            as primeira_resposta_em
  -- Toque anulado não conta em lugar nenhum: nem na contagem, nem no silêncio.
  from public.lead_touchpoints t2
  where t2.lead_id = p.lead_id and t2.cancelled_at is null
) t on true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) View do funil: 1 linha por lead, os 8 marcos datados em colunas.
-- ─────────────────────────────────────────────────────────────────────────────
-- LEITURA PRIMÁRIA (MVP) = COORTE: agrupa por entrou_em e pergunta "desta safra,
-- quantos chegaram a cada etapa". Por isso os marcos são min(), não o evento mais
-- recente: card que volta de Reunião pra Em cadência e avança de novo não perde o
-- marco — conversão mede "chegou alguma vez".
-- A leitura por ATIVIDADE ("o que aconteceu no período") sai de v_pipeline_activity,
-- logo abaixo, sem tocar nesta.
create or replace view public.v_lead_funnel with (security_invoker = true) as
select
  l.id                                        as lead_id,
  l.first_seen_post_id,
  p.icp_id, p.owner, p.campaign, p.stage, p.archived_at,
  l.created_at                                as entrou_em,
  q.aprovado_em,
  p.entered_at                                as prospectado_em,
  -- Derivado do 1º touchpoint outbound. NUNCA de movimentação manual de etapa.
  t.contatado_em,
  -- SÓ do touchpoint inbound ativo. Sem coalesce com o evento de etapa, e a razão
  -- é a anulação: lead_stage_events é append-only, então um evento 'respondeu'
  -- nunca some. Se o marco caísse nele, anular a resposta registrada por engano
  -- deixaria o funil contando uma resposta retratada — para sempre.
  -- Consequência assumida: linha legada com o status extinto 'replied' aparece em
  -- stage = 'respondeu' no board, mas não entrega respondeu_em ao funil. É honesto:
  -- não sabemos quando (nem se) essa pessoa respondeu, e inventar a data seria pior
  -- que admitir o buraco. Daqui pra frente marcar "Respondeu" na mão grava o
  -- touchpoint inbound junto, então todo marco novo tem evidência.
  t.respondeu_em,
  s.reuniao_em, s.proposta_em, s.cliente_em, s.perdido_em
from public.leads l
left join public.lead_pipeline p on p.lead_id = l.id
left join lateral (
  select min(decided_at) as aprovado_em
  from public.lead_qualifications q2
  -- 'review' conta como aprovado: é o que a aba Leads ICP já faz hoje (o terceiro
  -- status foi extinto em 05/07). Contar diferente aqui faria os dois números
  -- brigarem na reunião.
  where q2.lead_id = l.id and q2.status in ('qualified', 'review')
) q on true
left join lateral (
  select
    min(touched_at) filter (where direction = 'out') as contatado_em,
    min(touched_at) filter (where direction = 'in')  as respondeu_em
  -- Idem: um 1º contato anulado devolve contatado_em a null, e o funil volta a
  -- dizer a verdade (selecionado e nunca tocado) em vez de herdar o engano.
  from public.lead_touchpoints t2
  where t2.lead_id = l.id and t2.cancelled_at is null
) t on true
left join lateral (
  select
    min(occurred_at) filter (where to_stage = 'reuniao')   as reuniao_em,
    min(occurred_at) filter (where to_stage = 'proposta')  as proposta_em,
    min(occurred_at) filter (where to_stage = 'cliente')   as cliente_em,
    min(occurred_at) filter (where to_stage = 'perdido')   as perdido_em
  from public.lead_stage_events e where e.lead_id = l.id
) s on true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) View de atividade: os dois streams de evento normalizados num só.
-- ─────────────────────────────────────────────────────────────────────────────
-- É a base da segunda leitura do funil ("o que aconteceu ENTRE 01/09 e 30/09",
-- independente de quando o lead entrou). Não é usada no MVP; existe pra que a
-- leitura por atividade seja um group by, e não uma migration nova.
-- Preserva TODAS as reentradas: aqui não há min(), cada evento é uma linha.
create or replace view public.v_pipeline_activity with (security_invoker = true) as
select
  e.lead_id,
  'stage:' || e.to_stage                      as event_type,
  e.occurred_at,
  e.actor,
  p.icp_id, p.owner, p.campaign, l.first_seen_post_id
from public.lead_stage_events e
join public.leads l on l.id = e.lead_id
left join public.lead_pipeline p on p.lead_id = e.lead_id
union all
select
  t.lead_id,
  case when t.direction = 'out' then 'touch:out' else 'touch:in' end,
  t.touched_at,
  t.created_by,
  p.icp_id, p.owner, p.campaign, l.first_seen_post_id
from public.lead_touchpoints t
join public.leads l on l.id = t.lead_id
left join public.lead_pipeline p on p.lead_id = t.lead_id
-- Toque anulado não é atividade: ele não aconteceu. A linha continua na tabela
-- pra auditoria, mas fora de qualquer leitura por período.
where t.cancelled_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RLS: leitura pro dashboard, escrita só via service role (edge function).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['lead_pipeline', 'lead_touchpoints', 'lead_stage_events', 'pipeline_settings'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "pipeline read" on public.%I', tbl);
    execute format('create policy "pipeline read" on public.%I for select to anon, authenticated using (true)', tbl);
    execute format('revoke all on table public.%I from anon, authenticated', tbl);
    execute format('grant select on table public.%I to anon, authenticated', tbl);
  end loop;
end $$;

grant select on public.v_lead_pipeline to anon, authenticated;
grant select on public.v_lead_funnel to anon, authenticated;
grant select on public.v_pipeline_activity to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Backfill: quem já está marcado como prospectado entra no board.
-- ─────────────────────────────────────────────────────────────────────────────
-- ZERO touchpoints inventados. Não sabemos se essas pessoas foram realmente
-- contatadas, e chutar envenenaria a primeira medição de conversão exatamente na
-- etapa que mais importa (Prospectados → Contatados). Elas entram em
-- 'a_prospectar' com next_action_at na data em que foram selecionadas — ou seja,
-- aparecem como follow-up atrasado no dia 1. Isso é a verdade, não um bug.
insert into public.lead_pipeline (lead_id, stage, icp_id, entered_at, next_action_at)
select
  o.lead_id,
  'a_prospectar',
  l.qualification_icp_id,
  coalesce(o.prospected_at, o.updated_at, o.created_at),
  coalesce(o.prospected_at, o.updated_at, o.created_at)::date
from public.lead_outreach o
join public.leads l on l.id = o.lead_id
where o.status in ('prospected', 'replied')
on conflict (lead_id) do nothing;

-- O evento de entrada correspondente, na mesma data.
insert into public.lead_stage_events (lead_id, from_stage, to_stage, occurred_at, actor, note)
select p.lead_id, null::text, 'a_prospectar', p.entered_at, 'backfill',
       'Backfill 27/08/2026: reconstruído de lead_outreach.prospected_at. Sem touchpoints — não há como saber se houve contato real.'
from public.lead_pipeline p
where not exists (
  select 1 from public.lead_stage_events e where e.lead_id = p.lead_id
);

-- 'replied' é status legado que a UI nunca setou (só existe no CHECK). Se alguma
-- linha tiver, o card vai pra 'respondeu' e o marco fica registrado — mas sem
-- touchpoint inbound, porque a data da resposta não existe em lugar nenhum.
update public.lead_pipeline p
set stage = 'respondeu'
from public.lead_outreach o
where o.lead_id = p.lead_id and o.status = 'replied' and p.stage = 'a_prospectar';

insert into public.lead_stage_events (lead_id, from_stage, to_stage, occurred_at, actor, note)
select p.lead_id, 'a_prospectar', 'respondeu', p.entered_at, 'backfill',
       'Backfill 27/08/2026: lead_outreach.status era o legado "replied". Data da resposta desconhecida — nenhum touchpoint inbound foi inventado.'
from public.lead_pipeline p
where p.stage = 'respondeu'
  and not exists (
    select 1 from public.lead_stage_events e
    where e.lead_id = p.lead_id and e.to_stage = 'respondeu'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (aplicar na ordem, de baixo pra cima do que foi criado):
--
--   drop view if exists public.v_pipeline_activity;
--   drop view if exists public.v_lead_funnel;
--   drop view if exists public.v_lead_pipeline;
--   drop trigger if exists lead_stage_events_no_mutation on public.lead_stage_events;
--   drop function if exists public.lead_stage_events_append_only();
--   drop table if exists public.lead_stage_events;
--   drop table if exists public.lead_touchpoints;
--   drop table if exists public.lead_pipeline;
--   drop table if exists public.pipeline_settings;
--
-- Nenhuma tabela pré-existente é alterada por esta migration, então o rollback é
-- completo: `leads`, `lead_outreach` e `lead_qualifications` saem intactas.
-- ─────────────────────────────────────────────────────────────────────────────
