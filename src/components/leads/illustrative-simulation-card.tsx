"use client";

import { Clock, Hourglass } from "lucide-react";
import { useEffect, useState } from "react";

import { ILLUSTRATIVE_VALUE_LABEL, formatCountdown, remainingMs } from "@/lib/format/illustrative";

type Answer = { key: string; label: string; value: string };

/**
 * Bloco da simulação ilustrativa (ex.: Fábrica de Aprovação): valor mostrado
 * ao cliente, validade de 36 h e respostas do formulário. O valor é o gravado
 * no lead; a validade vence em `expiresAt` (definido pelo banco).
 *
 * Relógio: o servidor manda a hora dele (`serverNow`) e o cronômetro corrige a
 * diferença para o relógio do aparelho. O primeiro render usa só `serverNow`
 * (igual ao HTML do servidor); depois passa a contar a cada segundo.
 * Expirada: só muda o visual; valor, lead e contato continuam.
 */
export function IllustrativeSimulationCard({
  campaignName,
  clientName,
  amount,
  requestedAt,
  requestedAtLabel,
  expiresAt,
  serverNow,
  answers,
}: {
  campaignName: string | null;
  clientName: string;
  amount: string;
  requestedAt: string;
  requestedAtLabel: string;
  expiresAt: string;
  serverNow: string;
  answers: Answer[];
}) {
  const [remaining, setRemaining] = useState(() => remainingMs(expiresAt, Date.parse(serverNow)));

  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setRemaining(remainingMs(expiresAt, Date.now() + offset));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, serverNow]);

  const expired = remaining <= 0;

  return (
    <section
      aria-labelledby="illustrative-simulation"
      data-testid="illustrative-simulation"
      data-state={expired ? "expired" : "valid"}
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      {/* Faixa da campanha (identidade da Fábrica: preto, verde e amarelo). */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-fabrica-ink px-5 py-3">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-white">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-fabrica-yellow" />
          <span className="truncate">{campaignName ?? "Campanha"}</span>
        </p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors duration-500 ${
            expired ? "bg-white/10 text-white/70 ring-white/15" : "bg-fabrica-green-light/15 text-fabrica-green-glow ring-fabrica-green-light/30"
          }`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${expired ? "bg-white/50" : "bg-fabrica-green-glow"}`} />
          {expired ? "Expirada" : "Vigente"}
        </span>
      </div>
      <div aria-hidden="true" className="h-0.5 bg-linear-to-r from-fabrica-green-light via-fabrica-green-light to-fabrica-yellow" />

      <div className="@container p-5 sm:p-6">
        <h2 id="illustrative-simulation" className="text-[13px] font-medium text-muted">
          {ILLUSTRATIVE_VALUE_LABEL}
        </h2>
        <p
          className={`mt-1 text-[34px] font-bold leading-tight tracking-tight tabular-nums transition-colors duration-500 sm:text-[40px] ${
            expired ? "text-foreground/60" : "text-foreground"
          }`}
        >
          {amount}
        </p>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Valor mostrado ao cliente na simulação. Não é aprovação, pré-aprovação nem limite de crédito: depende da análise da
          instituição financeira.
        </p>

        <p
          role="timer"
          aria-live="off"
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition-colors duration-500 ${
            expired ? "bg-surface-muted text-muted ring-line" : "bg-fabrica-green/5 text-fabrica-green ring-fabrica-green/15"
          }`}
        >
          {expired ? <Hourglass aria-hidden="true" className="size-4" /> : <Clock aria-hidden="true" className="size-4" />}
          {expired ? (
            <span className="font-semibold">Simulação expirada</span>
          ) : (
            <>
              <span>Validade da simulação</span>
              <span className="font-semibold tabular-nums">{formatCountdown(remaining)}</span>
            </>
          )}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[13px] text-muted">Cliente</dt>
            <dd className="break-words font-medium">{clientName}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Solicitação</dt>
            <dd className="font-medium">
              <time dateTime={requestedAt}>{requestedAtLabel}</time>
            </dd>
          </div>
        </dl>

        {answers.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Respostas do formulário</h3>
            <dl className="mt-2 grid grid-cols-1 gap-2 @lg:grid-cols-3">
              {answers.map((answer) => (
                <div key={answer.key} className="rounded-lg bg-surface-muted px-3.5 py-2.5 ring-1 ring-inset ring-line">
                  <dt className="text-[13px] text-muted">{answer.label}</dt>
                  <dd className="mt-0.5 break-words font-semibold">{answer.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}
