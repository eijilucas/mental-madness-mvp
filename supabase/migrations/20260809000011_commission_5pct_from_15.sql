-- Regra de comissão simplificada (decisão do cliente em 2026-08-09):
-- a partir de 15 vendas, 3 peças + 5% de comissão fixo. Não existe mais um
-- tier de 10% a partir de 30 vendas — vira a mesma regra de 15.

alter table app_config alter column commission_rate set default 0.05;
update app_config set commission_rate = 0.05, updated_at = now() where id = 1;

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
  v_pieces integer := 0;
  v_commission numeric := 0;
  v_commission_base_amount numeric;
begin
  select commission_base, commission_rate
    into v_base, v_rate
    from app_config where id = 1;

  v_commission_base_amount := case when v_base = 'net' then coalesce(p_net_total, 0) else p_gross_total end;

  if p_sales_count >= 15 then
    v_pieces := 3;
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

-- Coluna combine_30_with_15_benefit não é mais usada pela função (não existe
-- mais tier de 30 distinto), mas fica no schema por segurança/histórico —
-- não é dropada aqui.

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
