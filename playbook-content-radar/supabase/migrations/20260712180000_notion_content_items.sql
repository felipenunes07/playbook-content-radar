create table if not exists public.notion_content_items (
  id uuid primary key default gen_random_uuid(),
  notion_page_url text not null unique,
  owner_name text not null default 'Victor Baggio',
  title text not null,
  platforms text[] not null default '{}',
  status text not null default 'Not started',
  publish_date date,
  campaigns text[] not null default '{}',
  performance text,
  content_url text,
  assigned_to_felipe boolean not null default false,
  notion_created_time timestamptz,
  last_synced_at timestamptz not null default now(),
  raw_properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notion_content_items enable row level security;

create index if not exists notion_content_items_owner_status_idx
  on public.notion_content_items (owner_name, status);

create index if not exists notion_content_items_platforms_idx
  on public.notion_content_items using gin (platforms);

create or replace function public.set_notion_content_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notion_content_items_updated_at on public.notion_content_items;
create trigger notion_content_items_updated_at
before update on public.notion_content_items
for each row execute function public.set_notion_content_items_updated_at();
