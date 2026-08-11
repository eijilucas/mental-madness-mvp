# Mental Madness — Painel de Comissionamento por Cupom

MVP do sistema de comissionamento de afiliados da Mental Madness. Membros têm
um cupom próprio na Shopify; cada venda com o cupom conta para o ciclo mensal
do membro (reseta todo dia 1) e gera peças de roupa e/ou comissão conforme as
faixas do mês.

## Stack

- **Frontend:** React + TypeScript (Vite), React Router
- **Backend/banco:** Supabase (Postgres + Auth + Realtime)
- **Tempo real:** Supabase Realtime (subscription nas tabelas `sales` e
  `cycles` — sem polling)
- **Integração Shopify:** Supabase Edge Function (`shopify-webhook`), pronta
  para plugar, sem credenciais reais configuradas ainda

## Regra de negócio (ciclo mensal, reseta todo dia 1)

| Vendas no mês | Recompensa |
|---|---|
| a cada 5 vendas (até 15) | 1 peça de roupa |
| passando de 15 | todas as peças do drop atual + 5% de comissão sobre o valor vendido no mês |

> Atualizado em 2026-08-09: antes, só quem passava de 30 vendas ganhava
> comissão (10%), e o prêmio de peças era um número fixo (3). O cliente
> decidiu simplificar duas coisas: (1) a comissão de 5% já entra a partir de
> 15 vendas, sem taxa maior a partir de 30 (30 continua marcado no painel só
> por fazer parte da identidade visual aprovada, mas não muda mais o
> prêmio); (2) o prêmio de peças passa a ser "uma unidade de cada produto
> ativo no drop atual" em vez de um número fixo.

Toda a lógica está isolada na função SQL `calculate_cycle_rewards` em
[`schema.sql`](schema.sql) — é o único lugar que precisa mudar se a regra
mudar de novo.

### Configurações editáveis pelo painel admin

A seção **"Configurações"**, no final do painel admin, deixa editar direto
pela tela (sem SQL, sem deploy):

- **Peças do drop atual** — varia de drop pra drop (geralmente 3 a 5 peças,
  não é o catálogo geral da loja). Só admin pode editar
  (`app_config.drop_piece_count`, RLS testado). Como o MVP ainda não
  sincroniza isso com a Shopify automaticamente, alguém precisa atualizar
  esse número toda vez que o drop mudar.
- **Comissão (%)** — taxa aplicada a partir de 15 vendas
  (`app_config.commission_rate`).

Ao salvar, o painel chama a função `recalc_all_cycles_for_month` (RPC, só
admin) que recalcula na hora os ciclos do mês selecionado com a regra nova —
sem isso, a mudança só valeria a partir da próxima venda de cada membro.

### Ponto em aberto (sem UI ainda, só SQL)

**Comissão sobre valor bruto ou líquido?**
Controlado por `app_config.commission_base` (`'gross'` ou `'net'`).
Default atual: **bruto** (`'gross'`), decisão provisória do cliente. A
coluna `sales.net_amount` já existe (hoje sempre `null`/0) para quando o
valor líquido por venda estiver disponível. Para trocar:
```sql
update app_config set commission_base = 'net';
```
Se no futuro quiserem trocar a quantidade de peças automaticamente (puxando
da Shopify via `GET /admin/api/.../products.json`), não é difícil de
adicionar, mas fica fora do escopo deste MVP.

## Estrutura do banco

- `members` — afiliados. `auth_user_id` só é preenchido quando o membro cria
  login (permite cadastrar o membro e o cupom antes dele logar).
- `sales` — uma venda Shopify com cupom de afiliado. `shopify_order_id` é
  único (idempotência do webhook).
- `sale_items` — os produtos daquela venda (um pedido pode ter mais de um
  item). Só para exibição na tabela de vendas recentes — não entra em nenhum
  cálculo de recompensa, que continua baseado só em `sales`.
- `cycles` — a "foto" do mês de cada membro (vendas, valores, peças,
  comissão). Recalculada automaticamente por um trigger em `sales`
  (`AFTER INSERT OR UPDATE OR DELETE`). Também guarda
  `pieces_delivered_count` / `pieces_delivered_at` — controle manual do
  admin (não mexido pelo trigger), usado pelo contador +/- no painel admin.
  É uma contagem, não um sim/não, porque as peças são conquistadas aos
  poucos ao longo do mês (5 vendas = 1 peça, +5 = outra, 15+ = todas as do
  drop) — a entrega também acontece em remessas separadas.
