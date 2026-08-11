import type { FunctionsError } from "@supabase/supabase-js";

// supabase-js só preenche `data` quando a Edge Function responde 2xx — em
// erro (4xx/5xx), `data` vem null e a mensagem de verdade fica escondida
// dentro de `error.context` (a Response crua). Sem isso, qualquer erro vira
// "erro desconhecido" na tela, mesmo a function tendo devolvido um motivo
// claro tipo { error: "..." }.
export async function extractFunctionErrorMessage(error: FunctionsError | null, data: unknown): Promise<string | null> {
  const dataError = (data as { error?: string } | null)?.error;
  if (dataError) return dataError;

  if (error && "context" in error && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      // corpo não era JSON, ignora e cai no fallback abaixo
    }
  }

  if (error?.message) return error.message;

  return null;
}
