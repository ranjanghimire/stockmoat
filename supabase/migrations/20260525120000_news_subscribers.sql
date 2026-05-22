-- Email subscribers for material news hourly digest (Brevo).

create table if not exists public.news_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'unsubscribed')),
  confirm_token text not null,
  unsubscribe_token text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_subscribers_email_unique unique (email)
);

create unique index if not exists news_subscribers_confirm_token_idx
  on public.news_subscribers (confirm_token);
create unique index if not exists news_subscribers_unsubscribe_token_idx
  on public.news_subscribers (unsubscribe_token);
create index if not exists news_subscribers_status_idx on public.news_subscribers (status);

alter table public.news_subscribers enable row level security;
-- Writes via service role / API only; no anon policies.
