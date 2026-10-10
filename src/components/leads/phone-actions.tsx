"use client";

import { Check, Copy, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { formatPhone, telHref, whatsappGreeting, whatsappUrl } from "@/lib/format/phone";

/** Ações rápidas: ligar, abrir WhatsApp (sem enviar nada) e copiar telefone. */
export function PhoneActions({ phone, leadName, storeName }: { phone: string; leadName: string; storeName: string | null }) {
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const message = whatsappGreeting(leadName, storeName ?? "loja");

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatPhone(phone));
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(null), 2500);
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
        <button type="button" onClick={copy} className={buttonClasses({ variant: "secondary", size: "lg", className: big })}>
          {copied === "ok" ? <Check aria-hidden="true" className="size-5 text-success" /> : <Copy aria-hidden="true" className="size-5" />}
          {copied === "ok" ? "COPIADO" : "COPIAR TELEFONE"}
        </button>
      </div>
      <p role="status" className={copied === "error" ? "mt-2 text-sm text-danger" : "sr-only"}>
        {copied === "error" ? "Não foi possível copiar. Selecione o número manualmente." : copied === "ok" ? "Telefone copiado." : ""}
      </p>
    </div>
  );
}
