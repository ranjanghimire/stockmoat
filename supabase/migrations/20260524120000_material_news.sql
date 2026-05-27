-- Material news digest: anchor-driven FMP + SEC 8-K pipeline output.

create table if not exists public.material_news (
  id uuid primary key default gen_random_uuid(),
  published_at timestamptz not null,
  headline text not null,
  summary text not null,
  impact_score smallint not null check (impact_score >= 1 and impact_score <= 10),
  category text not null,
  lane_ids text[] not null default '{}',
  tickers text[] not null default '{}',
  source_type text not null check (source_type in ('fmp_news', 'fmp_press', 'sec_8k')),
  source_url text not null,
  anchor_symbol text not null,
  raw_excerpt text,
  sec_items text[],
  gemini_model text,
  created_at timestamptz not null default now(),
  constraint material_news_source_url_unique unique (source_url)
);
create index if not exists material_news_published_at_desc on public.material_news (published_at desc);
create index if not exists material_news_lane_ids_gin on public.material_news using gin (lane_ids);
create index if not exists material_news_tickers_gin on public.material_news using gin (tickers);
alter table public.material_news enable row level security;
drop policy if exists "material_news_select_anon" on public.material_news;
create policy "material_news_select_anon" on public.material_news
  for select to anon, authenticated using (true);
grant select on public.material_news to anon, authenticated;
-- Dedupe / ingest bookkeeping (service role writes).
create table if not exists public.news_seen_candidates (
  fingerprint text primary key,
  source_url text,
  seen_at timestamptz not null default now()
);
alter table public.news_seen_candidates enable row level security;
-- No anon policies — service role only.

create table if not exists public.news_pipeline_state (
  id text primary key default 'main',
  sec_accessions jsonb not null default '{}',
  last_run_at timestamptz,
  last_stats jsonb,
  updated_at timestamptz not null default now()
);
alter table public.news_pipeline_state enable row level security;
insert into public.news_pipeline_state (id) values ('main')
on conflict (id) do nothing;
-- Ticker → SEC CIK cache (populated by pipeline).
create table if not exists public.news_ticker_cik (
  symbol text primary key,
  cik text not null,
  updated_at timestamptz not null default now()
);
alter table public.news_ticker_cik enable row level security;
