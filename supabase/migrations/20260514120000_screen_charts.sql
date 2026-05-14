-- screen_charts: nightly FMP OHLC payloads for Screener "Chart" popup (anon read via RLS).

create table if not exists public.screen_charts (
  symbol text primary key references public.screen_scores (symbol) on delete cascade,
  payload jsonb,
  fetch_error text,
  updated_at timestamptz not null default now()
);

create index if not exists screen_charts_updated_at on public.screen_charts (updated_at desc);

alter table public.screen_charts enable row level security;

drop policy if exists "screen_charts_select_anon" on public.screen_charts;
create policy "screen_charts_select_anon" on public.screen_charts for select to anon, authenticated using (true);

grant select on public.screen_charts to anon, authenticated;

-- Writes: service role from nightly-screen-charts script (bypasses RLS).