- `app_config` — os dois pontos em aberto acima.
- RLS: cada membro só enxerga as próprias linhas (`sales`, `sale_items`,
  `cycles`, `members`); membros com `is_admin = true` (o Vitor) enxergam tudo.
  Só admin pode fazer `UPDATE` em `cycles` (usado só pra marcar entrega de
  peças — o resto dos campos é sempre recalculado pelo trigger).
- Realtime habilitado em `sales`, `sale_items` e `cycles`.

## Histórico de meses e entrega de peças

- **Meta até a Próxima Peça**: segunda barra de progresso no painel do
  membro, logo abaixo da barra do ciclo — reseta a cada 5 vendas (na 6ª
  venda volta pra 1/5), contando a carreira toda do membro, independe do
  mês. É só visual/motivacional (`src/components/LifetimeProgress.tsx`) —
  não gera peça nem comissão; a barra mensal (5/15+/30+, resetando todo mês)
  continua exatamente como estava.
- **Vendas na Carreira**: 4º bloco no grid de estatísticas do topo do
  painel do membro (junto de Vendas no Mês, Peças Conquistadas e Comissão
  Acumulada), com o total de vendas do membro desde sempre.
- **Histórico**: o painel do membro e o painel admin têm um seletor de mês
  no topo (só aparece quando existe mais de um mês com dado — `cycles`
  acumula uma linha por membro/mês, então o histórico já existe sozinho
  conforme os meses passam, não precisa de nenhuma limpeza).
