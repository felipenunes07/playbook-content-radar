alter table public.content_production_items
  add column if not exists content_type text not null default 'Post',
  add column if not exists priority text not null default 'Media',
  add column if not exists deadline date,
  add column if not exists folder text not null default 'Conteudos',
  add column if not exists assignee text not null default 'Felipe',
  add column if not exists parent_id uuid references public.content_production_items(id) on delete set null;

create index if not exists content_production_items_deadline_idx
  on public.content_production_items (owner_name, deadline);

create index if not exists content_production_items_folder_idx
  on public.content_production_items (owner_name, folder);

create index if not exists content_production_items_parent_idx
  on public.content_production_items (parent_id);
