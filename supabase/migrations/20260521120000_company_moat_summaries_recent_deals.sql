-- Recent deals and partnerships (MOAT ANALYSIS subsection).

alter table public.company_moat_summaries
  add column if not exists recent_deals_body text;

comment on column public.company_moat_summaries.recent_deals_body is
  'Short paragraph on recent deals, partnerships, and strategic relationships.';
