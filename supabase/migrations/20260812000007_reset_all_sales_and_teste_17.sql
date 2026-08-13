-- ----------------------------------------------------------------------------
-- Zera TODAS as vendas (reais e de teste) de todos os membros, confirmado
-- explicitamente pelo usuário mesmo sabendo que isso apaga vendas reais de
-- pedidos já feitos na Shopify. `cycles` cai junto via cascata/recálculo.
-- Depois insere 17 vendas de teste pro membro TESTE.
-- ----------------------------------------------------------------------------
delete from sales;

do $$
declare
  v_member_id uuid;
  i integer;
begin
  select id into v_member_id from members where coupon_code ilike 'TESTE';

  if v_member_id is null then
    raise exception 'Membro TESTE não encontrado';
  end if;

  for i in 1..17 loop
    insert into sales (member_id, shopify_order_id, coupon_code, gross_amount, sale_date)
    values (v_member_id, 'TEST-' || gen_random_uuid()::text, 'TESTE', 199.90, now())
    on conflict (shopify_order_id) do nothing;
  end loop;
end $$;
