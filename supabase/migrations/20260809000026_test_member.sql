-- Membro de teste pra validar o webhook da Shopify. Cupom "TESTE" — use esse
-- cupom num pedido de teste na Shopify (ou no "Send test notification" do
-- webhook) e confira se a venda aparece pra ele no painel admin.
insert into members (name, coupon_code) values ('Teste Webhook', 'TESTE')
on conflict (coupon_code) do nothing;
