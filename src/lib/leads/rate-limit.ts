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

/** IP do cliente a partir dos headers do proxy/plataforma. null se ausente. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || null;
}
