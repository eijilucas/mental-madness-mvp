-- ----------------------------------------------------------------------------
-- Mais 20 vendas de teste pro Lucas (LUCASADMIN), completando 35 no total
-- neste ciclo — pra ver o marco 30+ e a barra vitalícia com mais sequências
-- completas.
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

  for i in 1..20 loop
    insert into sales (member_id, shopify_order_id, coupon_code, gross_amount, sale_date)
    values (v_member_id, 'TEST-' || gen_random_uuid()::text, 'LUCASADMIN', 199.90, now())
    on conflict (shopify_order_id) do nothing;
  end loop;
end $$;
