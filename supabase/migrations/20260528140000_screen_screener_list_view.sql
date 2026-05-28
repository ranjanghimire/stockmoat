-- Screener list: screen_scores + next earnings for sortable columns in the app.

create or replace view public.screen_screener_list
with (security_invoker = true) as
select
  s.symbol,
  s.display_name,
  s.score,
  s.forward_rev_cagr_3y,
  s.forward_growth_score,
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
