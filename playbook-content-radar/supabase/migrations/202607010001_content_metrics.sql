create extension if not exists pgcrypto;

create table if not exists public.content_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('linkedin', 'youtube')),
  owner_name text not null,
  account_name text,
  account_url text not null,
  handle text,
  external_id text,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  notes text,
  last_collected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, account_url)
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  platform text not null,
  owner_name text,
  file_name text,
  collected_at timestamptz,
  imported_at timestamptz not null default now(),
  total_items integer not null default 0 check (total_items >= 0),
  imported_items integer not null default 0 check (imported_items >= 0),
  skipped_items integer not null default 0 check (skipped_items >= 0),
  status text not null default 'success' check (status in ('running', 'success', 'partial', 'failed')),
  error_message text,
  notes text,
  raw_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.content_accounts(id) on delete cascade,
  platform text not null default 'linkedin' check (platform = 'linkedin'),
  external_post_id text not null unique,
  entity_id text,
  share_urn text,
  post_url text unique,
  author_name text,
  author_identifier text,
  published_at timestamptz,
  content text not null default '',
  hook text,
  format text check (format in ('text', 'image', 'carousel', 'video', 'repost', 'article', 'unknown')),
  theme text,
  content_pillar text,
  cta_keyword text,
  funnel_stage text check (funnel_stage is null or funnel_stage in ('awareness', 'lead_magnet', 'conversion', 'community', 'hiring', 'authority', 'personal')),
  commercial_intent text check (commercial_intent is null or commercial_intent in ('none', 'low', 'medium', 'high')),
  is_repost boolean not null default false,
  repost_id text,
  media_url text,
  media_type text,
  classification_status text not null default 'pending' check (classification_status in ('pending', 'processing', 'classified', 'manual', 'error')),
  classification_error text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_posts_account_published_idx on public.content_posts (account_id, published_at desc);
create index if not exists content_posts_classification_idx on public.content_posts (classification_status) where classification_status = 'pending';

create table if not exists public.content_post_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.content_posts(id) on delete cascade,
  metric_date date not null default current_date,
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  shares integer not null default 0 check (shares >= 0),
  reactions_total integer not null default 0 check (reactions_total >= 0),
  views integer check (views is null or views >= 0),
  engagement_total integer generated always as (coalesce(likes, 0) + coalesce(comments, 0) + coalesce(shares, 0)) stored,
  engagement_score integer generated always as (coalesce(likes, 0) + coalesce(comments, 0) * 3 + coalesce(shares, 0) * 4) stored,
  source text not null default 'automated' check (source in ('historical_json', 'apify_daily', 'manual', 'automated')),
  metric_type text not null default 'daily_collect' check (metric_type in ('snapshot', 'daily_collect', 'manual_correction')),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (post_id, metric_date, source)
);

create index if not exists content_post_metrics_date_idx on public.content_post_daily_metrics (metric_date desc, post_id);

create table if not exists public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.content_accounts(id) on delete cascade,
  video_id text unique not null,
  video_url text,
  title text,
  description text,
  published_at timestamptz,
  thumbnail_url text,
  duration text,
  theme text,
  content_pillar text,
  classification_status text not null default 'pending' check (classification_status in ('pending', 'processing', 'classified', 'manual', 'error')),
  classification_error text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_videos_account_published_idx on public.youtube_videos (account_id, published_at desc);

create table if not exists public.youtube_video_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.youtube_videos(id) on delete cascade,
  metric_date date not null default current_date,
  views integer not null default 0 check (views >= 0),
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  engagement_total integer generated always as (coalesce(likes, 0) + coalesce(comments, 0)) stored,
  engagement_rate numeric generated always as (
    case when coalesce(views, 0) > 0
      then round(((coalesce(likes, 0) + coalesce(comments, 0))::numeric / views::numeric) * 100, 2)
      else null end
  ) stored,
  source text not null default 'youtube_data_api',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (video_id, metric_date, source)
);

create table if not exists public.account_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.content_accounts(id) on delete cascade,
  metric_date date not null default current_date,
  followers integer check (followers is null or followers >= 0),
  connections text,
  subscribers integer check (subscribers is null or subscribers >= 0),
  total_views bigint check (total_views is null or total_views >= 0),
  total_posts integer check (total_posts is null or total_posts >= 0),
  total_videos integer check (total_videos is null or total_videos >= 0),
  source text not null default 'automated',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, metric_date, source)
);

create table if not exists public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  accounts_processed integer not null default 0 check (accounts_processed >= 0),
  items_processed integer not null default 0 check (items_processed >= 0),
  error_message text,
  raw jsonb not null default '{}'::jsonb
);

