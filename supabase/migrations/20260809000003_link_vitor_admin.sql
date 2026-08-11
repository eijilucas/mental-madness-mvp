-- Vincula o primeiro login de teste (lucas@hinfros.com.br) ao membro admin
-- do seed (cupom VITORMM), para permitir testar o Painel Admin.
update members
set auth_user_id = 'fff73509-3c1e-4c45-9017-48da8c3f53e0',
    email = 'lucas@hinfros.com.br'
where coupon_code = 'VITORMM';
