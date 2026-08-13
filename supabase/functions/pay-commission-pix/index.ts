// ============================================================================
// Edge Function: pay-commission-pix
// Chamada pelo botão "Enviar PIX" / "Enviar PIX para todos" no painel admin
// (seção "Pagamento de Comissão"). Pra cada ciclo pendente informado: chama
// a API de Payouts do Mercado Pago (POST /v1/transaction-intents/process)
// mandando o valor da comissão pra chave PIX do membro, e só marca
// cycles.commission_paid = true se a transferência foi aceita.
//
// IMPORTANTE — ainda não testado contra a API real:
//   O endpoint e a autenticação (Access Token no header) foram confirmados
//   na documentação oficial (Payouts), mas não consegui confirmar 100% o
//   formato exato do body (a página de referência detalhada não abriu).
//   Antes de usar de verdade: testa com UM PIX de valor baixo primeiro,
//   de preferência com credencial de teste do Mercado Pago, e ajusta o
//   `buildPayoutBody` abaixo se o formato vier diferente do esperado.
//
// Deploy (roda você/o Vitor, precisa de `supabase login` primeiro):
//   npx supabase functions deploy pay-commission-pix --project-ref tflxotunokypiakkdyxs
//
// Secret necessário (o Vitor gera no painel de devs do Mercado Pago):
//   npx supabase secrets set MERCADOPAGO_ACCESS_TOKEN=xxxxx --project-ref tflxotunokypiakkdyxs
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";

const MP_PAYOUTS_URL = "https://api.mercadopago.com/v1/transaction-intents/process";

interface PayoutTarget {
  cycleId: string;
  memberId: string;
  memberName: string;
  pixKey: string;
  amount: number;
}

interface PayoutResult {
  cycleId: string;
  memberName: string;
  ok: boolean;
  reason?: string;
}

function buildPayoutBody(target: PayoutTarget) {
  // Formato assumido a partir da documentação de Payouts — confirmar contra
  // a API real na primeira transferência de teste (ver aviso no topo).
  return {
    origin: { account_id: "me" },
    destination: { type: "pix", pix_key: target.pixKey },
    amount: { value: target.amount, currency: "BRL" },
    external_reference: `commission-${target.cycleId}`,
    description: `Comissão Mental Madness — ${target.memberName}`,
  };
}

async function sendPayout(target: PayoutTarget): Promise<PayoutResult> {
  try {
    const res = await fetch(MP_PAYOUTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `commission-${target.cycleId}`,
      },
      body: JSON.stringify(buildPayoutBody(target)),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Payout falhou pra ${target.memberName}:`, res.status, errBody);
      return { cycleId: target.cycleId, memberName: target.memberName, ok: false, reason: `Mercado Pago recusou (${res.status})` };
    }

    return { cycleId: target.cycleId, memberName: target.memberName, ok: true };
  } catch (err) {
    console.error(`Erro de rede no payout pra ${target.memberName}:`, err);
    return { cycleId: target.cycleId, memberName: target.memberName, ok: false, reason: "Erro de rede ao chamar o Mercado Pago" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!MERCADOPAGO_ACCESS_TOKEN) {
    return jsonResponse({ error: "Token do Mercado Pago ainda não configurado — peça pro Vitor gerar o Access Token." }, 400);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!callerToken) {
    return jsonResponse({ error: "Não autenticado" }, 401);
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return jsonResponse({ error: "Não autenticado" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerMember, error: callerMemberError } = await adminClient
    .from("members")
    .select("is_admin")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();

  if (callerMemberError || !callerMember?.is_admin) {
    return jsonResponse({ error: "Só admin pode disparar pagamento de comissão" }, 403);
  }

  let body: { cycle_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (!body.cycle_ids || body.cycle_ids.length === 0) {
    return jsonResponse({ error: "cycle_ids é obrigatório" }, 400);
  }

  const { data: cycles, error: cyclesError } = await adminClient
    .from("cycles")
    .select("id, commission_amount, commission_paid, members(id, name, pix_key)")
    .in("id", body.cycle_ids);

  if (cyclesError || !cycles) {
    return jsonResponse({ error: "Erro ao buscar os ciclos" }, 500);
  }

  const targets: PayoutTarget[] = [];
  const skipped: PayoutResult[] = [];

  for (const c of cycles as unknown as Array<{
    id: string;
    commission_amount: number;
    commission_paid: boolean;
    members: { id: string; name: string; pix_key: string | null };
  }>) {
    if (c.commission_paid) continue;
    if (!c.members.pix_key) {
      skipped.push({ cycleId: c.id, memberName: c.members.name, ok: false, reason: "Sem chave PIX cadastrada" });
      continue;
    }
    targets.push({
      cycleId: c.id,
      memberId: c.members.id,
      memberName: c.members.name,
      pixKey: c.members.pix_key,
      amount: c.commission_amount,
    });
  }

  const results: PayoutResult[] = [...skipped];

  for (const target of targets) {
    const result = await sendPayout(target);
    results.push(result);

    if (result.ok) {
      await adminClient
        .from("cycles")
        .update({ commission_paid: true, commission_paid_at: new Date().toISOString() })
        .eq("id", target.cycleId);
    }
  }

  const allOk = results.every((r) => r.ok);
  return jsonResponse({ ok: allOk, results });
});
