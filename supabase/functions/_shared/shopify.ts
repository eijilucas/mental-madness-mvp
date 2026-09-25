// ============================================================================
// Cliente compartilhado da Admin API da Shopify (GraphQL), usado pelo sync de
// mão dupla (criar/renomear/excluir cupom) e pela automação de coleção nova.
//
// Autenticação: client credentials grant (OAuth2) -- a Shopify descontinuou
// token estático pra app novo a partir de 01/01/2026. Em vez de guardar um
// token fixo, cada chamada busca um token novo (válido 24h) trocando
// client_id + client_secret. Ver:
// https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
//
// Secrets esperados (por loja, "BASIC", "EXCLUSIVOS" ou "SHADOW"):
//   SHOPIFY_STORE_DOMAIN_<LOJA>   ex: m3ntalmadness.myshopify.com
//   SHOPIFY_CLIENT_ID_<LOJA>
//   SHOPIFY_CLIENT_SECRET_<LOJA>
// Escopos necessários no app: read_discounts, write_discounts, read_products
// (read_products só é usado pra ler/gravar a lista de coleções de um
// desconto -- na Shopify, "coleção" fica sob o escopo de Produtos, não tem
// escopo próprio).
//
// Gift card (recompensa por peça, ver supabase/functions/send-gift-card) usa
// um app SEPARADO, com secrets próprios (mesmo domínio da loja, credencial
// diferente):
//   SHOPIFY_GIFTCARD_CLIENT_ID_<LOJA>
//   SHOPIFY_GIFTCARD_CLIENT_SECRET_<LOJA>
// Escopo necessário: write_gift_cards.
// (Shadow não tem app de gift card configurado aqui -- getGiftCardStoreConfig
// simplesmente devolve null pra ela até que exista.)
// ============================================================================

export const STORE_KEYS = ["basic", "exclusivos", "shadow"] as const;
export type StoreKey = (typeof STORE_KEYS)[number];

export interface ShopifyStoreConfig {
  key: StoreKey;
  domain: string;
  clientId: string;
  clientSecret: string;
}

export function getStoreConfig(store: StoreKey): ShopifyStoreConfig | null {
  const suffix = store.toUpperCase();
  const domain = Deno.env.get(`SHOPIFY_STORE_DOMAIN_${suffix}`);
  const clientId = Deno.env.get(`SHOPIFY_CLIENT_ID_${suffix}`);
  const clientSecret = Deno.env.get(`SHOPIFY_CLIENT_SECRET_${suffix}`);
  if (!domain || !clientId || !clientSecret) return null;
  return { key: store, domain, clientId, clientSecret };
}

// Coluna de members.shopify_discount_id_<loja> correspondente a cada loja --
// centralizado aqui (em vez de um ternário `store === "basic" ? x : y`
// espalhado pelas functions) porque um ternário de 2 ramos silenciosamente
// joga qualquer 3ª loja nova no ramo "else" errado. Toda function que precisa
// dessa coluna deve importar daqui, nunca reescrever o mapeamento na mão.
export const DISCOUNT_ID_COLUMN: Record<StoreKey, `shopify_discount_id_${StoreKey}`> = {
  basic: "shopify_discount_id_basic",
  exclusivos: "shopify_discount_id_exclusivos",
  shadow: "shopify_discount_id_shadow",
};

/**
 * Identifica de qual loja veio um webhook, pelo header `x-shopify-shop-domain`
 * comparado contra o domínio configurado de cada loja. Centralizado aqui (não
 * dentro de shopify-webhook) porque delete-member e outras functions também
 * precisam resolver loja a partir de domínio.
 */
export function resolveStore(shopDomain: string | null): StoreKey | null {
  if (!shopDomain) return null;
  for (const store of STORE_KEYS) {
    if (shopDomain === Deno.env.get(`SHOPIFY_STORE_DOMAIN_${store.toUpperCase()}`)) return store;
  }
  return null;
}

// App SEPARADO, só com o escopo write_gift_cards -- não reaproveita o app de
// sync (read_discounts/write_discounts/read_products) de propósito, pra não
// precisar mexer no escopo dele (edição de escopo de app já instalado é
// conhecida por não pegar na Shopify, ver README). Reaproveita o mesmo
// SHOPIFY_STORE_DOMAIN_<LOJA> (é a mesma loja, só o app de credencial muda).
export function getGiftCardStoreConfig(store: StoreKey): ShopifyStoreConfig | null {
  const suffix = store.toUpperCase();
  const domain = Deno.env.get(`SHOPIFY_STORE_DOMAIN_${suffix}`);
  const clientId = Deno.env.get(`SHOPIFY_GIFTCARD_CLIENT_ID_${suffix}`);
  const clientSecret = Deno.env.get(`SHOPIFY_GIFTCARD_CLIENT_SECRET_${suffix}`);
  if (!domain || !clientId || !clientSecret) return null;
  return { key: store, domain, clientId, clientSecret };
}

