alter table public.content_production_items
  add column if not exists notion_source_id uuid,
  add column if not exists description text not null default '',
  add column if not exists attachments jsonb not null default '[]'::jsonb;

drop index if exists public.content_production_items_notion_source_idx;
create unique index content_production_items_notion_source_idx
  on public.content_production_items (notion_source_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-production',
  'content-production',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
