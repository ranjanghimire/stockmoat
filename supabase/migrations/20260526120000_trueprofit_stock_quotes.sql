-- TrueProfit: cached delayed stock quotes (Alpha Vantage GLOBAL_QUOTE), refreshed ~every 8 hours.
-- Safe to apply alongside Stock Moat tables in the same Supabase project (separate table, no name clash).

create table if not exists public.stock_quotes (
  symbol text primary key check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,15}$'),
  price numeric(18, 6) not null check (price > 0),
  currency text not null default 'USD',
  quote_time timestamptz,
  refreshed_at timestamptz not null default now(),
  source text not null default 'alpha_vantage'
);
create index if not exists stock_quotes_refreshed_at_idx
  on public.stock_quotes (refreshed_at desc);
comment on table public.stock_quotes is
  'TrueProfit delayed market prices. Refreshed by refresh-quotes edge function (~8h staleness).';
alter table public.stock_quotes enable row level security;
create policy "Authenticated users can read quotes"
  on public.stock_quotes
  for select
  to authenticated
  using (true);
-- Anonymous read for MVP before auth ships (tighten when auth is added)
create policy "Anon can read quotes for development"
  on public.stock_quotes
  for select
  to anon
  using (true);
grant select on public.stock_quotes to anon, authenticated;
grant all on public.stock_quotes to service_role;
