-- Login por usuário (cupom) em vez de e-mail real: preenche um e-mail
-- sintético e determinístico pra cada membro sem e-mail, no domínio
-- reservado .internal (nunca resolve na internet de verdade — RFC 9476).
-- O Login.tsx monta esse mesmo formato a partir do cupom digitado, então não
-- precisa consultar o banco antes de autenticar.
update members
set email = lower(coupon_code) || '@members.mentalmadnessbasics.internal'
where email is null and is_admin = false;
