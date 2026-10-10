import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter, clientIpFromHeaders } from "@/lib/leads/rate-limit";

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
