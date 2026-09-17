import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXTERNAL_SECRET = Deno.env.get("EXTERNAL_ORDER_SALE_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!EXTERNAL_SECRET || req.headers.get("authorization") !== `Bearer ${EXTERNAL_SECRET}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin.from("members")
    .select("coupon_code")
    .eq("active", true)
    .order("coupon_code", { ascending: true });
  if (error) return jsonResponse({ error: "coupon_query_failed" }, 500);

  return jsonResponse({
    coupons: (data ?? []).map((member: { coupon_code: string }) => member.coupon_code),
  });
});
