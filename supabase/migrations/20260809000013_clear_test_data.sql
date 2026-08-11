-- Limpa a base de dados de teste pra preparar o ambiente pro webhook real da
-- Shopify. Remove todas as vendas mockadas (sale_items e cycles são
-- recalculados/cascateados automaticamente) e os membros de teste — mantém
-- as contas admin (Lucas e Vitor) e as configurações de negócio em app_config.

delete from sales;
delete from members where is_admin = false;
