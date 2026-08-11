-- Troca os membros mockados de exemplo pelos nomes/cupons reais pedidos.
-- Apaga vendas e ciclo primeiro (nessa ordem) para não disparar o trigger de
-- recálculo depois que o membro já tiver sido removido.
delete from sales where coupon_code in ('ANA10', 'BRUNO10', 'CARLA10', 'DIEGO10');
delete from cycles where member_id in (select id from members where coupon_code in ('ANA10', 'BRUNO10', 'CARLA10', 'DIEGO10'));
delete from members where coupon_code in ('ANA10', 'BRUNO10', 'CARLA10', 'DIEGO10');

insert into members (name, coupon_code, is_admin) values
  ('Vitor Leal',  'LEAL',    false),
  ('Kaynã Grava', 'ERRADO',  false),
  ('Davi',        'PARADISE', false),
  ('Samuel',      'MAOU',    false)
on conflict (coupon_code) do nothing;

-- Mesmas faixas de venda do seed original (3 / 8 / 17 / 33), só trocando o dono.
do $$
declare
  v_member_id uuid;
  v_qty integer;
  v_coupon text;
  v_i integer;
begin
  for v_coupon, v_qty in
    select * from (values
      ('LEAL', 3),
      ('ERRADO', 8),
      ('PARADISE', 17),
      ('MAOU', 33)
    ) as t(coupon, qty)
  loop
    select id into v_member_id from members where coupon_code = v_coupon;

    for v_i in 1..v_qty loop
      insert into sales (member_id, shopify_order_id, coupon_code, gross_amount, sale_date)
      values (
        v_member_id,
        'MOCK-' || v_coupon || '-' || v_i,
        v_coupon,
        round((120 + random() * 300)::numeric, 2),
        date_trunc('month', now()) + ((v_i % 27) || ' days')::interval + (v_i || ' minutes')::interval
      )
      on conflict (shopify_order_id) do nothing;
    end loop;
  end loop;
end;
$$;
