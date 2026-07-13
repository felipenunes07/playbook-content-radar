create table if not exists public.idea_development_workspaces (
  id uuid primary key default gen_random_uuid(),
  idea_id text not null references public.ideas(id) on delete cascade,
  copy_variants jsonb not null default '[]'::jsonb,
  selected_copy_id text,
  attachments jsonb not null default '[]'::jsonb,
  canvas_blocks jsonb not null default '[]'::jsonb,
  feedback jsonb not null default '[]'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id)
);

alter table public.idea_development_workspaces enable row level security;

grant select, insert, update on public.idea_development_workspaces to anon, authenticated;
revoke delete on public.idea_development_workspaces from anon, authenticated;

drop policy if exists "content team read development workspaces" on public.idea_development_workspaces;
create policy "content team read development workspaces"
  on public.idea_development_workspaces for select to anon, authenticated using (true);

drop policy if exists "content team create development workspaces" on public.idea_development_workspaces;
create policy "content team create development workspaces"
  on public.idea_development_workspaces for insert to anon, authenticated
  with check (exists (select 1 from public.ideas where ideas.id = idea_development_workspaces.idea_id));

drop policy if exists "content team update development workspaces" on public.idea_development_workspaces;
create policy "content team update development workspaces"
  on public.idea_development_workspaces for update to anon, authenticated
  using (exists (select 1 from public.ideas where ideas.id = idea_development_workspaces.idea_id))
  with check (exists (select 1 from public.ideas where ideas.id = idea_development_workspaces.idea_id));

drop policy if exists "content team delete development workspaces" on public.idea_development_workspaces;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-production',
  'content-production',
  true,
  26214400,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
    'application/pdf','text/plain','text/csv',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip','application/x-zip-compressed',
    'video/mp4'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "content team read production files" on storage.objects;

drop policy if exists "content team upload production files" on storage.objects;
create policy "content team upload production files"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'content-production'
    and exists (select 1 from public.ideas where ideas.id = split_part(name, '/', 1))
  );

drop policy if exists "content team update production files" on storage.objects;

drop policy if exists "content team delete production files" on storage.objects;
create policy "content team delete production files"
  on storage.objects for delete to anon, authenticated
  using (
    bucket_id = 'content-production'
    and exists (select 1 from public.ideas where ideas.id = split_part(name, '/', 1))
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'idea_development_workspaces'
  ) then
    alter publication supabase_realtime add table public.idea_development_workspaces;
  end if;
end $$;
