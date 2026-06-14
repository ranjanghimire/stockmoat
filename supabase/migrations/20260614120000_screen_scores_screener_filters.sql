-- Screener filter columns: pillar scores, market cap, FFV2 ratio, monotonic forward revenue.

alter table public.screen_scores
  add column if not exists valuation_score double precision,
  add column if not exists quality_score double precision,
  add column if not exists balance_sheet_score double precision,
  add column if not exists cash_truth_score double precision,
  add column if not exists stability_score double precision,
  add column if not exists market_cap_usd double precision,
  add column if not exists ffv2_price_ratio double precision,
  add column if not exists upside_to_ffv2_pct double precision,
  add column if not exists forward_rev_monotonic_3y boolean;

create index if not exists screen_scores_valuation_score_desc
  on public.screen_scores (valuation_score desc nulls last);

create index if not exists screen_scores_quality_score_desc
  on public.screen_scores (quality_score desc nulls last);

create index if not exists screen_scores_balance_sheet_score_desc
  on public.screen_scores (balance_sheet_score desc nulls last);

create index if not exists screen_scores_cash_truth_score_desc
  on public.screen_scores (cash_truth_score desc nulls last);

create index if not exists screen_scores_stability_score_desc
  on public.screen_scores (stability_score desc nulls last);

create index if not exists screen_scores_market_cap_usd_desc
  on public.screen_scores (market_cap_usd desc nulls last);

create index if not exists screen_scores_ffv2_price_ratio_desc
  on public.screen_scores (ffv2_price_ratio desc nulls last);

create index if not exists screen_scores_forward_rev_monotonic_3y
  on public.screen_scores (forward_rev_monotonic_3y)
  where forward_rev_monotonic_3y = true;

-- Postgres cannot reorder/rename view columns via CREATE OR REPLACE VIEW.
drop view if exists public.screen_screener_list;

create view public.screen_screener_list
with (security_invoker = true) as
select
  s.symbol,
  s.display_name,
  s.score,
  s.valuation_score,
  s.quality_score,
  s.balance_sheet_score,
  s.cash_truth_score,
  s.stability_score,
  s.market_cap_usd,
  s.ffv2_price_ratio,
  s.upside_to_ffv2_pct,
  s.forward_rev_cagr_3y,
  s.forward_growth_score,
  s.forward_rev_monotonic_3y,
  s.profile_id,
  s.sector,
  s.industry,
  s.any_gate_fail,
  s.score_cap,
  s.raw_weighted,
  s.updated_at,
  e.next_earnings_date
from public.screen_scores s
left join public.ticker_next_earnings e on e.symbol = s.symbol;

grant select on public.screen_screener_list to anon, authenticated;
