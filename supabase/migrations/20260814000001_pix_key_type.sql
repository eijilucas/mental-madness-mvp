-- ----------------------------------------------------------------------------
-- Tipo da chave PIX de cada membro — necessário pra API do Asaas (campo
-- pixAddressKeyType). Não dá pra inferir só pelo formato do texto: CPF e
-- telefone com DDD têm os dois 11 dígitos, então precisa ser explícito.
-- ----------------------------------------------------------------------------
alter table members add column if not exists pix_key_type text
  check (pix_key_type in ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'));
