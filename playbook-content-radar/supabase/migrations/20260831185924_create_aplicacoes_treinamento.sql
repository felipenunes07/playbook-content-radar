-- Recuperada do histórico remoto (supabase_migrations.schema_migrations) em 09/09/2026.
-- Tinha sido aplicada ad-hoc, sem arquivo local, e travava o `db push` com
-- "Remote migration versions not found in local migrations directory".
--
-- Formulário de aplicação para treinamento: a tabela recebe insert de visitante
-- anônimo (RLS ligada, política só de INSERT para o role anon — nada de leitura).

create table if not exists public.aplicacoes_treinamento (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text,
  empresa text,
  area text,
  tamanho_time text,
  uso_ia text,
  resultado_esperado text,
  urgencia text,
  orcamento text,
  whatsapp text,
  email text
);

alter table public.aplicacoes_treinamento enable row level security;

drop policy if exists "anon_insert_aplicacoes" on public.aplicacoes_treinamento;
create policy "anon_insert_aplicacoes"
  on public.aplicacoes_treinamento
  for insert
  to anon
  with check (true);
