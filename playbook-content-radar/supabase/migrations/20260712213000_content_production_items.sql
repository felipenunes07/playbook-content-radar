create table if not exists public.content_production_items (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null default 'Victor Baggio',
  title text not null,
  platform text not null default 'LinkedIn',
  template_key text not null,
  template_name text not null,
  status text not null default 'Not started',
  publish_date date,
  campaign text,
  content_url text,
  assigned_to_felipe boolean not null default false,
  sections jsonb not null default '[]'::jsonb,
  source text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_production_items enable row level security;

create index if not exists content_production_items_owner_status_idx
  on public.content_production_items (owner_name, status);

create index if not exists content_production_items_template_idx
  on public.content_production_items (template_key);

create or replace function public.set_content_production_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_production_items_updated_at on public.content_production_items;
create trigger content_production_items_updated_at
before update on public.content_production_items
for each row execute function public.set_content_production_items_updated_at();
