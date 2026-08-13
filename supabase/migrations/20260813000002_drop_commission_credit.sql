-- ----------------------------------------------------------------------------
-- Remove commission_credit — era baseado num entendimento errado (achei que
-- o crédito devia ser controlado aqui). Na real o R$5K fica no próprio app
-- do Mercado Pago; o painel só precisa mostrar quanto cada um tem a
-- receber e controlar quem já foi pago (cycles.commission_paid, que fica).
-- ----------------------------------------------------------------------------
drop table if exists commission_credit;
