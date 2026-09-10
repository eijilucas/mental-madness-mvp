-- ----------------------------------------------------------------------------
-- Troca a recompensa por meta de "peças físicas" pra "gift card por valor".
--
-- Marcos ACUMULATIVOS por vendas no mês (soma ao longo do mês, um único
-- gift card no fechamento):
--   3 vendas  -> R$ 100
--   5 vendas  -> + R$ 150
--   7 vendas  -> + R$ 150
--   10 vendas -> + R$ 250
--   15 vendas -> + R$ 400   (trava aqui: 15+ = R$ 1.050 no total)
--
-- Comissão fixa de 5% (a partir de 6 vendas) continua exatamente igual.
-- ----------------------------------------------------------------------------

-- cycles: sai peças, entra gift card
alter table cycles drop column if exists pieces_earned;
alter table cycles drop column if exists pieces_delivered_count;
alter table cycles drop column if exists pieces_delivered_at;

alter table cycles add column if not exists gift_card_value numeric(12,2) not null default 0;
alter table cycles add column if not exists gift_card_sent boolean not null default false;
alter table cycles add column if not exists gift_card_sent_at timestamptz;
alter table cycles add column if not exists gift_card_code text;
alter table cycles add column if not exists gift_card_store text check (gift_card_store in ('basic', 'exclusivos'));

-- app_config: drop_piece_count vira obsoleto
alter table app_config drop column if exists drop_piece_count;

-- ----------------------------------------------------------------------------
-- calculate_cycle_rewards: agora devolve gift_card_value + commission_amount
-- ----------------------------------------------------------------------------
drop function if exists calculate_cycle_rewards(integer, numeric, numeric);

create or replace function calculate_cycle_rewards(
  p_sales_count integer,
  p_gross_total numeric,
  p_net_total numeric
)
returns table (gift_card_value numeric, commission_amount numeric)
language plpgsql
stable
as $$
declare
  v_base text;
  v_rate numeric;
  v_gift_card numeric := 0;
  v_commission numeric := 0;
  v_commission_base_amount numeric;
begin
  select commission_base, commission_rate
    into v_base, v_rate
    from app_config where id = 1;

  v_commission_base_amount := case when v_base = 'net' then coalesce(p_net_total, 0) else p_gross_total end;

  -- Gift card acumulativo
  if p_sales_count >= 3 then v_gift_card := v_gift_card + 100; end if;
  if p_sales_count >= 5 then v_gift_card := v_gift_card + 150; end if;
  if p_sales_count >= 7 then v_gift_card := v_gift_card + 150; end if;
  if p_sales_count >= 10 then v_gift_card := v_gift_card + 250; end if;
  if p_sales_count >= 15 then v_gift_card := v_gift_card + 400; end if;

  -- Comissão: 5% fixo a partir de 6 vendas, sobre o valor do mês inteiro
  v_commission := case when p_sales_count >= 6 then round(v_commission_base_amount * v_rate, 2) else 0 end;

  return query select v_gift_card, v_commission;
end;
$$;

-- ----------------------------------------------------------------------------
-- recalc_member_cycle: escreve gift_card_value em vez de pieces_earned
-- (gift_card_sent / _at / _code / _store NÃO são mexidos pelo recálculo --
-- são controle de envio, igual commission_paid)
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

  insert into cycles (member_id, cycle_month, sales_count, gross_total, net_total, gift_card_value, commission_amount, updated_at)
  values (p_member_id, p_cycle_month, v_count, v_gross, v_net, v_rewards.gift_card_value, v_rewards.commission_amount, now())
  on conflict (member_id, cycle_month)
  do update set
    sales_count = excluded.sales_count,
    gross_total = excluded.gross_total,
    net_total = excluded.net_total,
    gift_card_value = excluded.gift_card_value,
    commission_amount = excluded.commission_amount,
    updated_at = now();
end;
$$;

-- Recalcula todos os ciclos existentes com a regra nova (gift_card_value
-- estava zerado nas linhas antigas; comissão não muda mas roda junto).
do $$
declare
  r record;
begin
  for r in select distinct member_id, cycle_month from cycles loop
    perform recalc_member_cycle(r.member_id, r.cycle_month);
  end loop;
end $$;
