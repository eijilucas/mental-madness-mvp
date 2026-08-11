-- Vincula a conta real do Vitor (vitor@mental.com.br) ao membro admin do
-- seed (cupom VITORMM), substituindo o login de teste do Lucas.
update members
set auth_user_id = (select id from auth.users where email = 'vitor@mental.com.br'),
    email = 'vitor@mental.com.br'
where coupon_code = 'VITORMM';
