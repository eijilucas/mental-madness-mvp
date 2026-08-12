-- ----------------------------------------------------------------------------
-- Mais 10 vendas de teste pro Lucas (LUCASADMIN), completando 15 no total
-- neste ciclo — pra testar o estado "peças do drop garantidas neste mês" na
-- barra "Meta até a Próxima Peça" (bate em piecesEarned >= drop_piece_count).
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

  for i in 1..10 loop
    insert into sales (member_id, shopify_order_id, coupon_code, gross_amount, sale_date)
    values (v_member_id, 'TEST-' || gen_random_uuid()::text, 'LUCASADMIN', 199.90, now())
    on conflict (shopify_order_id) do nothing;
  end loop;
end $$;
