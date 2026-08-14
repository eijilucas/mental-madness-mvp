-- ----------------------------------------------------------------------------
-- Guarda o ID do desconto na Shopify por loja, pra sincronização de mão
-- dupla: quando o admin cria/edita/exclui um membro no painel, a gente usa
-- esse ID pra criar/renomear/apagar o cupom correspondente lá (em vez de só
-- receber eventos via webhook, que é só entrada). Nullable porque um membro
-- pode ter cupom em só uma das duas lojas, ou nenhuma ainda (membro sem
-- cupom sincronizado, ex: os importados antes dessa feature existir).
-- ----------------------------------------------------------------------------
alter table members add column if not exists shopify_discount_id_basic text;
alter table members add column if not exists shopify_discount_id_exclusivos text;
