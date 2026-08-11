-- ============================================================================
-- Seed de dados mockados — Mental Madness
-- Rode DEPOIS do schema.sql. Não depende da Shopify: simula vendas via
-- INSERT direto em `sales`, exatamente como a Edge Function faria.
--
-- Cria 5 membros em faixas diferentes do ciclo mensal para testar o painel:
--   Ana Beatriz  -> 3 vendas   (abaixo do primeiro marco)
--   Bruno Costa  -> 8 vendas   (1 peça, a caminho da 2ª)
--   Carla Souza  -> 17 vendas  (3 peças, tier de 15)
--   Diego Alves  -> 33 vendas  (3 peças + comissão de 10%, tier de 30)
--   Vitor Pires  -> admin (não é vendedor, só enxerga o painel geral)
-- ============================================================================

insert into members (name, email, coupon_code, is_admin) values
  ('Ana Beatriz',  'ana.beatriz@example.com',  'ANA10',   false),
  ('Bruno Costa',  'bruno.costa@example.com',  'BRUNO10', false),
  ('Carla Souza',  'carla.souza@example.com',  'CARLA10', false),
  ('Diego Alves',  'diego.alves@example.com',  'DIEGO10', false),
  ('Vitor Pires',  'vitor.pires@example.com',  'VITORMM', true)
on conflict (coupon_code) do nothing;

-- Gera N vendas no mês corrente para o membro do cupom informado, com valor
-- bruto pseudo-aleatório entre R$120 e R$420, espalhadas nos últimos dias.
do $$
declare
  v_member_id uuid;
  v_qty integer;
  v_coupon text;
  v_i integer;
begin
  for v_coupon, v_qty in
    select * from (values
      ('ANA10', 3),
      ('BRUNO10', 8),
      ('CARLA10', 17),
      ('DIEGO10', 33)
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

-- Os totais de `cycles` já ficam corretos automaticamente (trigger em sales).
-- Para conferir:
-- select m.name, m.coupon_code, c.sales_count, c.gross_total, c.pieces_earned, c.commission_amount
-- from cycles c join members m on m.id = c.member_id
-- order by c.sales_count desc;
