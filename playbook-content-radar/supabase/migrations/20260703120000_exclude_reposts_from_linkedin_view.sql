-- Reposts não são conteúdo próprio: o engagement pertence ao post original
-- (as métricas deles já são zeradas na coleta desde 02/07) e contá-los inflava
-- cadência, "conteúdos últimos 30 dias" e rankings do dashboard.
create or replace view public.v_latest_linkedin_post_metrics as
select distinct on (p.id)
  p.id,
  p.external_post_id,
  a.owner_name,
  a.account_url,
  p.post_url,
  p.published_at,
  p.hook,
  p.content,
  p.format,
  p.theme,
  p.content_pillar,
  p.cta_keyword,
  p.funnel_stage,
  p.commercial_intent,
  p.classification_status,
  p.author_name,
  p.author_identifier,
  p.is_repost,
  p.repost_id,
  p.raw,
  m.metric_date,
  m.likes,
  m.comments,
  m.shares,
  m.views,
  m.engagement_total,
  m.engagement_score,
  m.source
from content_posts p
join content_accounts a on a.id = p.account_id
left join content_post_daily_metrics m on m.post_id = p.id
where not coalesce(p.is_repost, false)
  and p.format is distinct from 'repost'
order by p.id, m.metric_date desc nulls last, m.created_at desc nulls last;
