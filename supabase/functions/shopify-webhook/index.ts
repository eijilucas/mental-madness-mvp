// ============================================================================
// Edge Function: shopify-webhook
// Recebe eventos da Shopify, todos na mesma URL (diferenciados pelo header
// x-shopify-topic):
//   - orders/paid          -> insere a venda em `sales` (+ `sale_items`)
//   - orders/cancelled     -> apaga a venda (pedido cancelado)
//   - refunds/create       -> apaga a venda (pedido estornado, total ou parcial)
//   - discounts/create     -> cadastra o membro automaticamente (cupom novo)
//   - discount_codes/create -> idem, formato legado da API de price rules
// O trigger do banco recalcula o ciclo do mês automaticamente em qualquer
// insert/delete de `sales`.
//
// NÃO ESTÁ PLUGADA A CREDENCIAIS REAIS AINDA. Para ativar de verdade:
//   1. Defina os secrets da function:
//        npx supabase secrets set SHOPIFY_WEBHOOK_SECRET=xxxxx
//        npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxxxx   (já vem
//          disponível automaticamente em produção, mas em alguns setups
//          precisa ser setada manualmente)
//   2. Deploy: npx supabase functions deploy shopify-webhook
//   3. No admin da Shopify: Settings -> Notifications -> Webhooks -> Create
//      webhook, uma vez pra cada evento (mesma URL em todos):
//        -> Event: "Order payment" (orders/paid)
//        -> Event: "Order cancellation" (orders/cancelled)
//        -> Event: "Refund create" (refunds/create)
//        -> Event: "Discount creation" (discounts/create) — se não aparecer
//           essa opção na sua loja, procure "Discount code creation"
//           (discount_codes/create), que a function também entende.
//        -> Format: JSON
//        -> URL: https://<seu-projeto>.supabase.co/functions/v1/shopify-webhook
//   4. Copie o "Signing secret" (é o mesmo pra todos os webhooks) para
//      SHOPIFY_WEBHOOK_SECRET.
//
// Até lá, esta função roda em modo "pronta pra plugar": ela funciona
// perfeitamente contra um payload de teste (ver README), só a verificação de
// assinatura HMAC fica sem efeito enquanto SHOPIFY_WEBHOOK_SECRET não existir.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";

// Precisa ficar igual a SYNTHETIC_LOGIN_DOMAIN em src/lib/auth.ts — é o
// domínio fake usado pra logar sem precisar de e-mail de verdade.
const SYNTHETIC_LOGIN_DOMAIN = "m3ntalmadness.com";

// service role: esta função precisa escrever em `sales`/`members` e criar
// login no Auth, nada disso tem policy de escrita para usuários comuns (por
// design — só o backend pode gravar isso).
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ShopifyDiscountCode {
  code: string;
}

interface ShopifyLineItem {
  title: string;
  quantity: number;
}

interface ShopifyOrderPayload {
  id: number | string;
  // subtotal_price = preço já com o desconto do cupom aplicado, mas ANTES
  // de frete e imposto — é exatamente a base que a comissão usa. total_price
  // (que inclui frete+imposto) não é usado pra isso, só fica disponível caso
  // precise no futuro.
  subtotal_price: string;
  total_price: string;
  created_at: string;
  discount_codes?: ShopifyDiscountCode[];
  // fallback: algumas lojas registram o cupom em discount_applications em vez de discount_codes
  discount_applications?: { code?: string; title?: string }[];
  line_items?: ShopifyLineItem[];
}

// Payload de refunds/create não é o pedido, é o reembolso — o id do pedido
// vem em order_id, não em id (id ali é o id do reembolso).
interface ShopifyRefundPayload {
  order_id: number | string;
}

function randomTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "mm-" + btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
}

