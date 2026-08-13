-- ----------------------------------------------------------------------------
-- 15 vendas de teste pro membro DAMAC, datadas do mês passado (fechado) —
-- pra aparecer comissão pendente na seção "Pagamento de Comissão (PIX)"
-- também nele, igual fizemos com o TESTE.
-- ----------------------------------------------------------------------------
do $$
declare
  v_member_id uuid;
  v_last_month date := date_trunc('month', now() - interval '1 month')::date;
  i integer;
begin
  select id into v_member_id from members where coupon_code = 'DAMAC';

  if v_member_id is null then
    raise exception 'Membro DAMAC não encontrado';
  end if;

  for i in 1..15 loop
    insert into sales (member_id, shopify_order_id, coupon_code, gross_amount, sale_date)
    values (v_member_id, 'TEST-' || gen_random_uuid()::text, 'DAMAC', 199.90, v_last_month + (i || ' days')::interval)
    on conflict (shopify_order_id) do nothing;
  end loop;
end $$;
