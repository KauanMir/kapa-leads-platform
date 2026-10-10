/** Resultado padrão das Server Actions (mensagens já em português para a tela). */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type FormState<T = undefined> = ActionResult<T> | null;
