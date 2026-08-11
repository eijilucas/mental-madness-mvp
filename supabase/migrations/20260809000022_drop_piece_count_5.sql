-- Drop atual tem 5 peças (varia por drop, não é sempre o catálogo geral).
update app_config set drop_piece_count = 5, updated_at = now() where id = 1;

-- Recalcula ciclos existentes com a contagem nova.
do $$
declare
  r record;
begin
  for r in select distinct member_id, cycle_month from cycles loop
    perform recalc_member_cycle(r.member_id, r.cycle_month);
  end loop;
end;
$$;
