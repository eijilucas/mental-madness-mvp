-- Checagem pontual (não falha o deploy, só documenta o estado do seed).
do $$
declare
  v_sales_count integer;
  v_items_count integer;
begin
  select count(*) into v_sales_count from sales;
  select count(*) into v_items_count from sale_items;
  if v_items_count = 0 and v_sales_count > 0 then
    raise exception 'VERIFY FAILED: sales=% sale_items=%', v_sales_count, v_items_count;
  end if;
end;
$$;
