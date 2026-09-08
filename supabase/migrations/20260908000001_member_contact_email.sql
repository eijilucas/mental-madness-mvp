-- ----------------------------------------------------------------------------
-- E-mail real de contato do afiliado (separado do e-mail sintético de login,
-- ex: teste@m3ntalmadness.com). Usado pra mandar o gift card por e-mail
-- (via Resend) quando ele completa peça(s) -- nullable, o admin preenche na
-- tabela de Membros.
-- ----------------------------------------------------------------------------
alter table members add column if not exists contact_email text;
