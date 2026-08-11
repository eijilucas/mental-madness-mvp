-- Segunda conta admin, para o Lucas continuar com acesso ao Painel Admin
-- independente do login do Vitor.
insert into members (name, email, coupon_code, is_admin, auth_user_id)
values ('Lucas (dev)', 'lucas@hinfros.com.br', 'LUCASADMIN', true, 'fff73509-3c1e-4c45-9017-48da8c3f53e0')
on conflict (coupon_code) do update set auth_user_id = excluded.auth_user_id;
