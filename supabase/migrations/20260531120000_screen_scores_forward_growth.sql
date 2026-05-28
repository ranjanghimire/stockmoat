-- Forward consensus revenue growth rank (1–10) for screener sort.

alter table public.screen_scores
  add column if not exists forward_rev_cagr_3y double precision,
  add column if not exists forward_growth_score smallint check (
    forward_growth_score is null or (forward_growth_score >= 1 and forward_growth_score <= 10)
  );

create index if not exists screen_scores_forward_growth_score_desc
  on public.screen_scores (forward_growth_score desc nulls last);
