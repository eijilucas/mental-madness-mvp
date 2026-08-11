-- Admin pode cadastrar membro novo direto pelo painel (caixa "Adicionar Membro").
drop policy if exists members_insert_admin on members;
create policy members_insert_admin on members
  for insert with check (is_admin_user());
