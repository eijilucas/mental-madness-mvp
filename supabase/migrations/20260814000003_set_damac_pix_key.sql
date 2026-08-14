-- ----------------------------------------------------------------------------
-- Chave PIX de teste pro membro DAMAC, diferente da do TESTE, pra não
-- colidir com a detecção de saque duplicado do Asaas (mesmo valor + mesma
-- chave em teste manual anterior).
-- ----------------------------------------------------------------------------
update members
set pix_key = 'damac@pix.com', pix_key_type = 'EMAIL'
where coupon_code = 'DAMAC';
