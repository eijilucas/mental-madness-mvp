-- ----------------------------------------------------------------------------
-- Limpa as vendas de teste do LUCASADMIN (as 3 migrations anteriores) —
-- só apaga o que tem prefixo TEST- em shopify_order_id, não mexe em venda
-- real nenhuma. O trigger recalcula o ciclo pra 0 automaticamente.
-- ----------------------------------------------------------------------------
delete from sales
where coupon_code = 'LUCASADMIN'
  and shopify_order_id like 'TEST-%';
