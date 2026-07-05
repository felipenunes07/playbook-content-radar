-- Prospecção v2: alinhamento com o escopo formal (2026-07-05).
-- O agente de qualificação passa a devolver score 0-100, um terceiro status
-- ("revisar", pra casos limítrofes que o Victor decide na mão) e um ângulo
-- sugerido de abordagem. O outreach ganha o status "ignored" (botão Ignorar).

alter table public.leads drop constraint if exists leads_qualification_status_check;
alter table public.leads add constraint leads_qualification_status_check
  check (qualification_status in ('pending', 'qualified', 'disqualified', 'review'));

alter table public.leads add column if not exists score integer
  check (score is null or (score >= 0 and score <= 100));
alter table public.leads add column if not exists suggested_angle text;

alter table public.lead_outreach drop constraint if exists lead_outreach_status_check;
alter table public.lead_outreach add constraint lead_outreach_status_check
  check (status in ('new', 'prospected', 'replied', 'ignored'));
