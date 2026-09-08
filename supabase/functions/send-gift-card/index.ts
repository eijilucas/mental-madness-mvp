// ============================================================================
// Edge Function: send-gift-card
// Chamada pelo painel admin ("Enviar Gift Card") -- substitui o afiliado
// escolher uma peça física: cria um gift card na loja escolhida no valor
// digitado pelo admin, e manda o código por e-mail (Resend) pro e-mail de
// contato do membro. Depois de enviar com sucesso, marca as peças pendentes
// daquele ciclo como entregues (mesmo efeito do stepper manual de entrega).
//
// Não usa o e-mail sintético de login (members.email) -- precisa do
// members.contact_email (endereço de verdade do afiliado).
//
// Deploy:
//   npx supabase functions deploy send-gift-card --project-ref tflxotunokypiakkdyxs
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createGiftCard, getGiftCardStoreConfig, ShopifyGraphQLError, STORE_KEYS, type StoreKey } from "../_shared/shopify.ts";
import { sendEmail } from "../_shared/resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function giftCardEmailHtml(params: { memberName: string; code: string; amount: number }): string {
  const value = currencyFormatter.format(params.amount);
  // <meta charset="utf-8"> é obrigatório -- sem isso, alguns clientes de
  // e-mail (e a própria pré-visualização do Resend) tratam o corpo como
  // Latin-1 e os acentos viram "�" (reproduzido no teste sem esse meta).
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
  </head>
  <body>
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">Parabéns, ${params.memberName}! 🎉</h2>
      <p>Você completou peça(s) do drop na Mental Madness -- em vez de escolher uma peça, preparamos um <strong>gift card de ${value}</strong> pra você usar como quiser na loja.</p>
      <div style="background: #111; color: #fff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <div style="font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.7;">Seu código</div>
        <div style="font-size: 24px; font-weight: 700; letter-spacing: 0.05em; margin-top: 8px;">${params.code}</div>
      </div>
      <p>É só usar esse código no campo de desconto/cartão-presente no checkout. Qualquer dúvida, chama a gente!</p>
    </div>
  </body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!callerToken) return jsonResponse({ error: "Não autenticado" }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return jsonResponse({ error: "Não autenticado" }, 401);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerMember, error: callerMemberError } = await adminClient
    .from("members")
    .select("is_admin")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();
  if (callerMemberError || !callerMember?.is_admin) {
    return jsonResponse({ error: "Só admin pode enviar gift card" }, 403);
  }

  let body: { member_id?: string; cycle_id?: string; store?: StoreKey; amount?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const { member_id, cycle_id, store, amount } = body;

  if (!member_id || !cycle_id || !store || !STORE_KEYS.includes(store)) {
    return jsonResponse({ error: "member_id, cycle_id e store são obrigatórios" }, 400);
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: "amount precisa ser um número maior que zero" }, 400);
  }

  const { data: member, error: memberError } = await adminClient
    .from("members")
    .select("id, name, contact_email")
    .eq("id", member_id)
    .maybeSingle();
  if (memberError || !member) return jsonResponse({ error: "Membro não encontrado" }, 404);
  if (!member.contact_email) {
    return jsonResponse({ error: "Esse membro não tem e-mail de contato cadastrado" }, 400);
  }

  const { data: cycle, error: cycleError } = await adminClient
    .from("cycles")
    .select("id, member_id, pieces_earned, pieces_delivered_count")
    .eq("id", cycle_id)
    .maybeSingle();
  if (cycleError || !cycle || cycle.member_id !== member_id) {
    return jsonResponse({ error: "Ciclo não encontrado" }, 404);
  }

  const config = getGiftCardStoreConfig(store);
  if (!config) {
    return jsonResponse({ error: `Credenciais de gift card da Shopify não configuradas pra ${store}` }, 500);
  }

  let giftCard: { code: string; giftCardId: string };
  try {
    giftCard = await createGiftCard(config, {
      amount,
      note: `Recompensa de peça -- ${member.name} (cupom, ciclo ${cycle_id})`,
    });
  } catch (err) {
    console.error("Erro ao criar gift card na Shopify:", err);
    return jsonResponse({ error: err instanceof ShopifyGraphQLError ? err.message : "Erro ao criar gift card na Shopify" }, 500);
  }

  try {
    await sendEmail({
      to: member.contact_email,
      subject: "Seu gift card Mental Madness chegou! 🎁",
      html: giftCardEmailHtml({ memberName: member.name, code: giftCard.code, amount }),
    });
  } catch (err) {
    console.error("Gift card criado, mas falhou ao mandar o e-mail:", err);
    return jsonResponse(
      { error: "Gift card criado na Shopify, mas não deu pra mandar o e-mail. Copia o código manualmente e manda pro afiliado.", code: giftCard.code },
      500,
    );
  }

  const { error: updateError } = await adminClient
    .from("cycles")
    .update({ pieces_delivered_count: cycle.pieces_earned, pieces_delivered_at: new Date().toISOString() })
    .eq("id", cycle.id);
  if (updateError) {
    console.error("Gift card enviado, mas falhou ao marcar peças como entregues:", updateError);
  }

  return jsonResponse({ ok: true, code: giftCard.code });
});
