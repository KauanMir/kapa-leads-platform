"use client";

import { useActionState } from "react";

import { Notice } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { login, type LoginState } from "@/lib/actions/auth";

export function LoginForm({ notice }: { notice: string | null }) {
  const [state, action] = useActionState<LoginState, FormData>(login, null);
  const error = state?.error ?? null;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate={false}>
      {error ? <Notice tone="error">{error}</Notice> : notice ? <Notice tone="error">{notice}</Notice> : null}

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state?.email ?? ""}
          aria-invalid={error ? true : undefined}
          className="h-11"
        />
      </div>

      <div>
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          className="h-11"
        />
      </div>

      <SubmitButton size="lg" pendingLabel="Entrando…" className="mt-1 w-full tracking-wide">
        ENTRAR
      </SubmitButton>

      <p className="text-center text-[13px] text-muted">Esqueceu a senha? Fale com o administrador da KAPA.</p>
    </form>
  );
}
