// ============================================================================
// Edge Function: shopify-sync-coupon
// Chamada pelo painel admin pra manter o cupom sincronizado nas lojas
// Shopify (mão dupla -- diferente do webhook shopify-webhook, que só recebe
// eventos DE LÁ pra cá).
//
// action "create": membro novo -- cria o desconto na(s) loja(s) escolhida(s),
//   clonando a lista de coleções de outro membro JÁ RASTREADO por nós
//   naquela loja (todo cupom de afiliado compartilha as mesmas coleções,
//   mantidas em sincronia pela automação de coleção nova). Nunca clona de
//   "o desconto mais recente da loja" -- um cupom criado manualmente na
//   Shopify pode nunca ter sido sincronizado. Salva o ID retornado em
//   members.shopify_discount_id_<loja>.
// action "rename": cupom do membro mudou -- renomeia (code E title juntos)
//   em toda loja onde ele já tem um shopify_discount_id salvo.
//
// Exclusão fica dentro de delete-member (mais simples manter atômico com a
// própria exclusão do membro).
//
// Deploy:
//   npx supabase functions deploy shopify-sync-coupon --project-ref tflxotunokypiakkdyxs
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createAffiliateDiscount,
  getDiscountCollectionIds,
  getStoreConfig,
  renameAffiliateDiscount,
  ShopifyGraphQLError,
  STORE_KEYS,
  type StoreKey,
} from "../_shared/shopify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const DISCOUNT_ID_COLUMN: Record<StoreKey, "shopify_discount_id_basic" | "shopify_discount_id_exclusivos"> = {
  basic: "shopify_discount_id_basic",
  exclusivos: "shopify_discount_id_exclusivos",
};

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
    return jsonResponse({ error: "Só admin pode sincronizar cupom com a Shopify" }, 403);
  }

  let body: { member_id?: string; action?: "create" | "rename"; stores?: StoreKey[]; new_coupon_code?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (!body.member_id || !body.action) {
    return jsonResponse({ error: "member_id e action são obrigatórios" }, 400);
  }

  const { data: member, error: memberError } = await adminClient
    .from("members")
    .select("id, coupon_code, shopify_discount_id_basic, shopify_discount_id_exclusivos")
    .eq("id", body.member_id)
    .maybeSingle();
  if (memberError || !member) return jsonResponse({ error: "Membro não encontrado" }, 404);

  const results: { store: StoreKey; ok: boolean; reason?: string }[] = [];

  if (body.action === "create") {
    const stores = (body.stores ?? []).filter((s): s is StoreKey => STORE_KEYS.includes(s));
    if (stores.length === 0) return jsonResponse({ error: "Escolhe pelo menos uma loja" }, 400);

    const { data: appConfig } = await adminClient.from("app_config").select("commission_rate").eq("id", 1).maybeSingle();
    const percentage = appConfig?.commission_rate ?? 0.05;

    for (const store of stores) {
      const config = getStoreConfig(store);
      if (!config) {
        results.push({ store, ok: false, reason: "Credenciais da Shopify não configuradas pra essa loja" });
        continue;
      }
      const existingId = member[DISCOUNT_ID_COLUMN[store]];
      if (existingId) {
        results.push({ store, ok: true, reason: "Já tinha cupom nessa loja, não mexeu" });
        continue;
      }
      try {
        // Molde vem de um membro NOSSO já rastreado (shopify_discount_id_*
        // salvo), nunca de "o desconto mais recente da loja" -- um cupom
        // criado manualmente na Shopify (fora do nosso sistema) pode nunca
        // ter sido sincronizado com as coleções novas, e usar ele como
        // molde propagaria essa lista incompleta pra todo cupom criado
        // depois (foi exatamente isso que aconteceu com o TESTE5).
        const { data: referenceMember } = await adminClient
          .from("members")
          .select(DISCOUNT_ID_COLUMN[store])
          .not(DISCOUNT_ID_COLUMN[store], "is", null)
          .limit(1)
          .maybeSingle();
        const referenceId = referenceMember?.[DISCOUNT_ID_COLUMN[store]] as string | undefined;
        const collectionIds = referenceId ? await getDiscountCollectionIds(config, referenceId) : [];

        const discountId = await createAffiliateDiscount(config, { code: member.coupon_code, percentage, collectionIds });
        const { error: saveError } = await adminClient.from("members").update({ [DISCOUNT_ID_COLUMN[store]]: discountId }).eq("id", member.id);
        if (saveError) {
          console.error(`Cupom criado na Shopify (${store}), mas falhou ao salvar o ID no banco:`, saveError);
          results.push({ store, ok: false, reason: "Criado na Shopify, mas não salvou o vínculo no banco -- avisa o suporte" });
          continue;
        }
        results.push({ store, ok: true });
      } catch (err) {
        console.error(`Erro ao criar cupom na Shopify (${store}):`, err);
        results.push({ store, ok: false, reason: err instanceof ShopifyGraphQLError ? err.message : "Erro ao criar na Shopify" });
      }
    }
  } else if (body.action === "rename") {
    const newCode = (body.new_coupon_code ?? member.coupon_code).trim().toUpperCase();
    for (const store of STORE_KEYS) {
      const discountId = member[DISCOUNT_ID_COLUMN[store]];
      if (!discountId) continue;
      const config = getStoreConfig(store);
      if (!config) {
        results.push({ store, ok: false, reason: "Credenciais da Shopify não configuradas pra essa loja" });
        continue;
      }
      try {
        await renameAffiliateDiscount(config, discountId, newCode);
        results.push({ store, ok: true });
      } catch (err) {
        console.error(`Erro ao renomear cupom na Shopify (${store}):`, err);
        results.push({ store, ok: false, reason: err instanceof ShopifyGraphQLError ? err.message : "Erro ao renomear na Shopify" });
      }
    }
  } else {
    return jsonResponse({ error: "action inválida" }, 400);
  }

  return jsonResponse({ ok: true, results });
});
