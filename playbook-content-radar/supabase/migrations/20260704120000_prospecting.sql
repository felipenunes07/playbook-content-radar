-- Prospecção quente a partir de quem comenta nos posts (Fase 1).
-- Banco de leads + rastro de comentários + jobs por post. O enriquecimento e a
-- qualificação (Fase 2) e a mensagem/checkbox (Fase 3) já têm colunas/tabela
-- criadas aqui pra não precisar de nova migration a cada fase, mas só a extração
-- de comentários e as contagens são preenchidas nesta fase.
-- Ver docs/superpowers/plans/2026-07-04-warm-prospecting-from-commenters.md

create extension if not exists pgcrypto;

-- 1 pessoa = 1 linha, deduplicada pelo slug do /in/ (public_identifier). Um lead
-- pode ter comentado em vários posts (ver lead_comments). Os campos de
-- enriquecimento/qualificação ficam null até a Fase 2 rodar.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  public_identifier text unique,
  profile_url text,
  full_name text,
  headline text,
  job_title text,
  seniority text,
  area text,
  company_name text,
  company_url text,
  company_size integer check (company_size is null or company_size >= 0),
  company_revenue_estimated text,
  location text,
  qualification_status text not null default 'pending'
    check (qualification_status in ('pending', 'qualified', 'disqualified')),
  qualification_reason text,
  enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending', 'enriched', 'error', 'skipped')),
  enrichment_error text,
  first_seen_post_id uuid references public.content_posts(id) on delete set null,
  profile_raw jsonb not null default '{}'::jsonb,
  company_raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_qualification_idx on public.leads (qualification_status);
create index if not exists leads_enrichment_pending_idx on public.leads (enrichment_status) where enrichment_status = 'pending';

-- Rastro do "de-para": qual lead comentou em qual post. Uma linha por (post, lead)
-- — se a pessoa comentou várias vezes no mesmo post, guardamos o comentário mais
-- recente. É o que permite dizer, num post novo, quem já está no banco.
create table if not exists public.lead_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.content_posts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  comment_text text,
  comment_urn text,
  commented_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (post_id, lead_id)
);

create index if not exists lead_comments_post_idx on public.lead_comments (post_id);
create index if not exists lead_comments_lead_idx on public.lead_comments (lead_id);

-- Estado de prospecção por lead. Separado de leads pra permitir vários ângulos
-- de abordagem no futuro (Fase 4). Preenchido a partir da Fase 3.
create table if not exists public.lead_outreach (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  generated_message text,
  angle text,
  status text not null default 'new' check (status in ('new', 'prospected', 'replied')),
  channel text check (channel is null or channel in ('linkedin', 'whatsapp')),
  prospected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_outreach_lead_idx on public.lead_outreach (lead_id);

-- 1 linha por clique no botão "Prospectar" de um post. Guarda as contagens que a
-- tabela de posts mostra ("—" enquanto não roda). new_qualified só é preenchido na
-- Fase 2; nesta fase fica em 0/null.
create table if not exists public.prospecting_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.content_posts(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  total_comments integer not null default 0 check (total_comments >= 0),
  total_leads integer not null default 0 check (total_leads >= 0),
  opportunities integer not null default 0 check (opportunities >= 0),
  new_qualified integer check (new_qualified is null or new_qualified >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists prospecting_jobs_post_idx on public.prospecting_jobs (post_id, started_at desc);

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
for each row execute function public.set_content_updated_at();
drop trigger if exists lead_outreach_updated_at on public.lead_outreach;
create trigger lead_outreach_updated_at before update on public.lead_outreach
for each row execute function public.set_content_updated_at();

-- Últimas contagens por post: a tabela de posts lê daqui. distinct on pega o job
-- mais recente de cada post (os números são propriedade da última execução, não
-- um recomputo ao vivo).
create or replace view public.v_post_prospecting_stats with (security_invoker = true) as
select distinct on (post_id)
  post_id, id as job_id, status, total_comments, total_leads,
  opportunities, new_qualified, started_at, finished_at
from public.prospecting_jobs
order by post_id, started_at desc;

do $$
declare table_name text;
begin
  foreach table_name in array array['leads', 'lead_comments', 'lead_outreach', 'prospecting_jobs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "prospecting read" on public.%I', table_name);
    execute format('create policy "prospecting read" on public.%I for select to anon, authenticated using (true)', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to anon, authenticated', table_name);
  end loop;
end $$;

grant select on public.v_post_prospecting_stats to anon, authenticated;
