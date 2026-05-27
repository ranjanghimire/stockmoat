-- TrueProfit portfolio: brokers + buy lots (user-scoped)

create table if not exists public.tp_brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table if not exists public.tp_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_id uuid not null references public.tp_brokers (id) on delete restrict,
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,15}$'),
  shares numeric(18, 6) not null check (shares > 0),
  price_per_share numeric(18, 6) not null check (price_per_share > 0),
  purchased_at date not null default current_date,
  remaining_shares numeric(18, 6) not null check (remaining_shares >= 0),
  created_at timestamptz not null default now(),
  check (remaining_shares <= shares)
);
create index if not exists tp_lots_user_id_idx on public.tp_lots (user_id);
create index if not exists tp_lots_user_symbol_idx on public.tp_lots (user_id, symbol);
create index if not exists tp_lots_open_idx on public.tp_lots (user_id)
  where remaining_shares > 0;
create table if not exists public.tp_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_id uuid not null references public.tp_brokers (id) on delete restrict,
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,15}$'),
  sale_price numeric(18, 6) not null check (sale_price > 0),
  sold_at date not null default current_date,
  created_at timestamptz not null default now()
);
create table if not exists public.tp_sale_allocations (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.tp_sales (id) on delete cascade,
  lot_id uuid not null references public.tp_lots (id) on delete restrict,
  shares numeric(18, 6) not null check (shares > 0),
  unique (sale_id, lot_id)
);
alter table public.tp_brokers enable row level security;
alter table public.tp_lots enable row level security;
alter table public.tp_sales enable row level security;
alter table public.tp_sale_allocations enable row level security;
-- Brokers
create policy "Users manage own brokers"
  on public.tp_brokers for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Lots
create policy "Users manage own lots"
  on public.tp_lots for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Sales
create policy "Users manage own sales"
  on public.tp_sales for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Allocations via sale ownership
create policy "Users manage own sale allocations"
  on public.tp_sale_allocations for all to authenticated
  using (
    exists (
      select 1 from public.tp_sales s
      where s.id = sale_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tp_sales s
      where s.id = sale_id and s.user_id = auth.uid()
    )
  );
grant select, insert, update, delete on public.tp_brokers to authenticated;
grant select, insert, update, delete on public.tp_lots to authenticated;
grant select, insert, update, delete on public.tp_sales to authenticated;
grant select, insert, update, delete on public.tp_sale_allocations to authenticated;
-- Auto-set user_id from auth on insert
create or replace function public.tp_set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;
create trigger tp_brokers_set_user_id
  before insert on public.tp_brokers
  for each row execute function public.tp_set_user_id();
create trigger tp_lots_set_user_id
  before insert on public.tp_lots
  for each row execute function public.tp_set_user_id();
create trigger tp_sales_set_user_id
  before insert on public.tp_sales
  for each row execute function public.tp_set_user_id();
