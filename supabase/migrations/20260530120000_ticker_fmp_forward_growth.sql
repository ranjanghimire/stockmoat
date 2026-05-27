-- Precomputed forward consensus charts (FMP analyst-estimates), separate from full pack TTL.
-- Written only by home-fmp-cache Edge Function (service role).

alter table public.ticker_fmp_home_cache
  add column if not exists forward_growth_charts jsonb,
  add column if not exists forward_growth_fetched_at timestamptz;
