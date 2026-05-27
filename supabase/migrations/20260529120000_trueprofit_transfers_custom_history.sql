-- Lot transfers, custom adjustments, extended corporate action types

alter table public.tp_corporate_actions
  add column if not exists details jsonb;
alter table public.tp_corporate_actions
  drop constraint if exists tp_corporate_actions_action_type_check;
alter table public.tp_corporate_actions
  drop constraint if exists tp_corporate_actions_check;
alter table public.tp_corporate_actions
  add constraint tp_corporate_actions_action_type_check check (
    action_type in (
      'split', 'reverse_split', 'ticker_change', 'transfer', 'custom_adjustment'
    )
  );
alter table public.tp_corporate_actions
  add constraint tp_corporate_actions_shape_check check (
    (action_type = 'ticker_change' and to_symbol is not null and ratio is null)
    or (action_type in ('split', 'reverse_split') and ratio is not null and to_symbol is null)
    or (action_type in ('transfer', 'custom_adjustment') and ratio is null and to_symbol is null)
  );
create table if not exists public.tp_lot_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_lot_id uuid not null references public.tp_lots (id) on delete restrict,
  to_broker_id uuid not null references public.tp_brokers (id) on delete restrict,
  shares numeric(18, 6) not null check (shares > 0),
  transfer_date date not null default current_date,
  new_lot_id uuid references public.tp_lots (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists tp_lot_transfers_user_idx
  on public.tp_lot_transfers (user_id, transfer_date desc);
alter table public.tp_lot_transfers enable row level security;
create policy "Users read own transfers"
  on public.tp_lot_transfers for select to authenticated
  using (user_id = auth.uid());
grant select on public.tp_lot_transfers to authenticated;
create trigger tp_lot_transfers_set_user_id
  before insert on public.tp_lot_transfers
  for each row execute function public.tp_set_user_id();
-- Move shares from one lot to another broker (full or partial)
create or replace function public.tp_transfer_lot(
  p_lot_id uuid,
  p_to_broker_id uuid,
  p_shares numeric,
  p_transfer_date date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lot public.tp_lots%rowtype;
  v_new_lot_id uuid;
  v_transfer_id uuid;
  v_to_broker public.tp_brokers%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares to transfer must be greater than zero';
  end if;

  select * into v_to_broker
  from public.tp_brokers
  where id = p_to_broker_id and user_id = v_user_id;

  if not found then
    raise exception 'Destination broker not found';
  end if;

  select * into v_lot
  from public.tp_lots
  where id = p_lot_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Lot not found';
  end if;

  if v_lot.broker_id = p_to_broker_id then
    raise exception 'Lot is already at this broker';
  end if;

  if p_shares > v_lot.remaining_shares then
    raise exception 'Cannot transfer more shares than remain in the lot';
  end if;

  if p_shares >= v_lot.remaining_shares then
    update public.tp_lots
    set broker_id = p_to_broker_id
    where id = v_lot.id;

    v_new_lot_id := v_lot.id;
  else
    update public.tp_lots
    set remaining_shares = remaining_shares - p_shares
    where id = v_lot.id;

    insert into public.tp_lots (
      broker_id, symbol, shares, price_per_share, purchased_at, remaining_shares
    )
    values (
      p_to_broker_id,
      v_lot.symbol,
      p_shares,
      v_lot.price_per_share,
      coalesce(p_transfer_date, v_lot.purchased_at),
      p_shares
    )
    returning id into v_new_lot_id;
  end if;

  insert into public.tp_lot_transfers (
    source_lot_id, to_broker_id, shares, transfer_date, new_lot_id, notes
  )
  values (
    v_lot.id,
    p_to_broker_id,
    p_shares,
    coalesce(p_transfer_date, current_date),
    v_new_lot_id,
    nullif(trim(p_notes), '')
  )
  returning id into v_transfer_id;

  insert into public.tp_corporate_actions (
    action_type, symbol, effective_date, broker_id, notes, details
  )
  values (
    'transfer',
    v_lot.symbol,
    coalesce(p_transfer_date, current_date),
    v_lot.broker_id,
    nullif(trim(p_notes), ''),
    jsonb_build_object(
      'source_lot_id', v_lot.id,
      'to_broker_id', p_to_broker_id,
      'to_broker_name', v_to_broker.name,
      'shares', p_shares,
      'new_lot_id', v_new_lot_id,
      'transfer_id', v_transfer_id
    )
  );

  return v_transfer_id;
end;
$$;
grant execute on function public.tp_transfer_lot (uuid, uuid, numeric, date, text) to authenticated;
-- Manual lot-level adjustments (shares and/or cost per share)
create or replace function public.tp_apply_custom_adjustment(
  p_symbol text,
  p_broker_id uuid,
  p_lot_id uuid,
  p_remaining_mode text,
  p_remaining_value numeric,
  p_price_mode text,
  p_price_value numeric,
  p_effective_date date,
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
  v_action_id uuid;
  v_lot public.tp_lots%rowtype;
  v_new_remaining numeric;
  v_new_price numeric;
  v_count int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_remaining_mode is null and p_price_mode is null then
    raise exception 'Specify at least one adjustment (shares or price)';
  end if;

  if p_remaining_mode is not null and p_remaining_mode not in ('set', 'delta') then
    raise exception 'Invalid remaining shares mode';
  end if;

  if p_price_mode is not null and p_price_mode not in ('set', 'multiply') then
    raise exception 'Invalid price mode';
  end if;

  insert into public.tp_corporate_actions (
    action_type, symbol, effective_date, broker_id, notes, details
  )
  values (
    'custom_adjustment',
    v_symbol,
    coalesce(p_effective_date, current_date),
    p_broker_id,
    nullif(trim(p_notes), ''),
    jsonb_build_object(
      'lot_id', p_lot_id,
      'remaining_mode', p_remaining_mode,
      'remaining_value', p_remaining_value,
      'price_mode', p_price_mode,
      'price_value', p_price_value
    )
  )
  returning id into v_action_id;

  for v_lot in
    select *
    from public.tp_lots
    where user_id = v_user_id
      and symbol = v_symbol
      and remaining_shares > 0
      and (p_lot_id is null or id = p_lot_id)
      and (p_broker_id is null or broker_id = p_broker_id)
    for update
  loop
    v_new_remaining := v_lot.remaining_shares;
    v_new_price := v_lot.price_per_share;

    if p_remaining_mode = 'set' then
      if p_remaining_value is null or p_remaining_value < 0 then
        raise exception 'Set remaining shares to a non-negative value';
      end if;
      if p_remaining_value > v_lot.shares then
        raise exception 'Remaining shares cannot exceed original lot size';
      end if;
      v_new_remaining := p_remaining_value;
    elsif p_remaining_mode = 'delta' then
      if p_remaining_value is null then
        raise exception 'Enter a share delta';
      end if;
      v_new_remaining := v_lot.remaining_shares + p_remaining_value;
      if v_new_remaining < 0 or v_new_remaining > v_lot.shares then
        raise exception 'Resulting share count is out of range for a lot';
      end if;
    end if;

    if p_price_mode = 'set' then
      if p_price_value is null or p_price_value <= 0 then
        raise exception 'Set price must be greater than zero';
      end if;
      v_new_price := p_price_value;
    elsif p_price_mode = 'multiply' then
      if p_price_value is null or p_price_value <= 0 then
        raise exception 'Price multiplier must be greater than zero';
      end if;
      v_new_price := v_lot.price_per_share * p_price_value;
    end if;

    update public.tp_lots
    set
      remaining_shares = v_new_remaining,
      price_per_share = v_new_price
    where id = v_lot.id;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'No open lots matched this adjustment';
  end if;

  return v_action_id;
end;
$$;
grant execute on function public.tp_apply_custom_adjustment (
  text, uuid, uuid, text, numeric, text, numeric, date, text
) to authenticated;
