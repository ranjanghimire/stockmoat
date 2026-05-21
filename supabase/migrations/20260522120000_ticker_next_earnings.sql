-- Next earnings date per ticker: populated by nightly GitHub Action; Home page reads with anon key.
-- When the row is missing or stale, the browser may call FMP directly (see HomePage).

create table if not exists public.ticker_next_earnings (
  symbol text primary key,
  next_earnings_date date,
  fetch_error text,
  updated_at timestamptz not null default now()
);

create index if not exists ticker_next_earnings_date_idx on public.ticker_next_earnings (next_earnings_date);

alter table public.ticker_next_earnings enable row level security;

drop policy if exists "ticker_next_earnings_select_anon" on public.ticker_next_earnings;
create policy "ticker_next_earnings_select_anon" on public.ticker_next_earnings
  for select to anon, authenticated using (true);

grant select on public.ticker_next_earnings to anon, authenticated;
