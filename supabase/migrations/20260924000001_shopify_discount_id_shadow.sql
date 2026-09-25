-- ----------------------------------------------------------------------------
-- Terceira loja Shopify (Shadow of the Fallen, zu1bmt-6k.myshopify.com) ganha
-- sync de cupom de afiliado igual Basic/Exclusivos já têm -- ver
-- 20260814000009_shopify_discount_ids.sql pro raciocínio original (mesma
-- coisa, coluna nova pra loja nova).
-- ----------------------------------------------------------------------------
alter table members add column if not exists shopify_discount_id_shadow text;
