alter table public.idea_development_workspaces
  add column if not exists source_materials jsonb not null default '[]'::jsonb;

