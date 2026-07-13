alter table public.idea_development_workspaces
  add column if not exists brief jsonb not null default '{}'::jsonb,
  add column if not exists reference_links jsonb not null default '[]'::jsonb,
  add column if not exists creative_variants jsonb not null default '[]'::jsonb,
  add column if not exists selected_creative_id text,
  add column if not exists approvals jsonb not null default '[]'::jsonb;
