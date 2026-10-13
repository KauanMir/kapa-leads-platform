"use client";

import { Check, ClipboardCopy, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { telHref, whatsappGreeting, whatsappUrl } from "@/lib/format/phone";

/**
 * Ações do lead: ligar, abrir o WhatsApp do cliente (nada é enviado sozinho)
 * e copiar o resumo para mandar ao vendedor (só área de transferência).
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

  const big = "h-12 flex-1 basis-40 text-base";
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <a href={telHref(phone)} className={buttonClasses({ variant: "secondary", size: "lg", className: big })}>
          <Phone aria-hidden="true" className="size-5" />
          LIGAR
        </a>
        <a
          href={whatsappUrl(phone, message)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ size: "lg", className: `${big} bg-emerald-700 hover:bg-emerald-800` })}
        >
          <MessageCircle aria-hidden="true" className="size-5" />
          WHATSAPP
          <span className="sr-only">(abre em nova aba)</span>
        </a>
        <button type="button" onClick={copySummary} className={buttonClasses({ variant: "secondary", size: "lg", className: big })}>
          {copied === "ok" ? <Check aria-hidden="true" className="size-5 text-success" /> : <ClipboardCopy aria-hidden="true" className="size-5" />}
          {copied === "ok" ? "RESUMO COPIADO" : "COPIAR RESUMO"}
        </button>
      </div>
      <p role="status" className={copied === "error" ? "mt-2 text-sm text-danger" : "mt-2 text-sm text-muted"}>
        {copied === "error"
          ? "Não foi possível copiar. Tente novamente."
          : copied === "ok"
            ? "Resumo copiado. Cole no WhatsApp do vendedor."
            : "COPIAR RESUMO: texto para o vendedor, sem CPF e sem dados técnicos."}
      </p>
    </div>
  );
}
