create or replace view public.v_account_growth with (security_invoker = true) as
select
  a.id as account_id, a.owner_name, a.platform, a.account_name, a.account_url,
  m.metric_date, m.followers, m.subscribers, m.total_views, m.total_posts, m.total_videos,
  m.followers - lag(m.followers) over (partition by a.id order by m.metric_date) as followers_delta,
  m.subscribers - lag(m.subscribers) over (partition by a.id order by m.metric_date) as subscribers_delta,
  m.total_views - lag(m.total_views) over (partition by a.id order by m.metric_date) as total_views_delta
from public.account_daily_metrics m
join public.content_accounts a on a.id = m.account_id
where m.source not in ('historical_json', 'historical_import');
