"use client";

import { Check, ClipboardCopy } from "lucide-react";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { whatsappGreeting, whatsappUrl } from "@/lib/format/phone";

/**
 * Ações do lead: abrir o WhatsApp do cliente (nada é enviado sozinho) e
 * copiar o resumo para mandar ao vendedor (só área de transferência).
 */
export function PhoneActions({ phone, leadName, storeName, summary }: { phone: string; leadName: string; storeName: string | null; summary: string }) {
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const message = whatsappGreeting(leadName, storeName ?? "loja");

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(null), 3000);
  }

  const big = "h-12 flex-1 basis-44 sm:flex-none sm:px-6";
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <a href={whatsappUrl(phone, message)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "whatsapp", size: "lg", className: big })}>
          <WhatsAppIcon className="size-5" />
          WHATSAPP
          <span className="sr-only">(abre em nova aba)</span>
        </a>
        <button
          type="button"
          onClick={copySummary}
          className={buttonClasses({ variant: "secondary", size: "lg", className: `${big} ${copied === "ok" ? "border-success/40 text-success" : ""}` })}
        >
          {copied === "ok" ? <Check aria-hidden="true" className="size-5" /> : <ClipboardCopy aria-hidden="true" className="size-5" />}
          {copied === "ok" ? "RESUMO COPIADO" : "COPIAR RESUMO"}
        </button>
      </div>
      <p role="status" className={`text-sm ${copied === "error" ? "mt-2 text-danger" : copied === "ok" ? "mt-2 text-success" : ""}`}>
        {copied === "error" ? "Não foi possível copiar. Tente novamente." : copied === "ok" ? "Pronto! Cole no WhatsApp do vendedor." : null}
      </p>
    </div>
  );
}
