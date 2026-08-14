-- ----------------------------------------------------------------------------
-- Importação única dos cupons/afiliados que já existiam na Shopify ANTES do
-- webhook `discounts/create` estar configurado (esse webhook só cadastra
-- membro automaticamente pra cupom criado DAQUI pra frente). Lista veio do
-- export "discounts_export_1.csv" da Shopify — cupons já existentes no banco
-- são ignorados (on conflict), então dá pra rodar de novo sem duplicar.
--
-- Não entra login (Supabase Auth) aqui — SQL não tem acesso à Auth Admin
-- API. Depois deste push, rode scripts/create-member-logins.mjs pra criar
-- login (com senha temporária) pra todo mundo que ainda não tem.
-- ----------------------------------------------------------------------------
insert into members (name, coupon_code, email)
select code, code, lower(code) || '@m3ntalmadness.com'
from unnest(array[
  'ROXO', 'JOVI', 'KOKOKOKO', 'FANIS', 'NAGAI', 'CAMI', 'GYMANINHA', 'NITTYH',
  'ATLAS', 'DORTTGOLD', 'GAMA', 'PEDRINN', 'FONTES', '.', 'ERIK', 'DABV',
  'BASAGLIA', 'CIENCIA', 'VINS', 'PANCERA', 'MATEUSFIT', 'LIAN', 'VINI',
  'MARCELITY', 'VITORAMPIRES', 'KISTEMANN', 'JULES', 'GABIMAGSAN', 'ALE',
  'ENRICO', 'SZDR', 'BATFIT', 'RAMBO', 'REN', 'GUI', 'NATAN', 'MARCIAPIRES',
  'RUSSEL', 'BRUNINHO', 'CAUAAL', 'GOSTOSO'
]) as code
on conflict (coupon_code) do nothing;
