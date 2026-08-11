-- Adiciona sale_items (produtos vendidos por venda) + backfill de produtos
-- mockados nas vendas do seed que já existem.

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_sale_items_sale_id on sale_items (sale_id);

alter table sale_items enable row level security;

drop policy if exists sale_items_select_own_or_admin on sale_items;
create policy sale_items_select_own_or_admin on sale_items
  for select using (
    sale_id in (
      select id from sales where member_id in (select id from members where auth_user_id = auth.uid())
    )
    or is_admin_user()
  );

alter publication supabase_realtime add table sale_items;

-- Backfill: dá 1 ou 2 produtos aleatórios do catálogo real para as vendas
-- mockadas que já existem no banco (seed anterior, antes de sale_items existir).
do $$
declare
  v_sale record;
  v_products text[] := array[
    'Calça Reta Stitched',
    'Camiseta De Compressão Vermelha',
    'Pump Cover Dupla Camada',
    'Moletom Careca Stitched',
    'Regata Boxy',
    'Camiseta Oversized Black/White Manga Longa',
    'Regata Canelada',
    'Camiseta Oversized Black/White'
  ];
  v_item_count integer;
  v_j integer;
begin
  for v_sale in select id from sales where id not in (select distinct sale_id from sale_items)
  loop
    v_item_count := 1 + floor(random() * 2)::integer;
    for v_j in 1..v_item_count loop
      insert into sale_items (sale_id, product_name, quantity)
      values (v_sale.id, v_products[1 + floor(random() * array_length(v_products, 1))::integer], 1);
    end loop;
  end loop;
end;
$$;
