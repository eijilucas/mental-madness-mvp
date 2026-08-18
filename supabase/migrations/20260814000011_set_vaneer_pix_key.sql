-- ----------------------------------------------------------------------------
-- VANEER não existia no sistema na hora da importação em massa das chaves
-- PIX (20260814000010) -- foi cadastrado depois (provavelmente pelo webhook
-- discounts/create, cupom novo criado na Shopify). Completa a chave que
-- tinha ficado de fora.
-- ----------------------------------------------------------------------------
update members set pix_key = 'vanezem@gmail.com', pix_key_type = 'EMAIL'
where coupon_code ilike 'VANEER';
