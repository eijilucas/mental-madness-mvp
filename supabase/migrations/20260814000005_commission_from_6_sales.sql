-- ----------------------------------------------------------------------------
-- Comissão de 5% passa a ativar a partir de 6 vendas (antes só a partir de
-- 15). Peças continuam exatamente na mesma regra (5=1, 10=2, 15+=todas do
-- drop). A partir de 15 nada muda. Nova tabela de marcos:
--   5  -> 1 peça
--   6  -> comissão ativa (sobre o total do mês, não só as vendas daí pra
--         frente — mesma base de sempre, `gross_total`/`net_total` do ciclo)
--   10 -> 2 peças + comissão
--   15 -> todas as peças do drop + comissão
--   30 -> comissão (sem mudança nas peças, só reforça visualmente)
-- ----------------------------------------------------------------------------
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
    v_commission := case when p_sales_count >= 6 then round(v_commission_base_amount * v_rate, 2) else 0 end;
  else
    v_pieces := 0;
    v_commission := 0;
  end if;

  return query select v_pieces, v_commission;
end;
$$;
