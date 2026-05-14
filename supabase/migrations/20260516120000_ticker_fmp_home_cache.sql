-- Home-page FMP bundle cache (per profile_cache_key). Written only by Edge Function (service role).
-- Staleness is evaluated server-side using *_fetched_at columns. No anon/authenticated grants.

create table if not exists public.ticker_fmp_home_cache (
  profile_cache_key text primary key,
  symbol text not null,
  company_raw_pack jsonb,
  company_raw_pack_fetched_at timestamptz,
  quote_row jsonb,
  quote_fetched_at timestamptz,
  peer_medians jsonb,
  peer_medians_fetched_at timestamptz,
  lock_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ticker_fmp_home_cache_symbol_idx on public.ticker_fmp_home_cache (symbol);

alter table public.ticker_fmp_home_cache enable row level security;

-- Intentionally no SELECT/INSERT policies for anon/authenticated: only service role (Edge) may access.