- **Peças entregues**: no painel admin, cada membro com peças ganhas tem um
  contador `− X/Y +` na tabela de Membros — o admin incrementa conforme vai
  mandando cada remessa (não precisa ser tudo de uma vez). O painel do
  membro mostra o mesmo progresso ("2 de 8 peças entregues" / "Todas as
  peças já foram entregues") assim que ele tiver pelo menos 1 peça no ciclo
  selecionado.
- **Adicionar membro**: caixa "Adicionar Membro" no topo do painel admin
  (nome + cupom) — cadastra direto sem precisar de SQL, já preenchendo o
  e-mail sintético automaticamente. Só admin consegue (RLS testado). O
  membro nasce sem login — pra ele conseguir entrar, é só rodar
  `scripts/create-member-logins.mjs` de novo (ele já vem pronto pro script
  pegar, sem passo extra).
- **Editar membro**: ícone de lápis ao lado do nome, na tabela de Membros —
  edita nome e cupom direto na linha (sem SQL). Só admin consegue (RLS
  testado).
- **Excluir membro**: botão "Excluir" na tabela de Membros apaga a linha de
  vez, em cascata com todas as vendas/comissão dele — **irreversível**. Por
  segurança, pede pra digitar o cupom exato do membro antes de confirmar.
- **Desativar sem apagar** (`active = false`) não tem mais botão na UI, mas
  o mecanismo continua existindo — quem preferir manter o histórico e só
  tirar o membro da lista principal pode fazer via SQL/Table Editor:
  `update members set active = false where coupon_code = 'CUPOM';`. Membros
  assim ficam visíveis numa tabela separada, "Membros Removidos", com botão
  pra **Reativar** ou **Excluir** definitivamente.

## Configurar o `.env`

```bash
cp .env.example .env
```

Preencha:

```
VITE_SUPABASE_URL=https://tflxotunokypiakkdyxs.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key do projeto, em Project Settings > API>
```

A anon key é pública por design (protegida pelas policies de RLS) — mas
mesmo assim não deve ir para o Git; `.env` já está no `.gitignore`.

## Aplicar o schema no Supabase

### Opção A — SQL Editor do painel (mais rápido, sem CLI)

1. Abra https://supabase.com/dashboard/project/tflxotunokypiakkdyxs/sql/new
2. Cole o conteúdo de [`schema.sql`](schema.sql) e rode (`Run`).
3. Repita com [`seed.sql`](seed.sql) se quiser os dados mockados para
   desenvolver sem depender da Shopify.

### Opção B — Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref tflxotunokypiakkdyxs
npx supabase db push --db-url "postgresql://postgres:<SUA_SENHA_DO_BANCO>@db.tflxotunokypiakkdyxs.supabase.co:5432/postgres" --file schema.sql
npx supabase db push --db-url "postgresql://postgres:<SUA_SENHA_DO_BANCO>@db.tflxotunokypiakkdyxs.supabase.co:5432/postgres" --file seed.sql
```

(`supabase login` abre o navegador para autenticar na sua conta — por isso
não pude rodar isso por você. A senha do banco fica em
Project Settings > Database > Connection string.)

## Login: usuário (cupom) + senha, sem precisar de e-mail real

Os membros não precisam ter e-mail próprio pra logar. Internamente, cada
conta usa um e-mail sintético gerado a partir do cupom
(`leal@m3ntalmadness.com`, formato definido em
[`src/lib/auth.ts`](src/lib/auth.ts)) — a tela de login só pede **usuário**
(o cupom) e senha. Login com e-mail real continua funcionando normalmente
pras contas admin que já foram criadas assim (Lucas, Vitor).

### Criar os logins em massa (membros sem conta ainda)

Todos os membros são criados com a **mesma senha temporária**. No primeiro
login, o painel bloqueia o acesso e obriga a pessoa a criar uma senha nova
antes de ver qualquer dado (`src/pages/ForceChangePassword.tsx`) — ninguém
consegue navegar no painel usando a senha temporária depois do primeiro
login.

1. Rode a migration que preenche o e-mail sintético de quem ainda não tem
   (`supabase/migrations/20260809000017_synthetic_login_emails.sql` — já
   aplicada nos 42 membros cadastrados).
2. Pegue a **service role key** em Project Settings > API > service_role
   (não é a anon key — essa nunca vai no `.env` do frontend).
3. Rode, no terminal, dentro da pasta do projeto:
   ```bash
   SUPABASE_URL=https://tflxotunokypiakkdyxs.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<cole a service role key aqui> \
   TEMP_PASSWORD=<escolha uma, ou deixe de fora pro padrão "mentalmadness2026"> \
   node scripts/create-member-logins.mjs
   ```
4. O terminal mostra a senha temporária usada ao final. Avise os membros:
   "usuário = seu cupom, senha = `<a que apareceu>`, e ele vai pedir pra
   trocar assim que você entrar". A lista de cupons criados fica em
   `member-credentials.csv` (já no `.gitignore`), só pra conferência.
   Pode rodar o script de novo sem medo: só cria conta pra quem ainda não
   tem uma.

Esse script cria contas de verdade no Supabase Auth, então quem deve rodar
é você/o Vitor — veja o comentário no topo do arquivo pra mais detalhes.

### Criar/vincular um login manualmente (um de cada vez)

1. Crie o usuário em Authentication > Users > Add user (e-mail pode ser o
   sintético acima, ou um real).
2. Vincule o `auth_user_id` dele na tabela `members`:
   ```sql
   update members set auth_user_id = '<uuid do usuário em auth.users>'
   where coupon_code = 'LEAL';
   ```

### "Esqueci minha senha"

Como a maioria dos membros loga com e-mail sintético (ninguém checa essa
caixa de entrada), o fluxo padrão de "esqueci minha senha" por e-mail não
funciona pra eles. Em vez disso, o **painel admin** tem um botão **"Resetar
senha"** ao lado de cada membro na tabela — o admin clica, o sistema gera uma
senha temporária nova na hora e mostra na tela pra copiar e passar pro
membro. Ele é obrigado a trocar essa senha no próximo login, mesmo fluxo do
cadastro inicial.

Isso é feito pela Edge Function
[`supabase/functions/reset-member-password/index.ts`](supabase/functions/reset-member-password/index.ts)
(precisa de deploy — ver seção abaixo).

## Rodar o projeto

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`, faça login com um usuário vinculado a um
membro. Se `is_admin = true`, aparece o botão "Painel Admin" no cabeçalho.

## Deploy das functions do painel admin (senha e login)

```bash
npx supabase login
npx supabase functions deploy reset-member-password --project-ref tflxotunokypiakkdyxs
npx supabase functions deploy create-member-login --project-ref tflxotunokypiakkdyxs
```

A segunda (`create-member-login`) é chamada automaticamente pela caixa
"Adicionar Membro" — cadastra o membro **e** já cria o login dele na hora,
mostrando a senha temporária na tela. Também aparece um botão "Criar login"
na tabela de Membros pra quem foi cadastrado antes sem login (ex: pelo
`scripts/create-member-logins.mjs`, ou membros antigos). Com isso, dá pra
cadastrar e logar todo mundo só pelo painel, sem precisar rodar nada no
terminal.

Não precisa configurar nenhum secret — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
e `SUPABASE_ANON_KEY` já ficam disponíveis automaticamente dentro de toda
Edge Function em produção. `supabase login` abre o navegador pra autenticar
na sua conta — só precisa fazer uma vez por máquina.

## Plugar o webhook real da Shopify (depois)

A function já está pronta em
[`supabase/functions/shopify-webhook/index.ts`](supabase/functions/shopify-webhook/index.ts),
sem nenhuma credencial real configurada. Quando for ativar:

1. Deploy da function:
   ```bash
   npx supabase functions deploy shopify-webhook --project-ref tflxotunokypiakkdyxs
   ```
2. Configure os secrets:
   ```bash
   npx supabase secrets set SHOPIFY_WEBHOOK_SECRET=<signing secret do webhook> --project-ref tflxotunokypiakkdyxs
   ```
   (`SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL` já ficam disponíveis
   automaticamente dentro da Edge Function em produção.)
3. No admin da Shopify: **Settings → Notifications → Webhooks → Create
   webhook** — repita 3 vezes, uma por evento, todos apontando pra **mesma
   URL** (a function decide o que fazer olhando o header
   `X-Shopify-Topic`):
   - Event: `Order payment` (`orders/paid`) → registra a venda
   - Event: `Order cancellation` (`orders/cancelled`) → reverte a venda
   - Event: `Refund create` (`refunds/create`) → reverte a venda (reembolso
     total ou parcial — MVP não rastreia reembolso item a item, remove a
     venda inteira)
   - Format: `JSON`
   - URL: `https://tflxotunokypiakkdyxs.supabase.co/functions/v1/shopify-webhook`
4. Copie o "Signing secret" gerado pela Shopify (é o mesmo pros 3 webhooks)
   para o secret `SHOPIFY_WEBHOOK_SECRET` do passo 2.

A function identifica o cupom em `discount_codes[0].code` (ou
`discount_applications` como fallback), busca o membro dono do cupom
(case-insensitive) e insere a venda — o trigger do banco cuida do resto. Os
produtos do pedido (`order.line_items[].title`/`quantity`) são gravados em
`sale_items` para aparecer na tabela de vendas recentes do membro. Pedidos
sem cupom de afiliado, ou com cupom que não pertence a nenhum membro, são
ignorados silenciosamente (200 OK, sem erro).

Cancelamento e reembolso apagam a venda em `sales` (o `on delete cascade`
leva `sale_items` junto) usando `shopify_order_id` pra achar o pedido — o
trigger recalcula o ciclo do membro na hora, sem precisar de ação manual no
admin.

## Identidade visual

Segue a identidade já aprovada pelo cliente: fundo `#0a0a0a`/`#0f0f0f`,
acento vermelho `#c81d1d`, tipografia Cinzel (números/wordmark) + Oswald
(texto), barra de progresso com borda serrilhada em zigue-zague
(`src/styles/global.css`, `.mm-progress-track`). O símbolo "M" da marca fica
em `public/logo-m.png` (arquivo oficial já plugado no header e na tela de
login). Se enviarem uma versão com fundo transparente, é só substituir o
arquivo mantendo o nome — não precisa mexer em código.

## Estrutura do projeto

```
schema.sql                          # schema completo (tabelas, trigger, RLS, realtime)
seed.sql                            # dados mockados para dev sem Shopify
supabase/functions/shopify-webhook/ # Edge Function do webhook orders/paid
src/
  lib/supabaseClient.ts             # client do Supabase
  lib/rewards.ts                    # helpers de exibição (progresso/marcos)
  context/AuthContext.tsx           # sessão + membro logado
  pages/Login.tsx
  pages/MemberDashboard.tsx         # painel do membro, realtime
  pages/AdminDashboard.tsx          # painel do Vitor, realtime
  components/                       # Header, StatCard, CycleProgress, LifetimeProgress
  styles/global.css                 # identidade visual completa
```
