// ============================================================================
// Edge Function: register-external-order-sale
//
// Chamada pelo sistema de Vendas Externas (mental-madness-vendas-externas)
// quando um pedido usa cupom de afiliado — sistema a sistema, sem login de
// admin (diferente de add-manual-sale, que exige sessão de um membro
// is_admin=true). Autenticação por secret compartilhado
// (EXTERNAL_ORDER_SALE_SECRET), mesmo padrão usado entre
// mental-madness-estoque e mm-etiquetas.
//
// Idempotente por external_order_id: reenvio do mesmo pedido nunca duplica
// a venda, só devolve o resultado anterior.
//
// Deploy:
//   npx supabase functions deploy register-external-order-sale --project-ref tflxotunokypiakkdyxs
//   npx supabase secrets set EXTERNAL_ORDER_SALE_SECRET=<secret> --project-ref tflxotunokypiakkdyxs
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPECTED_SECRET = Deno.env.get("EXTERNAL_ORDER_SALE_SECRET") ?? "";

interface RequestBody {
  coupon_code?: string;
  gross_amount?: number;
  product_name?: string;
  external_order_id?: string;
  sale_date?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!EXPECTED_SECRET || token !== EXPECTED_SECRET) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { coupon_code, gross_amount, product_name, external_order_id, sale_date } = body;

  if (!coupon_code || !coupon_code.trim()) {
    return jsonResponse({ error: "coupon_code_required" }, 400);
  }
  if (typeof gross_amount !== "number" || !Number.isFinite(gross_amount) || gross_amount <= 0) {
    return jsonResponse({ error: "invalid_gross_amount" }, 400);
  }
  if (!external_order_id) {
    return jsonResponse({ error: "external_order_id_required" }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Idempotência: mesmo pedido externo já registrado antes só devolve o
  // resultado anterior, nunca duplica a venda.
  const { data: existingSale } = await adminClient
    .from("sales")
    .select("id")
    .eq("external_order_id", external_order_id)
    .maybeSingle();

  if (existingSale) {
    return jsonResponse({ ok: true, sale_id: existingSale.id, idempotent: true });
  }

  const { data: member, error: memberError } = await adminClient
    .from("members")
    .select("id, coupon_code, active")
    .ilike("coupon_code", coupon_code.trim())
    .maybeSingle();

  if (memberError || !member) {
    return jsonResponse({ error: "coupon_not_found" }, 404);
  }
  if (!member.active) {
    return jsonResponse({ error: "coupon_inactive" }, 400);
  }

  const { data: sale, error: insertError } = await adminClient
    .from("sales")
    .insert({
      member_id: member.id,
      coupon_code: member.coupon_code,
      gross_amount,
      sale_date: sale_date || new Date().toISOString(),
      source: "manual",
      external_order_id,
    })
    .select("id")
    .single();

  if (insertError || !sale) {
    console.error("Erro ao inserir venda externa:", insertError);
    return jsonResponse({ error: "insert_failed" }, 500);
  }

  if (product_name && product_name.trim()) {
    const { error: itemError } = await adminClient
      .from("sale_items")
      .insert({ sale_id: sale.id, product_name: product_name.trim(), quantity: 1 });
    if (itemError) {
      console.error("Venda registrada, mas falhou ao registrar o item:", itemError);
    }
  }

  return jsonResponse({ ok: true, sale_id: sale.id });
});
