-- Login do Vitor (admin) foi perdido (conta apagada do Supabase Auth sem
-- querer). A linha em `members` continua intacta, só precisa de um e-mail
-- pra recriar a conta.
update members set email = 'vitor@m3ntalmadness.com' where coupon_code = 'VITORMM';
