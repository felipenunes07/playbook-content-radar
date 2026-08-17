-- Prospecção paginada: um post viral (4.373 comentários no das 36 Skills) não cabe
-- numa invocação de Edge Function. No plano free o worker morre em ~150s e o
-- runActor lê o dataset com limit=1000 fixo — raspar tudo de uma vez é impossível.
--
-- A partir daqui o job guarda ONDE PAROU: a run da Apify fica registrada e cada
-- invocação ingere mais uma fatia do dataset, somando em ingested_count até bater
-- dataset_total. O botão Prospectar chama a function em loop, igual a tela já faz
-- com o enrich-leads.

alter table public.prospecting_jobs
  add column if not exists apify_run_id text,
  add column if not exists apify_dataset_id text,
  add column if not exists ingested_count integer not null default 0,
  add column if not exists dataset_total integer,
  -- Heartbeat: a varredura de jobs órfãos precisa distinguir "abandonado" de
  -- "paginando há 20 minutos". Um job que avança carimba aqui a cada invocação;
  -- só quem para de carimbar é encerrado.
  add column if not exists last_progress_at timestamptz;

alter table public.prospecting_jobs
  add constraint prospecting_jobs_ingested_nonneg check (ingested_count >= 0) not valid;

comment on column public.prospecting_jobs.apify_run_id is 'Run da Apify que raspou os comentários — permite retomar a ingestão em outra invocação';
comment on column public.prospecting_jobs.apify_dataset_id is 'Dataset da run; lido em páginas via offset/limit';
comment on column public.prospecting_jobs.ingested_count is 'Quantos itens do dataset já foram persistidos (offset da próxima página)';
comment on column public.prospecting_jobs.dataset_total is 'itemCount do dataset na última consulta; a ingestão termina quando ingested_count o alcança';
comment on column public.prospecting_jobs.last_progress_at is 'Heartbeat da última invocação que avançou o job';

create index if not exists prospecting_jobs_running_idx
  on public.prospecting_jobs (post_id, started_at desc)
  where status = 'running';
