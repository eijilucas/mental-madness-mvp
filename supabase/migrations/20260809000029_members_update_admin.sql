-- Admin pode editar membro existente (lápis de editar na tabela do painel).
drop policy if exists members_update_admin on members;
create policy members_update_admin on members
  for update using (is_admin_user()) with check (is_admin_user());
