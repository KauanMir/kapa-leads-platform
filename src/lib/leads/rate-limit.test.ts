import { describe, expect, it } from "vitest";

import { DEFAULT_RATE_LIMIT, FixedWindowRateLimiter, clientIpFromHeaders, readRateLimitConfig } from "@/lib/leads/rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("libera até o limite e reinicia na próxima janela", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1000 });
    expect([limiter.hit("ip", 0), limiter.hit("ip", 10), limiter.hit("ip", 20)]).toEqual([true, true, false]);
    expect(limiter.hit("ip", 1000)).toBe(true);
  });

  it("chaves são independentes", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit("a", 0)).toBe(true);
    expect(limiter.hit("b", 0)).toBe(true);
    expect(limiter.hit("a", 1)).toBe(false);
  });

  it("não cresce além de maxKeys", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    for (let i = 0; i < 10; i++) limiter.hit(`ip-${i}`, 0);
    // As chaves mais antigas foram descartadas: ip-0 volta a ser liberado.
    expect(limiter.hit("ip-0", 1)).toBe(true);
    expect(limiter.hit("ip-9", 1)).toBe(false);
  });
});

describe("clientIpFromHeaders", () => {
  it("usa o primeiro IP de x-forwarded-for, depois x-real-ip", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe("readRateLimitConfig", () => {
  it("padrão: 30 por 60 s", () => {
    expect(readRateLimitConfig({})).toEqual({ limit: 30, windowMs: 60_000, warnings: [] });
    expect(DEFAULT_RATE_LIMIT).toEqual({ limit: 30, windowSeconds: 60 });
  });

  it("lê valores válidos do ambiente", () => {
    expect(readRateLimitConfig({ PUBLIC_LEADS_RATE_LIMIT_MAX: "60", PUBLIC_LEADS_RATE_LIMIT_WINDOW_SECONDS: " 120 " })).toEqual({
      limit: 60,
      windowMs: 120_000,
      warnings: [],
    });
  });

  it("valores inválidos voltam ao padrão com aviso", () => {
    const config = readRateLimitConfig({ PUBLIC_LEADS_RATE_LIMIT_MAX: "0", PUBLIC_LEADS_RATE_LIMIT_WINDOW_SECONDS: "abc" });
    expect(config.limit).toBe(30);
    expect(config.windowMs).toBe(60_000);
    expect(config.warnings).toHaveLength(2);
    expect(readRateLimitConfig({ PUBLIC_LEADS_RATE_LIMIT_MAX: "2.5" }).limit).toBe(30);
    expect(readRateLimitConfig({ PUBLIC_LEADS_RATE_LIMIT_MAX: "" }).warnings).toEqual([]);
  });
});
