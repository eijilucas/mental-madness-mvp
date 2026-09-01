-- Suporte a vendas registradas automaticamente pelo sistema de Vendas
-- Externas (mental-madness-vendas-externas) quando um pedido usa cupom de
-- afiliado. `external_order_id` é o id do pedido no outro sistema —
-- garante idempotência (mesmo pedido nunca gera duas vendas aqui, mesmo se
-- a chamada for repetida).

alter table sales add column external_order_id uuid;
create unique index sales_external_order_id_idx on sales (external_order_id) where external_order_id is not null;
