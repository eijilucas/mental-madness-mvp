-- ----------------------------------------------------------------------------
-- Chave PIX aleatória (EVP) de verdade, criada na própria conta sandbox do
-- Asaas via API, pro membro DAMAC — a "damac@pix.com" inventada não existia
-- em lugar nenhum (nem no sandbox), por isso a transferência não achava a
-- chave.
-- ----------------------------------------------------------------------------
update members
set pix_key = '98b876d8-8709-42b5-a7ff-f18c637cdcc2', pix_key_type = 'EVP'
where coupon_code = 'DAMAC';
