-- Suporte a vendas registradas automaticamente pelo sistema de Vendas
-- Externas (mental-madness-vendas-externas) quando um pedido usa cupom de
-- afiliado. `external_order_id` é o id do pedido no outro sistema —
-- garante idempotência (mesmo pedido nunca gera duas vendas aqui, mesmo se
-- a chamada for repetida).
--
-- NOTA: essa migration já tinha sido aplicada direto em produção por outro
-- sistema/sessão antes de existir aqui no repo -- esse arquivo só
-- reconstitui o histórico local pra bater com o remoto (mesmo texto exato
-- que já rodou, buscado via `supabase_migrations.schema_migrations`).

alter table sales add column external_order_id uuid;
