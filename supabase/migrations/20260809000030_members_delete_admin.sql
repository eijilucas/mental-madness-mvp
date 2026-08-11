-- Admin pode apagar membro de vez (botão "Excluir" no painel — cascata em
-- sales/sale_items/cycles, é permanente).
drop policy if exists members_delete_admin on members;
create policy members_delete_admin on members
  for delete using (is_admin_user());
