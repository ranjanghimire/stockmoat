-- Curated "what's the moat?" copy per symbol (browser reads via anon key + RLS).

create table if not exists public.company_moat_summaries (
  symbol text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);
alter table public.company_moat_summaries enable row level security;
drop policy if exists "company_moat_summaries_select_anon" on public.company_moat_summaries;
create policy "company_moat_summaries_select_anon" on public.company_moat_summaries for select to anon, authenticated using (true);
grant select on public.company_moat_summaries to anon, authenticated;
-- Writes: service role from admin scripts / dashboard (bypasses RLS).

insert into public.company_moat_summaries (symbol, body)
values (
  'IREN',
  'IREN’s moat comes from unusually low‑cost power, massive scale, and a strategic pivot into AI compute that most miners can’t match.'
)
on conflict (symbol) do update
set
  body = excluded.body,
  updated_at = now();
