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

// Vitrine de cada loja (não o admin/.myshopify.com) -- usado só no botão de
// call-to-action do e-mail.
const STORE_URLS: Record<StoreKey, string> = {
  basic: "https://www.mentalmadnessbasics.com/",
  exclusivos: "https://mentalmadnessexclusives.com/",
};

// Mesmo template visual do e-mail de "pedido saiu para entrega" do sistema
// de Vendas Externas (mesmos assets, cores, estrutura de tabelas pra
// compatibilidade com Outlook/Gmail) -- só o texto e o CTA mudam. <meta
// charset="utf-8"> sozinho não bastava (ver _shared/resend.ts) pra
// acentuação, mas mantém aqui também por ser o correto a se declarar.
function giftCardEmailHtml(params: { memberName: string; code: string; amount: number; store: StoreKey }): string {
  const value = currencyFormatter.format(params.amount);
  const storeUrl = STORE_URLS[params.store];

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Seu Gift Card chegou</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<style>
  table, td { border-collapse: collapse; }
  * { font-family: Arial, Helvetica, sans-serif !important; }
</style>
<![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet" type="text/css">
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: #000000; }
  a { text-decoration: none; }

  @media (prefers-color-scheme: light), (prefers-color-scheme: dark) {
    body, .mm-bg { background-color: #000000 !important; }
  }

  @media only screen and (max-width: 600px) {
    .mm-container { width: 100% !important; max-width: 100% !important; }
    .mm-px { padding-left: 24px !important; padding-right: 24px !important; }
    .mm-headline { font-size: 24px !important; line-height: 30px !important; }
    .mm-code { font-size: 22px !important; letter-spacing: 3px !important; }
    .mm-btn-pad { padding-left: 32px !important; padding-right: 32px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#000000; background-image:url('https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-bg-black.png'); background-repeat:repeat;" bgcolor="#000000" background="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-bg-black.png">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#000000; opacity:0;">
    Seu gift card Mental Madness chegou. Código: ${params.code}.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" background="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-bg-black.png" class="mm-bg" style="background-color:#000000; background-image:url('https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-bg-black.png'); background-repeat:repeat;">
    <tr>
      <td align="center" bgcolor="#000000" background="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-bg-black.png" class="mm-bg" style="padding: 48px 16px; background-color:#000000; background-image:url('https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-bg-black.png'); background-repeat:repeat;">

        <table role="presentation" class="mm-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">

          <tr>
            <td align="center" class="mm-px" style="padding: 40px 0 20px;">
              <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-mark.png" width="60" height="60" alt="" style="display:block; width:60px; height:60px; border:0; outline:none; margin: 0 auto 18px;">
              <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-wordmark.png" width="280" height="58" alt="Mental Madness" style="display:block; width:280px; height:58px; border:0; outline:none; margin: 0 auto;">
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 0 0;">
              <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-banner.jpg" width="600" height="202" alt="" style="display:block; width:100%; max-width:600px; height:auto; border:0; outline:none;">
            </td>
          </tr>

          <tr>
            <td style="border-top: 1px solid #1c1c1a; font-size:1px; line-height:1px;">&nbsp;</td>
          </tr>

          <tr>
            <td align="center" class="mm-px" style="padding: 36px 48px 16px;">
              <span class="mm-headline" style="font-family: 'Oswald', Arial, Helvetica, sans-serif; font-size: 28px; line-height: 34px; font-weight: 600; color: #f4f4f2; text-transform: uppercase; letter-spacing: 0.5px;">
                Você ganhou um Gift&nbsp;Card&nbsp;🎁
              </span>
            </td>
          </tr>

          <tr>
            <td align="center" class="mm-px" style="padding: 0 48px 36px;">
              <span style="font-family: 'Oswald', Arial, Helvetica, sans-serif; font-size: 15px; line-height: 24px; font-weight: 400; color: #9a9a94;">
                Oi, ${params.memberName}. Você completou peça(s) do drop na Mental Madness -- em vez de escolher uma peça, preparamos um <span style="color:#f4f4f2; font-weight:600;">gift card de ${value}</span> pra você usar como quiser na loja.
              </span>
            </td>
          </tr>

          <tr>
            <td align="center" class="mm-px" style="padding: 0 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #2a2a28;">
                <tr>
                  <td width="62" valign="middle" align="left" style="padding: 0 0 0 10px; line-height:0;">
                    <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-tribal-tl-v2.png" width="52" height="53" alt="" style="display:block; width:52px; height:53px; border:0; outline:none;">
                  </td>
                  <td align="center" valign="middle" style="padding: 26px 4px;">
                    <span style="font-family: 'Oswald', Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 3px; color: #7a7a74; text-transform: uppercase;">Código do gift card</span>
                    <br>
                    <span class="mm-code" style="font-family: 'Oswald', Arial, Helvetica, sans-serif; font-size: 26px; line-height: 40px; font-weight: 600; letter-spacing: 4px; color: #ffffff;">${params.code}</span>
                  </td>
                  <td width="62" valign="middle" align="right" style="padding: 0 10px 0 0; line-height:0;">
                    <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-tribal-br-v2.png" width="52" height="53" alt="" style="display:block; width:52px; height:53px; border:0; outline:none;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 0 0 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#000000" style="background-color:#000000; border: 1px solid #f4f4f2;">
                    <a href="${storeUrl}" target="_blank" class="mm-btn-pad"
                       style="display:inline-block; font-family:'Oswald', Arial, Helvetica, sans-serif; font-size:14px; font-weight:700; letter-spacing:3px; color:#f4f4f2; text-transform:uppercase; text-decoration:none; padding: 16px 52px;">
                      Usar Agora
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" class="mm-px" style="padding: 0 48px 48px;">
              <span style="font-family: 'Oswald', Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px; font-weight: 400; color: #7a7a74;">
                Cole esse código no campo "Código de desconto ou cartão-presente" no checkout.
              </span>
            </td>
          </tr>

          <tr>
            <td style="border-top: 1px solid #1c1c1a; font-size:1px; line-height:1px;">&nbsp;</td>
          </tr>

          <tr>
            <td align="center" class="mm-px" style="padding: 36px 48px 44px;">
              <span style="font-family: 'Oswald', Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px; font-weight: 400; color: #7a7a74;">
                Obrigado por fazer parte da Mental Madness.
              </span>
            </td>
          </tr>

          <tr>
            <td align="center" class="mm-px" style="padding: 0 24px 28px;">
              <span style="font-family: 'Oswald', Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 4px; color: #f4f4f2; text-transform: uppercase;">MENTAL MADNESS</span>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 0 16px 48px; font-size:0;">

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block; border: 1px solid #2a2a28; margin: 4px;">
                <tr>
                  <td style="padding: 10px 16px;">
                    <a href="https://discord.gg/jR96jVhdwt" target="_blank" style="display:inline-block; font-family:'Oswald', Arial, Helvetica, sans-serif; font-size:11px; font-weight:500; letter-spacing:1px; color:#f4f4f2; text-decoration:none; white-space:nowrap;">
                      <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-icon-discord.png" width="13" height="13" alt="" style="display:inline-block; width:13px; height:13px; vertical-align:middle; margin-right:7px; border:0;">Discord
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block; border: 1px solid #2a2a28; margin: 4px;">
                <tr>
                  <td style="padding: 10px 16px;">
                    <a href="https://wa.me/5511920858357" target="_blank" style="display:inline-block; font-family:'Oswald', Arial, Helvetica, sans-serif; font-size:11px; font-weight:500; letter-spacing:1px; color:#f4f4f2; text-decoration:none; white-space:nowrap;">
                      <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-icon-whatsapp.png" width="13" height="13" alt="" style="display:inline-block; width:13px; height:13px; vertical-align:middle; margin-right:7px; border:0;">WhatsApp
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block; border: 1px solid #2a2a28; margin: 4px;">
                <tr>
                  <td style="padding: 10px 16px;">
                    <a href="https://instagram.com/mentalmadness__" target="_blank" style="display:inline-block; font-family:'Oswald', Arial, Helvetica, sans-serif; font-size:11px; font-weight:500; letter-spacing:1px; color:#f4f4f2; text-decoration:none; white-space:nowrap;">
                      <img src="https://yriimdzhvohlqdgigbbg.supabase.co/storage/v1/object/public/email-assets/mental-madness-icon-instagram.png" width="13" height="13" alt="" style="display:inline-block; width:13px; height:13px; vertical-align:middle; margin-right:7px; border:0;">Instagram
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
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
      html: giftCardEmailHtml({ memberName: member.name, code: giftCard.code, amount, store }),
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
