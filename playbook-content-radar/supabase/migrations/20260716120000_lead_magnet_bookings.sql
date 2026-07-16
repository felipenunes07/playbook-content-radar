-- Captura de reuniões agendadas via lead magnet (Cal.com → webhook → Content Radar).
-- Cada lead magnet no Notion aponta pro mesmo evento do Cal com um campo oculto
-- `lead-magnet` diferente na URL. O Cal dispara BOOKING_CREATED/RESCHEDULED/CANCELLED
-- pra edge function cal-bookings, que normaliza e grava aqui.
-- 1 reserva = 1 linha, deduplicada por booking_uid (reagendamento atualiza a mesma
-- linha em vez de duplicar). raw_payload guarda o payload cru pra ajuste futuro.

create table if not exists public.lead_magnet_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_uid text not null unique,
  booking_id text,
  event_type_id text,
  event_name text,
  trigger_event text,
  lead_name text,
  lead_email text,
  lead_magnet text,
  booking_origin text,
  lead_owner text,
  cta_position text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices pros cortes que a dashboard vai fazer: por material e por data da reunião.
create index if not exists lead_magnet_bookings_lead_magnet_idx on public.lead_magnet_bookings (lead_magnet);
create index if not exists lead_magnet_bookings_start_time_idx on public.lead_magnet_bookings (start_time desc);

drop trigger if exists lead_magnet_bookings_updated_at on public.lead_magnet_bookings;
create trigger lead_magnet_bookings_updated_at before update on public.lead_magnet_bookings
for each row execute function public.set_content_updated_at();

-- Escrita só via service role (a edge function). Leitura liberada pra dashboard,
-- igual às demais tabelas de métricas.
alter table public.lead_magnet_bookings enable row level security;
drop policy if exists "lead magnet bookings read" on public.lead_magnet_bookings;
create policy "lead magnet bookings read" on public.lead_magnet_bookings for select to anon, authenticated using (true);
revoke all on table public.lead_magnet_bookings from anon, authenticated;
grant select on table public.lead_magnet_bookings to anon, authenticated;
