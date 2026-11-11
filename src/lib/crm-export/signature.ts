/**
 * Assinatura das chamadas servidor → servidor do KAPA CRM (somente leitura).
 *
 * Contrato v1 (o KAPA CRM implementa o mesmo, em lib/server/kapa-leads-sync/signature.ts):
 *   X-Kapa-Timestamp: segundos Unix (UTC) do momento da chamada
 *   X-Kapa-Signature: v1=<hex do HMAC-SHA256>
 *   mensagem assinada: "v1:<timestamp>:<MÉTODO>:<pathname><search>"
 *
 * A chave é um segredo compartilhado (mín. 32 caracteres) que só existe no servidor das
 * duas plataformas. Tolerância de relógio: 300 s. A comparação é em tempo constante e
 * nenhum valor (segredo, assinatura recebida) é devolvido ou registrado.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_VERSION = "v1";
export const TIMESTAMP_HEADER = "x-kapa-timestamp";
export const SIGNATURE_HEADER = "x-kapa-signature";
export const MAX_CLOCK_SKEW_SECONDS = 300;
export const MIN_SECRET_LENGTH = 32;

export function signatureMessage(timestamp: string, method: string, pathAndQuery: string): string {
  return `${SIGNATURE_VERSION}:${timestamp}:${method.toUpperCase()}:${pathAndQuery}`;
}

export function computeSignature(secret: string, timestamp: string, method: string, pathAndQuery: string): string {
  return createHmac("sha256", secret).update(signatureMessage(timestamp, method, pathAndQuery), "utf8").digest("hex");
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };

/**
 * Confere a assinatura com qualquer um dos segredos aceitos (o atual e, durante uma troca,
 * o anterior). Segredo curto demais nunca autoriza.
 */
export function verifySignature(input: {
  secrets: readonly string[];
  timestampHeader: string | null;
  signatureHeader: string | null;
  method: string;
  pathAndQuery: string;
  nowMs: number;
}): SignatureCheck {
  const { timestampHeader, signatureHeader } = input;
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing" };
  if (!/^[0-9]{9,11}$/.test(timestampHeader)) return { ok: false, reason: "malformed" };
  const match = /^v1=([0-9a-f]{64})$/.exec(signatureHeader);
  if (!match) return { ok: false, reason: "malformed" };

  const skew = Math.abs(Math.floor(input.nowMs / 1000) - Number(timestampHeader));
  if (skew > MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "expired" };

  const received = Buffer.from(match[1], "hex");
  let matched = false;
  for (const secret of input.secrets) {
    if (secret.length < MIN_SECRET_LENGTH) continue;
    const expected = Buffer.from(computeSignature(secret, timestampHeader, input.method, input.pathAndQuery), "hex");
    // Sem curto-circuito: todos os segredos são conferidos.
    if (timingSafeEqual(expected, received)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: "mismatch" };
}
