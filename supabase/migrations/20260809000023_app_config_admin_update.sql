-- Admin pode editar app_config direto pelo painel (seção "Configurações").
drop policy if exists app_config_update_admin on app_config;
create policy app_config_update_admin on app_config
  for update using (is_admin_user()) with check (is_admin_user());
