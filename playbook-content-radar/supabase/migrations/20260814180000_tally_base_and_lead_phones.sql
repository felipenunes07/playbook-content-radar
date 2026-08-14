-- Base histórica de submissions do Tally + telefone de lead aprovado.
--
-- Responde uma pergunta nova, sem tocar o ICP: "essa pessoa que JÁ foi aprovada tem
-- telefone dentro das nossas submissions?". A lógica de qualificação (leads.score,
-- qualification_status, calculateAutoStatus) não é lida nem escrita por aqui.
--
-- Decisão de design: o telefone NÃO vira coluna em leads. Fica em lead_phone_matches
-- amarrado à submission que o originou, então não existe caminho no schema para um
-- telefone entrar sem origem rastreável — que é a regra "o telefone vem
-- exclusivamente da Base Tally", garantida por construção e não por convenção.
--
-- Escrita só por service role (edge function), leitura liberada pra dashboard, igual
-- às demais tabelas de métricas.

create extension if not exists pgcrypto;

-- ============================================================ Base Tally
-- 1 linha = 1 submission. submission_id é a chave de dedupe: verificado no export
-- real do "36 Skills de SDR" (289/289 distintos, 0 vazios). respondent_id agrupa
-- sessão do navegador e NÃO deve ser usado para fundir campos — no mesmo export, um
-- respondent_id trouxe "joao marcos" e "q q".
create table if not exists public.tally_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null unique,
  respondent_id text,
  form_id text not null,
  form_name text,
  submitted_at timestamptz,
  first_name text,
  last_name text,
  full_name text,
  -- chaves de match, gravadas na ingestão pelo mesmo person.ts que o matcher usa
  normalized_name text,
  first_last_name text,
  email text,
  email_domain text,
  is_corporate_email boolean not null default false,
  phone_raw text,
  phone_e164 text,
  -- lixo de formulário ("X"/"X", "Jo"/"Jo"): fica guardado mas fora do matching
  is_junk boolean not null default false,
  source text not null default 'csv' check (source in ('csv', 'api')),
  source_file text,
  imported_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tally_submissions_form_idx on public.tally_submissions (form_id);
create index if not exists tally_submissions_name_idx on public.tally_submissions (normalized_name);
create index if not exists tally_submissions_first_last_idx on public.tally_submissions (first_last_name);
create index if not exists tally_submissions_email_idx on public.tally_submissions (email);
-- O universo útil pro matching é pequeno: só quem deixou telefone e não é lixo.
create index if not exists tally_submissions_phone_idx on public.tally_submissions (phone_e164)
  where phone_e164 is not null and is_junk = false;

-- ============================================================ post -> lead magnet
-- Vínculo entre o post do LinkedIn e o formulário do Tally correspondente. Feito uma
-- vez por lead magnet novo. É SINAL DE CONFIANÇA no matcher, não filtro de busca:
-- medimos que os leads aprovados que aparecem no Tally em geral preencheram um
-- formulário DIFERENTE do post em que comentaram, então filtrar por aqui perderia
-- os matches reais.
create table if not exists public.post_lead_magnets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.content_posts(id) on delete cascade,
  tally_form_id text not null,
  tally_form_name text,
  lead_magnet_code text,
  -- 'seed_cta' = derivado de content_posts.cta_keyword; 'manual' = alguém confirmou
  source text not null default 'manual' check (source in ('seed_cta', 'manual')),
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, tally_form_id)
);

create index if not exists post_lead_magnets_post_idx on public.post_lead_magnets (post_id);
create index if not exists post_lead_magnets_form_idx on public.post_lead_magnets (tally_form_id);

-- ============================================================ o vínculo com o lead
-- 1 linha por lead aprovado processado. unique(lead_id) porque a pergunta é binária
-- por pessoa: tem telefone na nossa base ou não.
create table if not exists public.lead_phone_matches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- null quando NOT_FOUND/REVIEW; é a origem obrigatória do telefone quando MATCHED.
  -- CASCADE (e não SET NULL) por dois motivos: apagar a submission de origem tem que
  -- levar o telefone embora junto — é o que atende um pedido de exclusão de dados
  -- (LGPD) sem deixar número órfão — e com SET NULL o próprio CHECK abaixo faria o
  -- DELETE falhar, porque sobraria phone_e164 sem submission_id.
  submission_id text references public.tally_submissions(submission_id) on delete cascade,
  match_status text not null
    check (match_status in ('MATCHED', 'MATCHED_NO_PHONE', 'REVIEW', 'NOT_FOUND')),
  match_method text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- telefone SEMPRE copiado de tally_submissions.phone_e164, nunca de outra fonte
  phone_e164 text,
  phone_form_id text,
  phone_form_name text,
  phone_submitted_at timestamptz,
  -- o que bateu (form_do_post, dominio_empresa, apos_comentario) e os rejeitados
  evidence jsonb not null default '[]'::jsonb,
  candidates jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  matched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id),
  -- só MATCHED pode carregar telefone, e telefone exige submission de origem
  constraint lead_phone_matches_phone_requires_source
    check (phone_e164 is null or (match_status = 'MATCHED' and submission_id is not null))
);

