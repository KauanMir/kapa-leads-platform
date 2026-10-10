import { Notice } from "@/components/ui/card";
import type { FormState } from "@/lib/actions/types";

/** Mensagem geral de sucesso/erro de um formulário com Server Action. */
export function FormMessage({ state }: { state: FormState<unknown> }) {
  if (!state) return null;
  if (state.ok) return state.message ? <Notice tone="success">{state.message}</Notice> : null;
  return <Notice tone="error">{state.error}</Notice>;
}

export function fieldError(state: FormState<unknown>, field: string): string | undefined {
  return state && !state.ok ? state.fieldErrors?.[field] : undefined;
}
