-- screen_scores: nightly batch upserts; anon reads via RLS (see app Screener page).

create table if not exists public.screen_scores (
  symbol text primary key,
  display_name text not null,
  score double precision not null,
  profile_id text not null,
  sector text,
  industry text,
  any_gate_fail boolean not null default false,
  score_cap double precision,
  raw_weighted double precision,
  updated_at timestamptz not null default now()
);
create index if not exists screen_scores_score_desc on public.screen_scores (score desc);
alter table public.screen_scores enable row level security;
drop policy if exists "screen_scores_select_anon" on public.screen_scores;
create policy "screen_scores_select_anon" on public.screen_scores for select to anon, authenticated using (true);
grant select on public.screen_scores to anon, authenticated;
-- Inserts/updates: use the service role key from a trusted worker (bypasses RLS).;
