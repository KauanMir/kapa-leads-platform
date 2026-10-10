"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/button";

export function CopyButton({ value, label = "Copiar", size = "sm" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copy} className={buttonClasses({ variant: "secondary", size })}>
      {copied ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
      <span aria-live="polite">{copied ? "Copiado" : label}</span>
    </button>
  );
}
