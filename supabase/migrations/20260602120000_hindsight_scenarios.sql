-- Hindsight game scenarios (shared StockMoat Supabase project; read-only for clients).

create table if not exists public.hindsight_scenarios (
  id text primary key,
  ticker text not null,
  company_name text not null,
  start_date date not null,
  play_start_index integer not null default 60,
  play_days integer not null default 60,
  chart_window_size integer not null default 60,
  story jsonb not null,
  story_event_play_days jsonb not null default '[]'::jsonb,
  candles jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hindsight_scenarios_active_idx
  on public.hindsight_scenarios (is_active)
  where is_active = true;

alter table public.hindsight_scenarios enable row level security;

drop policy if exists "hindsight_scenarios_select_anon" on public.hindsight_scenarios;
create policy "hindsight_scenarios_select_anon"
  on public.hindsight_scenarios
  for select
  to anon, authenticated
  using (is_active = true);

grant select on public.hindsight_scenarios to anon, authenticated;

comment on table public.hindsight_scenarios is
  'Historical trading scenarios for Hindsight (OHLCV + news). Writes via service role / seed scripts only.';
