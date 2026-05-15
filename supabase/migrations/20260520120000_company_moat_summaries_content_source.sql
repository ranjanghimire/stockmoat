-- Distinguish human-curated copy vs nightly/model-generated copy for review workflows.

alter table public.company_moat_summaries
  add column if not exists content_source text not null default 'curated';

alter table public.company_moat_summaries
  drop constraint if exists company_moat_summaries_content_source_check;

alter table public.company_moat_summaries
  add constraint company_moat_summaries_content_source_check
  check (content_source in ('curated', 'auto_generated'));

create index if not exists company_moat_summaries_auto_generated_idx
  on public.company_moat_summaries (symbol)
  where content_source = 'auto_generated';

comment on column public.company_moat_summaries.content_source is
  'curated: human-written (CSV or manual). auto_generated: model/nightly pipeline — safe to overwrite or promote to curated after review.';
