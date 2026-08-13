-- ----------------------------------------------------------------------------
-- Base pro pagamento de comissão via PIX (dia 5, crédito compartilhado que o
-- Vitor carrega). Por enquanto sem integração real com Mercado Pago — o
-- admin marca manualmente como pago (faz o PIX pelo app do MP) e o sistema
-- só controla saldo/histórico. Quando o Access Token do MP entrar, o mesmo
-- botão passa a chamar a API de verdade em vez de só marcar.
-- ----------------------------------------------------------------------------

-- chave PIX de cada membro — nullable, admin preenche pelo painel
alter table members add column if not exists pix_key text;

-- status de pagamento da comissão de cada ciclo (mês) de cada membro
alter table cycles add column if not exists commission_paid boolean not null default false;
alter table cycles add column if not exists commission_paid_at timestamptz;

-- crédito compartilhado que o Vitor carrega pra pagar todo mundo — linha única (id = 1)
create table if not exists commission_credit (
  id smallint primary key default 1 check (id = 1),
  balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into commission_credit (id) values (1) on conflict (id) do nothing;

alter table commission_credit enable row level security;

-- leitura liberada pra qualquer autenticado (mesmo padrão de app_config —
-- só exibição, não é dado sensível a ponto de esconder de afiliado)
drop policy if exists commission_credit_select_authenticated on commission_credit;
create policy commission_credit_select_authenticated on commission_credit
  for select using (auth.role() = 'authenticated');

-- só admin recarrega/ajusta o crédito
drop policy if exists commission_credit_update_admin on commission_credit;
create policy commission_credit_update_admin on commission_credit
  for update using (is_admin_user()) with check (is_admin_user());

alter publication supabase_realtime add table commission_credit;
