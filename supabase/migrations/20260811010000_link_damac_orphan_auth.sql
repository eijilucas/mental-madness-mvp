-- ----------------------------------------------------------------------------
-- Corrige o membro Damac (cupom DAMAC): a conta de Auth já existia
-- (damac@m3ntalmadness.com) mas o vínculo members.auth_user_id ficou nulo —
-- a etapa de "vincular" da function create-member-login deve ter falhado
-- depois de criar a conta. Isso fazia "Criar login" tentar de novo e a
-- Supabase Auth recusar por e-mail já cadastrado.
-- ----------------------------------------------------------------------------
update members
set auth_user_id = '8826a1d9-eb15-45a8-95e2-75cff8086c10'
where coupon_code = 'DAMAC' and auth_user_id is null;
