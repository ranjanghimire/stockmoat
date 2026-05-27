-- Optional curated copy: how the company earns revenue (MOAT ANALYSIS home section).

alter table public.company_moat_summaries
  add column if not exists how_they_make_money_body text;
update public.company_moat_summaries
set
  how_they_make_money_body =
    'IREN earns its revenue from operating industrial‑scale Bitcoin mining facilities, offering high‑performance GPU compute, and monetizing its proprietary energy assets and data‑center infrastructure, enabling extremely low operating costs.',
  updated_at = now()
where symbol = 'IREN';
