-- Checagem pontual pós-limpeza (não altera nada, só valida).
do $$
declare
  v_sales integer;
  v_non_admin_members integer;
  v_admin_members integer;
begin
  select count(*) into v_sales from sales;
  select count(*) into v_non_admin_members from members where is_admin = false;
  select count(*) into v_admin_members from members where is_admin = true;

  if v_sales <> 0 or v_non_admin_members <> 0 or v_admin_members = 0 then
    raise exception 'VERIFY FAILED: sales=% non_admin_members=% admin_members=%', v_sales, v_non_admin_members, v_admin_members;
  end if;
end;
$$;