async function getAccessToken(config: ShopifyStoreConfig): Promise<string> {
  const res = await fetch(`https://${config.domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao autenticar com a Shopify (${config.domain}): HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error(`Shopify não devolveu access_token (${config.domain})`);
  return json.access_token as string;
}

const ADMIN_API_VERSION = "2026-01";

export class ShopifyGraphQLError extends Error {}

export async function shopifyGraphQL<T = unknown>(
  config: ShopifyStoreConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken(config);
  const res = await fetch(`https://${config.domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new ShopifyGraphQLError(`Erro GraphQL Shopify (${config.domain}): ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

/** Extrai a primeira mensagem de userErrors de uma mutation, se houver. */
export function firstUserError(userErrors: { field?: string[] | null; message: string }[] | undefined): string | null {
  if (!userErrors || userErrors.length === 0) return null;
  return userErrors[0].message;
}

interface CollectionEdge {
  node: { id: string };
}

interface DiscountByIdQueryResult {
  codeDiscountNode: {
    codeDiscount: {
      customerGets?: {
        items?: {
          collections?: { edges: CollectionEdge[] };
        };
      };
    };
  } | null;
}

/**
 * Busca a lista de coleções de UM desconto específico (identificado por
 * `discountId`) -- usado como "molde" pra saber em quais coleções um cupom
 * novo deve nascer (todos os cupons de afiliado compartilham as mesmas
 * coleções, mantidas em sincronia pela automação de "coleção nova").
 *
 * Importante: `discountId` precisa ser um desconto que a GENTE controla
 * (um `members.shopify_discount_id_*` de verdade), não "o desconto mais
 * recente da loja" — um desconto criado manualmente na Shopify por fora do
 * nosso sistema pode nunca ter sido sincronizado com coleções novas, e
 * usar ele como molde propagaria essa lista incompleta pra todo cupom
 * criado depois.
 */
export async function getDiscountCollectionIds(config: ShopifyStoreConfig, discountId: string): Promise<string[]> {
  const data = await shopifyGraphQL<DiscountByIdQueryResult>(
    config,
    `query($id: ID!) {
      codeDiscountNode(id: $id) {
        codeDiscount {
          ... on DiscountCodeBasic {
            customerGets { items { ... on DiscountCollections { collections(first: 50) { edges { node { id } } } } } }
          }
        }
      }
    }`,
    { id: discountId },
  );
  return (data.codeDiscountNode?.codeDiscount.customerGets?.items?.collections?.edges ?? []).map((e) => e.node.id);
}

interface FindDiscountByCodeResult {
  codeDiscountNodes: { edges: { node: { id: string } }[] };
}

/** Acha o ID de um desconto pelo código/título exato (case-sensitive na Shopify). */
export async function findDiscountIdByCode(config: ShopifyStoreConfig, code: string): Promise<string | null> {
  const data = await shopifyGraphQL<FindDiscountByCodeResult>(
    config,
    `query($q: String!) { codeDiscountNodes(first: 1, query: $q) { edges { node { id } } } }`,
    { q: `title:${code}` },
  );
  return data.codeDiscountNodes.edges[0]?.node.id ?? null;
}

interface CreateDiscountResult {
  discountCodeBasicCreate: {
    codeDiscountNode: { id: string } | null;
    userErrors: { field?: string[] | null; message: string }[];
  };
}

/**
 * Cria um cupom de afiliado novo, clonando as coleções de referência da loja.
 *
 * `collectionIds` vazio (nenhum molde encontrado -- acontece na PRIMEIRA vez
 * que um cupom é criado numa loja nova, sem nenhum afiliado anterior pra
 * copiar) usa `items: { all: true }` em vez de `collections: { add: [] }` --
 * a Shopify rejeita uma lista de coleções vazia com "Customer get must have
 * either item selection or set as all" (visto na prática ao ligar a loja
 * Shadow, que nasceu sem nenhum molde). "Todas as coleções" também cobre
 * coleção futura automaticamente, sem depender da automação de
 * collections/create -- efeito colateral bom, não só um workaround.
 */
export async function createAffiliateDiscount(
  config: ShopifyStoreConfig,
  params: { code: string; percentage: number; collectionIds: string[] },
): Promise<string> {
  const items = params.collectionIds.length > 0 ? { collections: { add: params.collectionIds } } : { all: true };

  const data = await shopifyGraphQL<CreateDiscountResult>(
    config,
    `mutation($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: params.code,
        code: params.code,
        startsAt: new Date().toISOString(),
        context: { all: "ALL" },
        appliesOncePerCustomer: false,
        customerGets: {
          value: { percentage: params.percentage },
          items,
        },
      },
    },
  );

  const err = firstUserError(data.discountCodeBasicCreate.userErrors);
  if (err) throw new ShopifyGraphQLError(err);
  const id = data.discountCodeBasicCreate.codeDiscountNode?.id;
  if (!id) throw new ShopifyGraphQLError("Shopify não devolveu o ID do desconto criado");
  return id;
}

interface UpdateDiscountResult {
  discountCodeBasicUpdate: {
    codeDiscountNode: { id: string } | null;
    userErrors: { field?: string[] | null; message: string }[];
  };
}

/** Renomeia o código de um cupom existente -- atualiza `code` E `title` juntos (são campos independentes na Shopify; só mudar `code` deixa o título mostrado no admin desatualizado). */
export async function renameAffiliateDiscount(config: ShopifyStoreConfig, discountId: string, newCode: string): Promise<void> {
  const data = await shopifyGraphQL<UpdateDiscountResult>(
    config,
    `mutation($id: ID!, $input: DiscountCodeBasicInput!) {
      discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`,
    { id: discountId, input: { code: newCode, title: newCode } },
  );
  const err = firstUserError(data.discountCodeBasicUpdate.userErrors);
  if (err) throw new ShopifyGraphQLError(err);
}

/** Adiciona uma ou mais coleções à lista de coleções elegíveis de um cupom -- operação aditiva (não substitui a lista existente), segura de repetir (idempotente, mesmo se algumas já estiverem lá). */
export async function addCollectionsToDiscount(config: ShopifyStoreConfig, discountId: string, collectionIds: string[]): Promise<void> {
  if (collectionIds.length === 0) return;
  const data = await shopifyGraphQL<UpdateDiscountResult>(
    config,
    `mutation($id: ID!, $input: DiscountCodeBasicInput!) {
      discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`,
    { id: discountId, input: { customerGets: { items: { collections: { add: collectionIds } } } } },
  );
  const err = firstUserError(data.discountCodeBasicUpdate.userErrors);
  if (err) throw new ShopifyGraphQLError(err);
}

interface DeleteDiscountResult {
  discountCodeDelete: {
    deletedCodeDiscountId: string | null;
    userErrors: { field?: string[] | null; message: string }[];
  };
}

/** Apaga um cupom de vez. Trata "não encontrado" como sucesso (já não existe, nada a fazer). */
export async function deleteAffiliateDiscount(config: ShopifyStoreConfig, discountId: string): Promise<void> {
  const data = await shopifyGraphQL<DeleteDiscountResult>(
    config,
    `mutation($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors { field message }
      }
    }`,
    { id: discountId },
  );
  const err = firstUserError(data.discountCodeDelete.userErrors);
  if (err && !/not found|does not exist/i.test(err)) throw new ShopifyGraphQLError(err);
}

interface CreateGiftCardResult {
  giftCardCreate: {
    giftCard: { id: string } | null;
    giftCardCode: string | null;
    userErrors: { field?: string[] | null; message: string }[];
  };
}

/**
 * Cria um gift card na loja com o valor informado (BRL) -- NÃO manda e-mail
 * automático da Shopify (sem customerId/recipientAttributes), porque o
 * e-mail pro afiliado é mandado por fora, via Resend, com o código que essa
 * function devolve.
 */
export async function createGiftCard(
  config: ShopifyStoreConfig,
  params: { amount: number; note?: string },
): Promise<{ code: string; giftCardId: string }> {
  const data = await shopifyGraphQL<CreateGiftCardResult>(
    config,
    `mutation($input: GiftCardCreateInput!) {
      giftCardCreate(input: $input) {
        giftCard { id }
        giftCardCode
        userErrors { field message }
      }
    }`,
    { input: { initialValue: params.amount.toFixed(2), note: params.note } },
  );
  const err = firstUserError(data.giftCardCreate.userErrors);
  if (err) throw new ShopifyGraphQLError(err);
  const code = data.giftCardCreate.giftCardCode;
  const giftCardId = data.giftCardCreate.giftCard?.id;
  if (!code || !giftCardId) throw new ShopifyGraphQLError("Shopify não devolveu o código do gift card criado");
  return { code, giftCardId };
}
