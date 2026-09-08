-- ─────────────────────────────────────────────────────────────────────────────
-- Links diretos no card do Kanban: LinkedIn, WhatsApp, telefone e e-mail.
-- ─────────────────────────────────────────────────────────────────────────────
-- A v_lead_pipeline só trazia nome/empresa/cargo — o card não tinha como oferecer
-- um clique para abrir o perfil ou chamar a pessoa. Aqui recriamos a view
-- adicionando os campos de contato, SEM mudar nenhuma coluna já existente:
--
--   profile_url, public_identifier → do próprio lead. É o link do LinkedIn.
--   match_status, phone_e164       → do match com a Base Tally. Telefone e WhatsApp
--                                    saem daqui e obedecem à MESMA regra de sempre:
--                                    só MATCHED expõe número (garantido por CHECK no
--                                    banco e de novo na fronteira da UI por phoneToShow).
--   email                          → da submission do Tally que casou com a pessoa.
--
-- Os dois joins novos são LEFT: lead sem match ou sem submission continua aparecendo
-- no board, só sem os links que dependem desses dados.
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
  )                                                            as precisa_contato_hoje,
  -- Campos de contato para os links do card, no fim porque CREATE OR REPLACE VIEW só
  -- aceita colunas novas no final — não dá para intercalar sem dropar a view.
  l.profile_url, l.public_identifier,
  m.match_status, m.phone_e164,
  s.email
from public.lead_pipeline p
join public.leads l on l.id = p.lead_id
left join public.lead_phone_matches m on m.lead_id = p.lead_id
left join public.tally_submissions s on s.submission_id = m.submission_id
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

grant select on public.v_lead_pipeline to anon, authenticated;
