// Login aceita usuário (cupom) OU e-mail real (admins como o Vitor já têm
// conta com e-mail de verdade). Se não tiver "@", assume que é um cupom e
// monta o mesmo e-mail sintético usado no banco (ver migration
// 20260809000017_synthetic_login_emails.sql e scripts/create-member-logins.mjs).
export const SYNTHETIC_LOGIN_DOMAIN = "m3ntalmadness.com";

export function resolveLoginEmail(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed.toLowerCase()}@${SYNTHETIC_LOGIN_DOMAIN}`;
}
