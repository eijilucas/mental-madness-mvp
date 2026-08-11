-- Domínio do e-mail sintético de login trocado pra algo mais curto, a
-- pedido do cliente: de "members.mentalmadnessbasics.internal" para
-- "m3ntalmadness.com".
update members
set email = lower(coupon_code) || '@m3ntalmadness.com'
where email like '%@members.mentalmadnessbasics.internal'
  and is_admin = false;