// A Shopify manda formatos diferentes dependendo de qual API cria o
// desconto — tenta os caminhos mais comuns, do mais novo pro mais legado.
function extractDiscountCode(payload: Record<string, unknown>): string | null {
  const discount = payload.discount as Record<string, unknown> | undefined;
  const fromUnifiedCode = discount?.code as string | undefined;
  if (fromUnifiedCode) return fromUnifiedCode;

  // API unificada de desconto: pra desconto de código, o "title" É o código.
  const fromUnifiedTitle = discount?.title as string | undefined;
  if (fromUnifiedTitle) return fromUnifiedTitle;

  // discount_codes/create (legado, via price rule): { discount_code: { code } }
  const discountCode = payload.discount_code as Record<string, unknown> | undefined;
  const fromLegacy = discountCode?.code as string | undefined;
  if (fromLegacy) return fromLegacy;

  // fallback: campo direto no topo do payload
  const fromTopLevel = (payload.code as string | undefined) ?? (payload.title as string | undefined);
  if (fromTopLevel) return fromTopLevel;

  return null;
}

async function verifyShopifyHmac(rawBody: string, hmacHeader: string | null): Promise<boolean> {
  if (!SHOPIFY_WEBHOOK_SECRET) {
    // Sem secret configurado ainda (ambiente de desenvolvimento): não bloqueia,
    // mas deixa claro nos logs que a verificação está desativada.
    console.warn("SHOPIFY_WEBHOOK_SECRET não configurado — pulando verificação HMAC (modo dev).");
    return true;
  }
  if (!hmacHeader) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return computedHmac === hmacHeader;
}

