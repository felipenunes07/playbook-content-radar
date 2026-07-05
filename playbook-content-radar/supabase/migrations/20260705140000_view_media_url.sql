-- A página de Prospecção mostra uma miniatura por post pra identificação rápida
-- (pedido do Felipe em 05/07). A view não expunha media_url/media_type.
-- drop+create (não "or replace"): o Postgres não permite inserir colunas no meio
-- da lista de uma view existente. v_content_overview depende desta, então cai e
-- volta junto. Grants reaplicados no fim.
drop view if exists public.v_content_overview;
drop view if exists public.v_latest_linkedin_post_metrics;
create view public.v_latest_linkedin_post_metrics with (security_invoker = true) as
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
  p.media_url,
  p.media_type,
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

-- Recria a v_content_overview (idêntica à migration 202607010001), que caiu no drop.
create view public.v_content_overview with (security_invoker = true) as
select 'linkedin'::text as platform, owner_name, count(*)::bigint as content_count,
  sum(coalesce(likes, 0))::bigint as likes, sum(coalesce(comments, 0))::bigint as comments,
  sum(coalesce(shares, 0))::bigint as shares, sum(coalesce(engagement_total, 0))::bigint as engagement_total,
  sum(coalesce(engagement_score, 0))::bigint as engagement_score, null::bigint as views
from public.v_latest_linkedin_post_metrics group by owner_name
union all
select 'youtube'::text, owner_name, count(*)::bigint,
  sum(coalesce(likes, 0))::bigint, sum(coalesce(comments, 0))::bigint,
  null::bigint, sum(coalesce(engagement_total, 0))::bigint, null::bigint,
  sum(coalesce(views, 0))::bigint
from public.v_latest_youtube_video_metrics group by owner_name;

grant select on public.v_latest_linkedin_post_metrics, public.v_content_overview to anon, authenticated;