create or replace function public.set_content_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_accounts_updated_at on public.content_accounts;
create trigger content_accounts_updated_at before update on public.content_accounts
for each row execute function public.set_content_updated_at();
drop trigger if exists content_posts_updated_at on public.content_posts;
create trigger content_posts_updated_at before update on public.content_posts
for each row execute function public.set_content_updated_at();
drop trigger if exists youtube_videos_updated_at on public.youtube_videos;
create trigger youtube_videos_updated_at before update on public.youtube_videos
for each row execute function public.set_content_updated_at();

insert into public.content_accounts (platform, owner_name, account_name, account_url, handle, notes)
values
  ('youtube', 'Victor Baggio', 'Victor Baggio AI', 'https://www.youtube.com/@VictorBaggio-AI', '@VictorBaggio-AI', 'Canal público do YouTube'),
  ('youtube', 'Fernando Tedesco', 'Fernando Tedesco', 'https://www.youtube.com/@fernando_tedesco', '@fernando_tedesco', 'Canal público do YouTube'),
  ('linkedin', 'Victor Baggio', 'Victor Baggio LinkedIn', 'https://www.linkedin.com/in/victorzbaggio/', 'victorzbaggio', null),
  ('linkedin', 'Fernando Tedesco', 'Fernando Tedesco LinkedIn', 'https://www.linkedin.com/in/fernando-tedesco/', 'fernando-tedesco', null)
on conflict (platform, account_url) do update set
  owner_name = excluded.owner_name,
  account_name = excluded.account_name,
  handle = excluded.handle,
  notes = excluded.notes;

create or replace view public.v_latest_linkedin_post_metrics with (security_invoker = true) as
select distinct on (p.id)
  p.id, p.external_post_id, a.owner_name, a.account_url, p.post_url, p.published_at,
  p.hook, p.content, p.format, p.theme, p.content_pillar, p.cta_keyword,
  p.funnel_stage, p.commercial_intent, p.classification_status,
  m.metric_date, m.likes, m.comments, m.shares, m.views,
  m.engagement_total, m.engagement_score, m.source
from public.content_posts p
join public.content_accounts a on a.id = p.account_id
left join public.content_post_daily_metrics m on m.post_id = p.id
order by p.id, m.metric_date desc nulls last, m.created_at desc nulls last;

create or replace view public.v_latest_youtube_video_metrics with (security_invoker = true) as
select distinct on (v.id)
  v.id, a.owner_name, a.account_name, v.video_id, v.video_url, v.title,
  v.description, v.published_at, v.thumbnail_url, v.theme, v.content_pillar,
  v.classification_status, m.metric_date, m.views, m.likes, m.comments,
  m.engagement_total, m.engagement_rate
from public.youtube_videos v
join public.content_accounts a on a.id = v.account_id
left join public.youtube_video_daily_metrics m on m.video_id = v.id
order by v.id, m.metric_date desc nulls last, m.created_at desc nulls last;

create or replace view public.v_account_growth with (security_invoker = true) as
select
  a.id as account_id, a.owner_name, a.platform, a.account_name, a.account_url,
  m.metric_date, m.followers, m.subscribers, m.total_views, m.total_posts, m.total_videos,
  m.followers - lag(m.followers) over (partition by a.id order by m.metric_date) as followers_delta,
  m.subscribers - lag(m.subscribers) over (partition by a.id order by m.metric_date) as subscribers_delta,
  m.total_views - lag(m.total_views) over (partition by a.id order by m.metric_date) as total_views_delta
from public.account_daily_metrics m
join public.content_accounts a on a.id = m.account_id;

create or replace view public.v_content_overview with (security_invoker = true) as
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

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'content_accounts', 'content_posts', 'content_post_daily_metrics', 'youtube_videos',
    'youtube_video_daily_metrics', 'account_daily_metrics', 'import_batches', 'collection_runs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "content dashboard read" on public.%I', table_name);
    execute format('create policy "content dashboard read" on public.%I for select to anon, authenticated using (true)', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to anon, authenticated', table_name);
  end loop;
end $$;

grant select on public.v_latest_linkedin_post_metrics, public.v_latest_youtube_video_metrics,
  public.v_account_growth, public.v_content_overview to anon, authenticated;

-- Verification after migration/import:
-- select count(*) from content_posts; -- expected 222
-- select owner_name, count(*) from v_latest_linkedin_post_metrics group by owner_name order by owner_name;
-- select external_post_id, count(*) from content_posts group by 1 having count(*) > 1; -- expected 0 rows
-- select post_id, metric_date, source, count(*) from content_post_daily_metrics group by 1,2,3 having count(*) > 1; -- expected 0 rows
-- select tablename, rowsecurity from pg_tables where schemaname='public' and tablename like 'content_%'; -- rowsecurity=true
