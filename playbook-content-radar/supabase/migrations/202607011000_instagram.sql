-- Instagram tables, views, accounts and RLS
-- Follows the same pattern as LinkedIn (content_posts) and YouTube (youtube_videos)

-- 1. Allow 'instagram' as a valid platform in content_accounts
alter table public.content_accounts drop constraint if exists content_accounts_platform_check;
alter table public.content_accounts add constraint content_accounts_platform_check
  check (platform in ('linkedin', 'youtube', 'instagram'));

-- 2. Instagram posts table
create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.content_accounts(id) on delete cascade,
  external_post_id text not null unique,
  post_url text,
  shortcode text,
  published_at timestamptz,
  caption text not null default '',
  hook text,
  format text check (format in ('image', 'carousel', 'reel', 'video', 'story', 'unknown')),
  theme text,
  content_pillar text,
  cta_keyword text,
  is_repost boolean not null default false,
  media_url text,
  media_type text,
  classification_status text not null default 'pending' check (classification_status in ('pending', 'processing', 'classified', 'manual', 'error')),
  classification_error text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_posts_account_published_idx on public.instagram_posts (account_id, published_at desc);
create index if not exists instagram_posts_classification_idx on public.instagram_posts (classification_status) where classification_status = 'pending';

-- 3. Instagram post daily metrics
create table if not exists public.instagram_post_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.instagram_posts(id) on delete cascade,
  metric_date date not null default current_date,
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  shares integer not null default 0 check (shares >= 0),
  saves integer not null default 0 check (saves >= 0),
  views integer check (views is null or views >= 0),
  plays integer check (plays is null or plays >= 0),
  reach integer check (reach is null or reach >= 0),
  engagement_total integer generated always as (coalesce(likes, 0) + coalesce(comments, 0) + coalesce(shares, 0) + coalesce(saves, 0)) stored,
  engagement_score integer generated always as (coalesce(likes, 0) + coalesce(comments, 0) * 3 + coalesce(shares, 0) * 4 + coalesce(saves, 0) * 2) stored,
  source text not null default 'apify_instagram',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (post_id, metric_date, source)
);

-- 4. Updated_at trigger
drop trigger if exists instagram_posts_updated_at on public.instagram_posts;
create trigger instagram_posts_updated_at before update on public.instagram_posts
for each row execute function public.set_content_updated_at();

-- 5. View: latest metrics per Instagram post
create or replace view public.v_latest_instagram_post_metrics with (security_invoker = true) as
select distinct on (p.id)
  p.id, p.external_post_id, a.owner_name, a.account_url, p.post_url, p.shortcode,
  p.published_at, p.hook, p.caption, p.format, p.theme, p.content_pillar,
  p.cta_keyword, p.is_repost, p.classification_status,
  m.metric_date, m.likes, m.comments, m.shares, m.saves, m.views, m.plays,
  m.engagement_total, m.engagement_score, m.source
from public.instagram_posts p
join public.content_accounts a on a.id = p.account_id
left join public.instagram_post_daily_metrics m on m.post_id = p.id
order by p.id, m.metric_date desc nulls last, m.created_at desc nulls last;

-- 6. Add Instagram to the content overview
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
from public.v_latest_youtube_video_metrics group by owner_name
union all
select 'instagram'::text, owner_name, count(*)::bigint,
  sum(coalesce(likes, 0))::bigint, sum(coalesce(comments, 0))::bigint,
  sum(coalesce(shares, 0))::bigint, sum(coalesce(engagement_total, 0))::bigint,
  sum(coalesce(engagement_score, 0))::bigint, sum(coalesce(views, 0))::bigint
from public.v_latest_instagram_post_metrics group by owner_name;

-- 7. Insert Instagram account
insert into public.content_accounts (platform, owner_name, account_name, account_url, handle, notes)
values
  ('instagram', 'Victor Baggio', 'Victor Baggio Instagram', 'https://www.instagram.com/victor.baggio.ai/', 'victor.baggio.ai', 'Perfil público do Instagram')
on conflict (platform, account_url) do update set
  owner_name = excluded.owner_name,
  account_name = excluded.account_name,
  handle = excluded.handle,
  notes = excluded.notes;

-- 8. RLS and grants
do $$
declare tbl text;
begin
  foreach tbl in array array['instagram_posts', 'instagram_post_daily_metrics'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "content dashboard read" on public.%I', tbl);
    execute format('create policy "content dashboard read" on public.%I for select to anon, authenticated using (true)', tbl);
    execute format('revoke all on table public.%I from anon, authenticated', tbl);
    execute format('grant select on table public.%I to anon, authenticated', tbl);
  end loop;
end $$;

grant select on public.v_latest_instagram_post_metrics to anon, authenticated;
