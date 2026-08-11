-- ============================================================================
-- Mental Madness — Sistema de Comissionamento por Cupom
-- Schema completo para Supabase (Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase, ou via:
--   npx supabase db push
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTENSÕES
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- TABELA: members
-- Um membro (afiliado) da marca. `auth_user_id` é ligado ao Supabase Auth
-- somente depois que o membro cria login — por isso é nullable, permitindo
-- cadastrar/seedar membros (e o cupom deles) antes de terem conta.
-- ----------------------------------------------------------------------------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text unique,
  coupon_code text not null unique,
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_members_coupon_code on members (lower(coupon_code));
create index if not exists idx_members_auth_user_id on members (auth_user_id);

-- ----------------------------------------------------------------------------
-- TABELA: sales
-- Uma venda Shopify feita com o cupom de um membro. `shopify_order_id` é
-- único para tornar a inserção via webhook idempotente (Shopify pode
-- reenviar o mesmo webhook mais de uma vez).
-- ----------------------------------------------------------------------------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  shopify_order_id text unique,
  coupon_code text not null,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  net_amount numeric(12,2), -- reservado para quando a comissão puder passar a ser sobre valor líquido
  sale_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_member_id on sales (member_id);
create index if not exists idx_sales_sale_date on sales (sale_date);

-- ----------------------------------------------------------------------------
-- TABELA: cycles
-- Um "ciclo" = a foto do mês (reseta todo dia 1) de um membro: quantas
-- vendas, valor bruto/líquido total, peças conquistadas e comissão
-- acumulada. É recalculada automaticamente pelo trigger em `sales`.
-- ----------------------------------------------------------------------------
create table if not exists cycles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  cycle_month date not null, -- sempre o dia 1 do mês, ex: 2026-08-01
  sales_count integer not null default 0,
  gross_total numeric(12,2) not null default 0,
  net_total numeric(12,2) not null default 0,
  pieces_earned integer not null default 0,
  commission_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (member_id, cycle_month)
);

create index if not exists idx_cycles_member_id on cycles (member_id);
create index if not exists idx_cycles_cycle_month on cycles (cycle_month);

-- ----------------------------------------------------------------------------
-- TABELA: app_config
-- Configuração global de regras de negócio. Linha única (id = 1).
-- Existe para que os dois pontos em aberto do negócio possam ser trocados
-- sem alterar código/deploy: basta um UPDATE nesta tabela.
-- ----------------------------------------------------------------------------
create table if not exists app_config (
  id smallint primary key default 1 check (id = 1),
  -- PONTO EM ABERTO #1 (marca > 30 vendas):
  -- true  = o benefício de 15 vendas (3 peças) SOMA com a comissão de 30 vendas
  -- false = a comissão de 30 vendas SUBSTITUI o benefício de 15 vendas (peças = 0)
  -- Decisão provisória do cliente: SOMA (true). Ver calculate_cycle_rewards().
  combine_30_with_15_benefit boolean not null default true,
  -- PONTO EM ABERTO #2: base de cálculo da comissão.
  -- 'gross' = sobre o valor bruto vendido no mês (decisão provisória do cliente)
  -- 'net'   = sobre o valor líquido (requer preencher sales.net_amount)
  commission_base text not null default 'gross' check (commission_base in ('gross', 'net')),
  commission_rate numeric(5,4) not null default 0.10, -- 10% ao passar de 30 vendas
  updated_at timestamptz not null default now()
);

