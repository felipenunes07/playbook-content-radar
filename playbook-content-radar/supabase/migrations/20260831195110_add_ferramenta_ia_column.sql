-- Recuperada do histórico remoto (supabase_migrations.schema_migrations) em 09/09/2026.
-- Aplicada ad-hoc logo depois de 20260831185924, também sem arquivo local.

alter table public.aplicacoes_treinamento add column if not exists ferramenta_ia text;
