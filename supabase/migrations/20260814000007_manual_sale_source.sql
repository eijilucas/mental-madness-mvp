-- ----------------------------------------------------------------------------
-- Adiciona `source` em `sales` pra distinguir venda vinda do webhook Shopify
-- de venda lançada manualmente pelo admin (pedido fechado por WhatsApp, fora
-- da Shopify). Default 'shopify' porque todas as vendas existentes vieram de
-- lá.
-- ----------------------------------------------------------------------------
alter table sales add column if not exists source text not null default 'shopify' check (source in ('shopify', 'manual'));
