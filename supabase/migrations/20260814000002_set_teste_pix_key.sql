-- ----------------------------------------------------------------------------
-- Chave PIX de teste pro membro TESTE, pra validar o fluxo de envio.
-- ----------------------------------------------------------------------------
update members
set pix_key = 'teste@pix.com', pix_key_type = 'EMAIL'
where coupon_code = 'TESTE';
