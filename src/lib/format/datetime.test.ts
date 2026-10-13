import { describe, expect, it } from "vitest";

import { formatDayLabel, formatRelative } from "@/lib/format/datetime";

// 13/10/2026 15:00 em São Paulo (UTC−3).
const now = new Date("2026-10-13T18:00:00Z");

describe("formatRelative", () => {
  it("minutos e horas no mesmo dia", () => {
    expect(formatRelative("2026-10-13T17:59:40Z", now)).toBe("agora");
    expect(formatRelative("2026-10-13T17:55:00Z", now)).toBe("há 5 min");
    expect(formatRelative("2026-10-13T15:00:00Z", now)).toBe("há 3 h");
  });

  it("ontem e dias anteriores pelo fuso de São Paulo", () => {
    // 02:30 UTC de 13/10 = 23:30 de 12/10 em São Paulo.
    expect(formatRelative("2026-10-13T02:30:00Z", now)).toBe("ontem, 23:30");
    expect(formatRelative("2026-10-01T12:10:00Z", now)).toBe("01/10, 09:10");
    expect(formatRelative("2025-12-20T12:00:00Z", now)).toBe("20/12/2025");
  });
});

describe("formatDayLabel", () => {
  it("hoje, ontem ou a data", () => {
    expect(formatDayLabel("2026-10-13T10:00:00Z", now)).toBe("Hoje");
    expect(formatDayLabel("2026-10-13T02:30:00Z", now)).toBe("Ontem");
    expect(formatDayLabel("2026-10-05T12:00:00Z", now)).toBe("05/10/2026");
  });
});
