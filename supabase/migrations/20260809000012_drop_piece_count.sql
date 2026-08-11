-- Prêmio de peças ao passar de 15 vendas deixa de ser fixo (3) e passa a ser
-- "uma unidade de cada produto ativo no drop atual" — configurável em
-- app_config.drop_piece_count (decisão do cliente em 2026-08-09).

alter table app_config add column if not exists drop_piece_count integer not null default 8 check (drop_piece_count >= 0);

drop function if exists calculate_cycle_rewards(integer, numeric, numeric);

create or replace function calculate_cycle_rewards(
  p_sales_count integer,
  p_gross_total numeric,
  p_net_total numeric
)
returns table (pieces_earned integer, commission_amount numeric)
language plpgsql
stable
as $$
declare
  v_base text;
  v_rate numeric;
  v_drop_pieces integer;
  v_pieces integer := 0;
  v_commission numeric := 0;
  v_commission_base_amount numeric;
begin
  select commission_base, commission_rate, drop_piece_count
    into v_base, v_rate, v_drop_pieces
    from app_config where id = 1;

  v_commission_base_amount := case when v_base = 'net' then coalesce(p_net_total, 0) else p_gross_total end;

  if p_sales_count >= 15 then
    v_pieces := v_drop_pieces;
    v_commission := round(v_commission_base_amount * v_rate, 2);
  elsif p_sales_count >= 5 then
    v_pieces := floor(p_sales_count / 5)::integer;
    v_commission := 0;
  else
    v_pieces := 0;
    v_commission := 0;
  end if;

  return query select v_pieces, v_commission;
end;
$$;

-- Recalcula todos os ciclos já existentes com a regra nova.
do $$
declare
  r record;
begin
  for r in select distinct member_id, cycle_month from cycles loop
    perform recalc_member_cycle(r.member_id, r.cycle_month);
  end loop;
end;
$$;
