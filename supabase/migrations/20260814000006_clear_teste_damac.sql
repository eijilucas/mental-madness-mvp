-- ----------------------------------------------------------------------------
-- Zera as vendas de teste do TESTE e do DAMAC.
-- ----------------------------------------------------------------------------
delete from sales
where coupon_code in ('TESTE', 'DAMAC');