insert into app_config (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- FUNÇÃO: calculate_cycle_rewards
-- Núcleo da regra de negócio. Isolada nesta função para ser fácil de trocar
-- caso as regras mudem — nada mais no schema precisa ser alterado.
--
-- Regras (ver README.md para a explicação completa e os pontos em aberto):
--   5 vendas  -> 1 peça (a cada 5, enquanto < 15)
--   15 vendas -> 3 peças (tier fixo, substitui a contagem "a cada 5")
--   30 vendas -> comissão de `commission_rate` sobre o valor vendido no mês
--                (bruto ou líquido, conforme app_config.commission_base)
-- ----------------------------------------------------------------------------
create or replace function calculate_cycle_rewards(
  p_sales_count integer,
  p_gross_total numeric,
  p_net_total numeric
)
returns table (pieces_earned integer, commission_amount numeric)
language plpgsql
stable
as $$
declare
  v_combine boolean;
  v_base text;
  v_rate numeric;
  v_pieces integer := 0;
  v_commission numeric := 0;
  v_commission_base_amount numeric;
begin
  select combine_30_with_15_benefit, commission_base, commission_rate
    into v_combine, v_base, v_rate
    from app_config where id = 1;

  v_commission_base_amount := case when v_base = 'net' then coalesce(p_net_total, 0) else p_gross_total end;

  if p_sales_count >= 30 then
    v_commission := round(v_commission_base_amount * v_rate, 2);
    -- PONTO EM ABERTO #1: soma (default) vs. substitui — ver app_config.combine_30_with_15_benefit
    if v_combine then
      v_pieces := 3;
    else
      v_pieces := 0;
    end if;
  elsif p_sales_count >= 15 then
    v_pieces := 3;
    v_commission := 0;
  elsif p_sales_count >= 5 then
    v_pieces := floor(p_sales_count / 5)::integer;
    v_commission := 0;
  else
    v_pieces := 0;
    v_commission := 0;
  end if;

  return query select v_pieces, v_commission;
end;
$$;

-- ----------------------------------------------------------------------------
-- FUNÇÃO: recalc_member_cycle
-- Recalcula (upsert) a linha de `cycles` de um membro para um dado mês,
-- a partir do estado atual de `sales`.
-- ----------------------------------------------------------------------------
create or replace function recalc_member_cycle(p_member_id uuid, p_cycle_month date)
returns void
language plpgsql
as $$
declare
  v_count integer;
  v_gross numeric;
  v_net numeric;
  v_rewards record;
begin
  select count(*), coalesce(sum(gross_amount), 0), coalesce(sum(net_amount), 0)
    into v_count, v_gross, v_net
    from sales
    where member_id = p_member_id
      and date_trunc('month', sale_date)::date = p_cycle_month;

  select * into v_rewards from calculate_cycle_rewards(v_count, v_gross, v_net);

  insert into cycles (member_id, cycle_month, sales_count, gross_total, net_total, pieces_earned, commission_amount, updated_at)
  values (p_member_id, p_cycle_month, v_count, v_gross, v_net, v_rewards.pieces_earned, v_rewards.commission_amount, now())
  on conflict (member_id, cycle_month)
  do update set
    sales_count = excluded.sales_count,
    gross_total = excluded.gross_total,
    net_total = excluded.net_total,
    pieces_earned = excluded.pieces_earned,
    commission_amount = excluded.commission_amount,
    updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- TRIGGER: recalcula o ciclo sempre que uma venda é inserida/alterada/apagada
-- ----------------------------------------------------------------------------
create or replace function trg_sales_recalc_cycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform recalc_member_cycle(old.member_id, date_trunc('month', old.sale_date)::date);
    return old;
  end if;

  perform recalc_member_cycle(new.member_id, date_trunc('month', new.sale_date)::date);

  if tg_op = 'UPDATE' and (old.member_id <> new.member_id or date_trunc('month', old.sale_date) <> date_trunc('month', new.sale_date)) then
    perform recalc_member_cycle(old.member_id, date_trunc('month', old.sale_date)::date);
  end if;

  return new;
end;
$$;

drop trigger if exists sales_after_change on sales;
create trigger sales_after_change
after insert or update or delete on sales
for each row execute function trg_sales_recalc_cycle();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table members enable row level security;
alter table sales enable row level security;
alter table cycles enable row level security;
alter table app_config enable row level security;

-- helper: é o membro admin logado?
create or replace function is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from members where auth_user_id = auth.uid()), false);
$$;

-- members: cada membro vê a própria linha; admin vê todas
drop policy if exists members_select_own_or_admin on members;
create policy members_select_own_or_admin on members
  for select using (auth_user_id = auth.uid() or is_admin_user());

-- sales: cada membro vê só as próprias vendas; admin vê todas
drop policy if exists sales_select_own_or_admin on sales;
create policy sales_select_own_or_admin on sales
  for select using (
    member_id in (select id from members where auth_user_id = auth.uid())
    or is_admin_user()
  );

-- cycles: idem
drop policy if exists cycles_select_own_or_admin on cycles;
create policy cycles_select_own_or_admin on cycles
  for select using (
    member_id in (select id from members where auth_user_id = auth.uid())
    or is_admin_user()
  );

-- app_config: leitura liberada para qualquer usuário autenticado (só exibição)
drop policy if exists app_config_select_authenticated on app_config;
create policy app_config_select_authenticated on app_config
  for select using (auth.role() = 'authenticated');

-- Nenhuma policy de insert/update/delete é criada para os membros comuns:
-- toda escrita em sales/cycles acontece via Service Role (Edge Function do
-- webhook Shopify, ou seed), nunca diretamente pelo cliente autenticado.

-- ----------------------------------------------------------------------------
-- REALTIME
-- Habilita os eventos em tempo real usados pelo painel (sales e cycles).
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table sales;
alter publication supabase_realtime add table cycles;
