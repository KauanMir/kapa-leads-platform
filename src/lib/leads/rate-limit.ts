/**
 * Rate limit simples em memória (janela fixa por chave).
 *
 * Proteção básica, sem infraestrutura extra: vale por instância do
 * servidor e é perdida em reinícios. Em ambiente serverless com várias
 * instâncias, o limite efetivo é maior. Proteção robusta (Cloudflare WAF,
 * Redis/KV) fica documentada como tarefa futura.
 *
 * O IP fica apenas em memória, nunca é gravado no banco.
 */

export interface RateLimiter {
  /** Registra uma tentativa. Retorna false se a chave excedeu o limite. */
  hit(key: string, nowMs: number): boolean;
}

type Window = { startedAt: number; count: number };

export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly options: { limit: number; windowMs: number; maxKeys?: number },
  ) {}

  hit(key: string, nowMs: number): boolean {
    const { limit, windowMs } = this.options;
    const current = this.windows.get(key);

    if (!current || nowMs - current.startedAt >= windowMs) {
      this.windows.delete(key);
      this.windows.set(key, { startedAt: nowMs, count: 1 });
      this.evict(nowMs);
      return true;
    }

    current.count += 1;
    return current.count <= limit;
  }

  /** Evita crescimento ilimitado da memória. */
  private evict(nowMs: number) {
    const maxKeys = this.options.maxKeys ?? 10_000;
    if (this.windows.size <= maxKeys) return;

    for (const [key, window] of this.windows) {
      if (nowMs - window.startedAt >= this.options.windowMs) this.windows.delete(key);
    }
    // Ainda cheio: descarta as chaves mais antigas (ordem de inserção).
    for (const key of this.windows.keys()) {
      if (this.windows.size <= maxKeys) break;
      this.windows.delete(key);
    }
  }
}

/**
 * Padrão: 30 envios por 60 s por IP. Folgado de propósito: redes móveis
 * (CGNAT) e Wi-Fi de empresas colocam muitas pessoas no mesmo IP, e um
 * bloqueio falso perde um lead real. Bots insistentes ainda são contidos;
 * proteção forte fica para a borda (Cloudflare WAF/Turnstile ou limiter
 * distribuído) — ver docs/integracao-landing-page.md.
 */
export const DEFAULT_RATE_LIMIT = { limit: 30, windowSeconds: 60 } as const;

const LIMIT_RANGE = [1, 10_000] as const;
const WINDOW_RANGE = [1, 3_600] as const;

export type RateLimitConfig = { limit: number; windowMs: number; warnings: string[] };

function parseBounded(raw: string | undefined, fallback: number, [min, max]: readonly [number, number], name: string, warnings: string[]) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.trim());
  if (Number.isInteger(value) && value >= min && value <= max) return value;
  warnings.push(`${name} inválido (use um inteiro entre ${min} e ${max}); usando ${fallback}.`);
  return fallback;
}

/**
 * Lê PUBLIC_LEADS_RATE_LIMIT_MAX e PUBLIC_LEADS_RATE_LIMIT_WINDOW_SECONDS.
 * Valores ausentes usam o padrão; inválidos usam o padrão e geram aviso.
 */
export function readRateLimitConfig(env: Record<string, string | undefined>): RateLimitConfig {
  const warnings: string[] = [];
  const limit = parseBounded(env.PUBLIC_LEADS_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT.limit, LIMIT_RANGE, "PUBLIC_LEADS_RATE_LIMIT_MAX", warnings);
  const windowSeconds = parseBounded(
    env.PUBLIC_LEADS_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_RATE_LIMIT.windowSeconds,
    WINDOW_RANGE,
    "PUBLIC_LEADS_RATE_LIMIT_WINDOW_SECONDS",
    warnings,
  );
  return { limit, windowMs: windowSeconds * 1000, warnings };
}

/** IP do cliente a partir dos headers do proxy/plataforma. null se ausente. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || null;
}
