import { describe, expect, it } from "vitest";

import { formatConversion, formatDuration, summarizeKpis, type KpiRow } from "@/lib/admin/kpis";

const ANA = "user-ana";
const BIA = "user-bia";

const row = (assignedTo: string | null, status: KpiRow["status"], leads: number, fc = 0, fcSeconds = 0): KpiRow => ({
  assignedTo,
  status,
  leads,
  firstContactLeads: fc,
  firstContactSeconds: fcSeconds,
});

describe("summarizeKpis", () => {
  const kpis = summarizeKpis([
    row(null, "NEW", 4),
    row(ANA, "NEW", 1),
    row(ANA, "CONTACTED", 2, 2, 2 * 600),
    row(ANA, "WON", 3, 3, 3 * 1200),
    row(ANA, "LOST", 1, 1, 300),
    row(BIA, "IN_PROGRESS", 2, 2, 2 * 3600),
    row(BIA, "LOST", 2, 2, 0),
  ]);

  it("totais, fila, pendentes e por status", () => {
    expect(kpis.total).toBe(15);
    expect(kpis.unassigned).toBe(4);
    expect(kpis.byStatus).toEqual({ NEW: 5, CONTACTED: 2, IN_PROGRESS: 2, WON: 3, LOST: 3 });
    expect(kpis.pending).toBe(9);
    expect(kpis.closed).toBe(6);
  });

  it("conversão = ganhos ÷ concluídos (geral e por SDR)", () => {
    expect(kpis.conversion).toBe(3 / 6);
    expect(kpis.byAssignee.get(ANA)?.conversion).toBe(3 / 4);
    expect(kpis.byAssignee.get(BIA)?.conversion).toBe(0);
  });

  it("leads por SDR", () => {
    expect(kpis.byAssignee.get(ANA)).toMatchObject({ total: 7, pending: 3, byStatus: { NEW: 1, CONTACTED: 2, WON: 3, LOST: 1, IN_PROGRESS: 0 } });
    expect(kpis.byAssignee.get(BIA)?.total).toBe(4);
    expect(kpis.byAssignee.has("ninguem")).toBe(false);
  });

  it("1º atendimento: média só entre leads atendidos", () => {
    // Ana: (1200 + 3600 + 300) / 6 = 850 s
    expect(kpis.byAssignee.get(ANA)?.avgFirstContactSeconds).toBe(850);
    expect(kpis.avgFirstContactSeconds).toBe((1200 + 3600 + 300 + 7200 + 0) / 10);
  });

  it("sem concluídos/atendidos não inventa número", () => {
    const empty = summarizeKpis([row(ANA, "NEW", 2)]);
    expect(empty.conversion).toBeNull();
    expect(empty.avgFirstContactSeconds).toBeNull();
    expect(summarizeKpis([]).total).toBe(0);
  });
});

describe("formatação", () => {
  it("conversão em %", () => {
    expect(formatConversion(null)).toBe("—");
    expect(formatConversion(0.5)).toBe("50%");
    expect(formatConversion(2 / 3)).toBe("66,7%");
  });

  it("duração legível", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(480)).toBe("8 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(8100)).toBe("2 h 15 min");
    expect(formatDuration(97200)).toBe("1 d 3 h");
  });
});
