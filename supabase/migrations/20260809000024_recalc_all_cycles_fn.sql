create or replace function recalc_all_cycles_for_month(p_cycle_month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not is_admin_user() then
    raise exception 'Só admin pode recalcular ciclos em massa';
  end if;

  for r in select distinct member_id from cycles where cycle_month = p_cycle_month
  loop
    perform recalc_member_cycle(r.member_id, p_cycle_month);
  end loop;
end;
$$;

grant execute on function recalc_all_cycles_for_month(date) to authenticated;
