"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { buttonClasses } from "@/components/ui/button";

/** Botão de envio que mostra estado de carregamento do formulário. */
export function SubmitButton({
  children,
  pendingLabel = "Salvando…",
  variant = "primary",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClasses({ variant, size, className })}>
      {pending ? pendingLabel : children}
    </button>
  );
}
