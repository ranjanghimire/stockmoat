-- Atomic sale logging + corporate actions audit

create table if not exists public.tp_corporate_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null check (
    action_type in ('split', 'reverse_split', 'ticker_change')
  ),
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,15}$'),
  to_symbol text check (to_symbol is null or to_symbol ~ '^[A-Z][A-Z0-9.\-]{0,15}$'),
  ratio numeric(18, 6) check (ratio is null or ratio > 0),
  effective_date date not null default current_date,
  broker_id uuid references public.tp_brokers (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (
    (action_type = 'ticker_change' and to_symbol is not null and ratio is null)
    or (action_type in ('split', 'reverse_split') and ratio is not null and to_symbol is null)
  )
);
create index if not exists tp_corporate_actions_user_idx
  on public.tp_corporate_actions (user_id, created_at desc);
alter table public.tp_corporate_actions enable row level security;
create policy "Users manage own corporate actions"
  on public.tp_corporate_actions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert on public.tp_corporate_actions to authenticated;
create trigger tp_corporate_actions_set_user_id
  before insert on public.tp_corporate_actions
  for each row execute function public.tp_set_user_id();
-- Log sale + lot allocations atomically (manual lot selection only)
create or replace function public.tp_log_sale(
  p_broker_id uuid,
  p_symbol text,
  p_sale_price numeric,
  p_sold_at date,
  p_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_user_id uuid := auth.uid();
  v_symbol text := upper(trim(p_symbol));
  alloc record;
  v_lot public.tp_lots%rowtype;
  v_total numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Select at least one lot to sell from';
  end if;

  for alloc in
    select *
    from jsonb_to_recordset(p_allocations) as x(lot_id uuid, shares numeric)
  loop
    if alloc.shares is null or alloc.shares <= 0 then
      raise exception 'Each allocation must be greater than zero';
    end if;

    select * into v_lot
    from public.tp_lots
    where id = alloc.lot_id and user_id = v_user_id
    for update;

    if not found then
      raise exception 'Lot not found';
    end if;

    if v_lot.broker_id <> p_broker_id then
      raise exception 'Lot must belong to the selected broker';
    end if;

    if v_lot.symbol <> v_symbol then
      raise exception 'Lot symbol does not match sale';
    end if;

    if alloc.shares > v_lot.remaining_shares then
      raise exception 'Cannot sell more shares than remain in lot';
    end if;

    v_total := v_total + alloc.shares;
  end loop;

  insert into public.tp_sales (broker_id, symbol, sale_price, sold_at)
  values (p_broker_id, v_symbol, p_sale_price, p_sold_at)
  returning id into v_sale_id;

  for alloc in
    select *
    from jsonb_to_recordset(p_allocations) as x(lot_id uuid, shares numeric)
  loop
    insert into public.tp_sale_allocations (sale_id, lot_id, shares)
    values (v_sale_id, alloc.lot_id, alloc.shares);

    update public.tp_lots
    set remaining_shares = remaining_shares - alloc.shares
    where id = alloc.lot_id;
  end loop;

  return v_sale_id;
end;
$$;
grant execute on function public.tp_log_sale (uuid, text, numeric, date, jsonb) to authenticated;
-- Apply split / reverse split / ticker change to open lots
create or replace function public.tp_apply_corporate_action(
  p_action_type text,
  p_symbol text,
  p_to_symbol text,
  p_ratio numeric,
  p_effective_date date,
  p_broker_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_symbol text := upper(trim(p_symbol));
  v_to_symbol text := upper(trim(coalesce(p_to_symbol, '')));
  v_action_id uuid;
  v_lot public.tp_lots%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.tp_corporate_actions (
    action_type, symbol, to_symbol, ratio, effective_date, broker_id, notes
  )
  values (
    p_action_type,
    v_symbol,
    nullif(v_to_symbol, ''),
    p_ratio,
    coalesce(p_effective_date, current_date),
    p_broker_id,
    nullif(trim(p_notes), '')
  )
  returning id into v_action_id;

  if p_action_type = 'ticker_change' then
    if v_to_symbol = '' or v_to_symbol = v_symbol then
      raise exception 'Enter a new ticker symbol';
    end if;

    update public.tp_lots
    set symbol = v_to_symbol
    where user_id = v_user_id
      and symbol = v_symbol
      and remaining_shares > 0
      and (p_broker_id is null or broker_id = p_broker_id);

  elsif p_action_type = 'split' then
    if p_ratio is null or p_ratio <= 1 then
      raise exception 'Split ratio must be greater than 1 (e.g. 2 for 2-for-1)';
    end if;

    for v_lot in
      select * from public.tp_lots
      where user_id = v_user_id
        and symbol = v_symbol
        and remaining_shares > 0
        and (p_broker_id is null or broker_id = p_broker_id)
      for update
    loop
      update public.tp_lots
      set
        shares = shares * p_ratio,
        remaining_shares = remaining_shares * p_ratio,
        price_per_share = price_per_share / p_ratio
      where id = v_lot.id;
    end loop;

  elsif p_action_type = 'reverse_split' then
    if p_ratio is null or p_ratio <= 0 or p_ratio >= 1 then
      raise exception 'Reverse split ratio must be between 0 and 1 (e.g. 0.1 for 1-for-10)';
    end if;

    for v_lot in
      select * from public.tp_lots
      where user_id = v_user_id
        and symbol = v_symbol
        and remaining_shares > 0
        and (p_broker_id is null or broker_id = p_broker_id)
      for update
    loop
      update public.tp_lots
      set
        shares = shares * p_ratio,
        remaining_shares = remaining_shares * p_ratio,
        price_per_share = price_per_share / p_ratio
      where id = v_lot.id;
    end loop;
  else
    raise exception 'Unknown action type';
  end if;

  return v_action_id;
end;
$$;
grant execute on function public.tp_apply_corporate_action (
  text, text, text, numeric, date, uuid, text
) to authenticated;