function extractCouponCode(order: ShopifyOrderPayload): string | null {
  const fromDiscountCodes = order.discount_codes?.[0]?.code;
  if (fromDiscountCodes) return fromDiscountCodes;

  const fromApplications = order.discount_applications?.find((d) => d.code)?.code;
  if (fromApplications) return fromApplications;

  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function handleOrderPaid(order: ShopifyOrderPayload): Promise<Response> {
  const couponCode = extractCouponCode(order);
  if (!couponCode) {
    // Pedido pago sem cupom de afiliado: não é erro, só não gera comissão.
    return jsonResponse({ skipped: true, reason: "Pedido sem cupom de afiliado" });
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .ilike("coupon_code", couponCode)
    .eq("active", true)
    .maybeSingle();

  if (memberError) {
    console.error("Erro ao buscar membro:", memberError);
    return jsonResponse({ error: "Erro interno ao buscar membro" }, 500);
  }

  if (!member) {
    // Cupom usado não pertence a nenhum membro cadastrado (cupom "normal" da loja).
    return jsonResponse({ skipped: true, reason: `Cupom '${couponCode}' não é de um membro` });
  }

  const { data: sale, error: insertError } = await supabase
    .from("sales")
    .insert({
      member_id: member.id,
      shopify_order_id: String(order.id),
      coupon_code: couponCode,
      gross_amount: Number(order.subtotal_price),
      sale_date: order.created_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    // Conflito de shopify_order_id (unique) = webhook duplicado da Shopify, ignora.
    if (insertError.code === "23505") {
      return jsonResponse({ skipped: true, reason: "Pedido já registrado" });
    }
    console.error("Erro ao inserir venda:", insertError);
    return jsonResponse({ error: "Erro interno ao inserir venda" }, 500);
  }

  const lineItems = order.line_items ?? [];
  if (lineItems.length > 0) {
    const { error: itemsError } = await supabase.from("sale_items").insert(
      lineItems.map((item) => ({
        sale_id: sale.id,
        product_name: item.title,
        quantity: item.quantity ?? 1,
      })),
    );
    // Não falha a request por causa disso — a venda já foi contabilizada,
    // os produtos são só para exibição.
    if (itemsError) console.error("Erro ao inserir itens da venda:", itemsError);
  }

  return jsonResponse({ ok: true, member_id: member.id, coupon_code: couponCode });
}

// Cancelamento ou reembolso (parcial ou total) reverte a venda inteira —
// simplificação de MVP: não tenta rastrear reembolso parcial item a item, só
// remove a venda pra não deixar peça/comissão presa em pedido que não vale
// mais. `sale_items` cai junto via `on delete cascade` (ver schema.sql).
async function handleOrderReversal(orderId: string | number): Promise<Response> {
  const { error, count } = await supabase
    .from("sales")
    .delete({ count: "exact" })
    .eq("shopify_order_id", String(orderId));

  if (error) {
    console.error("Erro ao reverter venda:", error);
    return jsonResponse({ error: "Erro interno ao reverter venda" }, 500);
  }

  if (!count) {
    // Pedido cancelado/estornado nunca tinha gerado venda aqui (sem cupom de
    // afiliado, por exemplo) — nada a fazer.
    return jsonResponse({ skipped: true, reason: "Nenhuma venda registrada pra esse pedido" });
  }

  return jsonResponse({ ok: true, reverted_order_id: String(orderId) });
}

// Cupom novo criado na Shopify -> cadastra o membro automaticamente. O nome
// sai igual ao código do cupom (a Shopify não sabe o nome de verdade do
// afiliado) — o admin corrige depois pelo ícone de lápis na tabela. Já cria
// o login junto (senha temporária): o admin pega uma senha nova a qualquer
// momento clicando em "Resetar senha" na tabela, não precisa guardar a
// gerada aqui.
async function handleDiscountCreated(payload: Record<string, unknown>): Promise<Response> {
  const rawCode = extractDiscountCode(payload);
  if (!rawCode) {
    return jsonResponse({ skipped: true, reason: "Payload sem código de cupom identificável" });
  }

  const couponCode = rawCode.trim().toUpperCase();
  if (!couponCode) {
    return jsonResponse({ skipped: true, reason: "Código de cupom vazio" });
  }

  const { data: existing, error: existingError } = await supabase
    .from("members")
    .select("id")
    .ilike("coupon_code", couponCode)
    .maybeSingle();

  if (existingError) {
    console.error("Erro ao checar membro existente:", existingError);
    return jsonResponse({ error: "Erro interno ao checar membro existente" }, 500);
  }

  if (existing) {
    // Cupom já tem membro cadastrado (ex: foi adicionado manualmente antes) — não duplica.
    return jsonResponse({ skipped: true, reason: `Já existe membro pro cupom '${couponCode}'` });
  }

  const email = `${couponCode.toLowerCase()}@${SYNTHETIC_LOGIN_DOMAIN}`;

  const { data: member, error: insertError } = await supabase
    .from("members")
    .insert({ name: couponCode, coupon_code: couponCode, email })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return jsonResponse({ skipped: true, reason: "Cupom já registrado (conflito de corrida)" });
    }
    console.error("Erro ao criar membro:", insertError);
    return jsonResponse({ error: "Erro interno ao criar membro" }, 500);
  }

  const tempPassword = randomTempPassword();
  const { data: created, error: createAuthError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });

  if (createAuthError || !created.user) {
    // Membro já existe na tabela, só o login que falhou — o admin resolve
    // isso clicando em "Criar login" na tabela (mesmo caminho manual).
    console.error("Membro criado, mas falhou ao criar login:", createAuthError);
    return jsonResponse({ ok: true, member_id: member.id, coupon_code: couponCode, login_created: false });
  }

  const { error: linkError } = await supabase.from("members").update({ auth_user_id: created.user.id }).eq("id", member.id);
  if (linkError) {
    console.error("Login criado, mas falhou ao vincular ao membro:", linkError);
  }

  return jsonResponse({ ok: true, member_id: member.id, coupon_code: couponCode, login_created: !linkError });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic") ?? "orders/paid";

  const validHmac = await verifyShopifyHmac(rawBody, hmacHeader);
  if (!validHmac) {
    return jsonResponse({ error: "Assinatura HMAC inválida" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (topic === "orders/cancelled") {
    const order = payload as unknown as ShopifyOrderPayload;
    return await handleOrderReversal(order.id);
  }

  if (topic === "refunds/create") {
    const refund = payload as unknown as ShopifyRefundPayload;
    return await handleOrderReversal(refund.order_id);
  }

  if (topic === "discounts/create" || topic === "discount_codes/create") {
    return await handleDiscountCreated(payload);
  }

  return await handleOrderPaid(payload as unknown as ShopifyOrderPayload);
});