create index if not exists lead_phone_matches_status_idx on public.lead_phone_matches (match_status);
create index if not exists lead_phone_matches_review_idx on public.lead_phone_matches (match_status)
  where match_status = 'REVIEW';

-- ============================================================ triggers
drop trigger if exists tally_submissions_updated_at on public.tally_submissions;
create trigger tally_submissions_updated_at before update on public.tally_submissions
for each row execute function public.set_content_updated_at();

drop trigger if exists post_lead_magnets_updated_at on public.post_lead_magnets;
create trigger post_lead_magnets_updated_at before update on public.post_lead_magnets
for each row execute function public.set_content_updated_at();

drop trigger if exists lead_phone_matches_updated_at on public.lead_phone_matches;
create trigger lead_phone_matches_updated_at before update on public.lead_phone_matches
for each row execute function public.set_content_updated_at();

-- ============================================================ seed do vínculo
-- Só pares inequívocos entre cta_keyword e formulário. Ambíguos ('MAPS'/'MAPA' com
-- dois formulários de Google Maps, 'ASSISTENTE' com dois de assistente) ficam de fora
-- de propósito: vínculo errado viraria falso positivo. O time completa em
-- post_lead_magnets com source='manual'.
insert into public.post_lead_magnets (post_id, tally_form_id, tally_form_name, lead_magnet_code, source)
select p.id, m.form_id, m.form_name, m.cta, 'seed_cta'
from public.content_posts p
join (values
  ('OS', '7RO9QA', 'O Setup inicial do OS da sua empresa'),
  ('FLOW', 'EkEkX4', 'KipFlow - API brasileira boa de verdade'),
  ('FABLE', 'kdpqLe', 'Claude Flabe 5'),
  ('MCP', 'jaqkJJ', '18 MCPs + o guia de instalação completo'),
  ('SDR', 'VLaVrE', '36 Skills de SDR para Claude'),
  ('SMB', 'lb1gzV', 'Claude para Pequenos Negócios'),
  ('HUBSPOT', 'Bz9VeR', 'Pacote Claude + HubSpot (plug and play)'),
  ('PIPEDRIVE', 'jazoo6', 'Pacote Claude + Pipedrive (plug and play)'),
  ('PIPE', 'jazoo6', 'Pacote Claude + Pipedrive (plug and play)'),
  ('SPY', 'wor6W1', 'Espião de Anúncios'),
  ('GAMMA', 'kdYjj6', 'Claude + Gamma'),
  ('INSTA', 'wvJKMX', 'Instagram Scraper'),
  ('N8N', 'nGP8rp', '2200+ N8N Workflows'),
  ('COPILOTO', 'GxRXQj', 'Copiloto para Prospecção'),
  ('FUNIL', 'rjOlql', 'Funil de Conteúdo + Venda Playbook Lab'),
  ('LEADS', 'mDxxlX', '4000 Leads Grátis'),
  ('BETA', 'mBe8YQ', 'Beta, Assistente de Inbound')
) as m(cta, form_id, form_name)
  on upper(btrim(p.cta_keyword)) = m.cta
on conflict (post_id, tally_form_id) do nothing;

-- ============================================================ RLS
do $$
declare target text;
begin
  foreach target in array array['tally_submissions', 'post_lead_magnets', 'lead_phone_matches'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('drop policy if exists "lead phones read" on public.%I', target);
    execute format('create policy "lead phones read" on public.%I for select to anon, authenticated using (true)', target);
    execute format('revoke all on table public.%I from anon, authenticated', target);
    execute format('grant select on table public.%I to anon, authenticated', target);
  end loop;
end $$;

-- Visão que a tela Leads ICP vai consumir: lead aprovado + telefone quando houver.
create or replace view public.v_lead_phones with (security_invoker = true) as
select
  l.id as lead_id,
  l.full_name,
  l.company_name,
  l.qualification_status,
  l.score,
  coalesce(m.match_status, 'NOT_PROCESSED') as match_status,
  m.match_method,
  m.confidence,
  m.phone_e164,
  m.phone_form_name,
  m.phone_submitted_at,
  m.evidence,
  m.candidates,
  m.reviewed_by,
  m.matched_at
from public.leads l
left join public.lead_phone_matches m on m.lead_id = l.id
where l.qualification_status = 'qualified';

grant select on public.v_lead_phones to anon, authenticated;
