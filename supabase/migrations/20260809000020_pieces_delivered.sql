-- Marca de "peças entregues" por ciclo (controle manual do admin, não mexido
-- pelo trigger de recálculo) + policy de update pra admin poder togglar.

alter table cycles add column if not exists pieces_delivered boolean not null default false;
alter table cycles add column if not exists pieces_delivered_at timestamptz;

drop policy if exists cycles_update_admin on cycles;
create policy cycles_update_admin on cycles
  for update using (is_admin_user()) with check (is_admin_user());
