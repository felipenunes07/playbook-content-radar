-- Metas de crescimento (pedido do Felipe em 06/07): meta mensal por pessoa e
-- rede (ex.: "Victor no LinkedIn: chegar a 22.000 seguidores em julho"),
-- editável por qualquer um que abrir o app (Felipe e Victor), sem login — mesmo
-- modelo de confiança que `ideas`/`votes` hoje (anon key com acesso total).
create table if not exists public.content_goals (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('linkedin', 'youtube', 'instagram')),
  owner_name text not null,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  target integer not null check (target >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, owner_name, month_key)
);

drop trigger if exists content_goals_updated_at on public.content_goals;
create trigger content_goals_updated_at before update on public.content_goals
for each row execute function public.set_content_updated_at();

alter table public.content_goals enable row level security;
drop policy if exists "anon full access content_goals" on public.content_goals;
create policy "anon full access content_goals" on public.content_goals
  for all to anon using (true) with check (true);
