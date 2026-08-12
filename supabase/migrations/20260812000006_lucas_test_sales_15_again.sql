-- ----------------------------------------------------------------------------
-- 15 vendas de teste pro LUCASADMIN de novo, pra conferir visualmente o
-- efeito de brilho na logo quando dropCompleted = true.
-- ----------------------------------------------------------------------------
do $$
declare
  v_member_id uuid;
  i integer;
begin
  select id into v_member_id from members where coupon_code = 'LUCASADMIN';

  if v_member_id is null then
    raise exception 'Membro LUCASADMIN não encontrado';
  end if;

  for i in 1..15 loop
    insert into sales (member_id, shopify_order_id, coupon_code, gross_amount, sale_date)
    values (v_member_id, 'TEST-' || gen_random_uuid()::text, 'LUCASADMIN', 199.90, now())
    on conflict (shopify_order_id) do nothing;
  end loop;
end $$;
