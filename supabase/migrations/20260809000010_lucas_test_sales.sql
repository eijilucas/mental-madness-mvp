-- Vendas de teste pro Lucas (LUCASADMIN) ver a barra de progresso entre os
-- marcos de 5 e 15. Fica marcado como MOCK-* pra ficar fácil de limpar depois.
do $$
declare
  v_member_id uuid;
  v_sale_id uuid;
  v_products text[] := array[
    'Calça Reta Stitched',
    'Camiseta De Compressão Vermelha',
    'Pump Cover Dupla Camada',
    'Moletom Careca Stitched',
    'Regata Boxy',
    'Camiseta Oversized Black/White Manga Longa',
    'Regata Canelada',
    'Camiseta Oversized Black/White'
  ];
  v_i integer;
begin
  select id into v_member_id from members where coupon_code = 'LUCASADMIN';

  for v_i in 1..13 loop
    insert into sales (member_id, shopify_order_id, coupon_code, gross_amount, sale_date)
    values (
      v_member_id,
      'MOCK-LUCASADMIN-' || v_i,
      'LUCASADMIN',
      round((120 + random() * 300)::numeric, 2),
      date_trunc('month', now()) + ((v_i % 27) || ' days')::interval + (v_i || ' minutes')::interval
    )
    on conflict (shopify_order_id) do nothing
    returning id into v_sale_id;

    if v_sale_id is not null then
      insert into sale_items (sale_id, product_name, quantity)
      values (v_sale_id, v_products[1 + floor(random() * array_length(v_products, 1))::integer], 1);
    end if;

    v_sale_id := null;
  end loop;
end;
$$;
