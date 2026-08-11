do $$
declare
  v_count integer;
begin
  select count(*) into v_count from members where is_admin = false;
  if v_count <> 42 then
    raise exception 'VERIFY FAILED: expected 42 non-admin members, got %', v_count;
  end if;
end;
$$;
