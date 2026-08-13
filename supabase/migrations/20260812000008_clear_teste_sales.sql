-- ----------------------------------------------------------------------------
-- Limpa as vendas de teste do membro TESTE.
-- ----------------------------------------------------------------------------
delete from sales
where coupon_code ilike 'TESTE'
  and shopify_order_id like 'TEST-%';
