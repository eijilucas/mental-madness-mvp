-- ============================================================================
-- Seed de dados mockados — Mental Madness
-- Rode DEPOIS do schema.sql. Não depende da Shopify: simula vendas via
-- INSERT direto em `sales`/`sale_items`, exatamente como a Edge Function faria.
--
-- Cria 5 membros em faixas diferentes do ciclo mensal para testar o painel:
--   Vitor Leal   -> 3 vendas   (abaixo do primeiro marco)
--   Kaynã Grava  -> 8 vendas   (1 peça, a caminho da 2ª)
--   Davi         -> 17 vendas  (3 peças, tier de 15)
--   Samuel       -> 33 vendas  (3 peças + comissão de 10%, tier de 30)
--   Vitor Pires  -> admin (não é vendedor, só enxerga o painel geral)
--
-- Os produtos usados vêm do catálogo real da loja (mentalmadnessbasics.com).
-- ============================================================================

insert into members (name, coupon_code, is_admin) values
  ('Vitor Leal',  'LEAL',     false),
  ('Kaynã Grava', 'ERRADO',   false),
  ('Davi',        'PARADISE', false),
  ('Samuel',      'MAOU',     false),
  ('Vitor Pires', 'VITORMM',  true)
on conflict (coupon_code) do nothing;

-- Gera N vendas no mês corrente para o membro do cupom informado, com valor
-- bruto pseudo-aleatório entre R$120 e R$420, espalhadas nos últimos dias, e
-- 1 ou 2 produtos aleatórios do catálogo por venda.
do $$
declare
  v_member_id uuid;
  v_sale_id uuid;
  v_qty integer;
  v_coupon text;
  v_i integer;
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
  v_item_count integer;
  v_j integer;
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
      on conflict (shopify_order_id) do nothing
      returning id into v_sale_id;

      if v_sale_id is not null then
        v_item_count := 1 + floor(random() * 2)::integer; -- 1 ou 2 itens
        for v_j in 1..v_item_count loop
          insert into sale_items (sale_id, product_name, quantity)
          values (v_sale_id, v_products[1 + floor(random() * array_length(v_products, 1))::integer], 1);
        end loop;
      end if;

      v_sale_id := null;
    end loop;
  end loop;
end;
$$;

-- Os totais de `cycles` já ficam corretos automaticamente (trigger em sales).
-- Para conferir:
-- select m.name, m.coupon_code, c.sales_count, c.gross_total, c.pieces_earned, c.commission_amount
-- from cycles c join members m on m.id = c.member_id
-- order by c.sales_count desc;
