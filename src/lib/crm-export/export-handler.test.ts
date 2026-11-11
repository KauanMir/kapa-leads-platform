import { describe, expect, it } from "vitest";

import { readCrmExportConfig } from "@/lib/crm-export/config";
import {
  COUNT_PATH,
  EXPORT_PATH,
  MAX_LIMIT,
  SETTLE_SECONDS,
  createCrmExportHandler,
  labelsFor,
  type CrmExportDeps,
  type CrmExportLogEntry,
  type ExportLeadRow,
} from "@/lib/crm-export/export-handler";
import { computeSignature, verifySignature } from "@/lib/crm-export/signature";
import { FixedWindowRateLimiter } from "@/lib/leads/rate-limit";

const SECRET = "s".repeat(40);
const OLD_SECRET = "o".repeat(40);
const STORE = "11111111-1111-4111-8111-111111111111";
const OTHER_STORE = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-11T15:00:00Z");
const CURSOR = { createdAt: "2026-11-11T14:00:00.123456+00:00", id: "00000000-0000-0000-0000-000000000000" };

// Dados pessoais fictícios: nunca podem aparecer nos logs.
const PII = ["Maria Teste", "62900000001", "maria@example.test"];

function row(overrides: Partial<ExportLeadRow> = {}): ExportLeadRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    storeId: STORE,
    campaignId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    campaignSlug: "fabrica-de-aprovacao",
    campaignName: "Fábrica de Aprovação",
    formSchema: { hasTradeIn: { label: "Possui veículo na troca", format: "boolean" }, unused: { label: "Não usado" } },
    createdAt: "2026-11-11T14:30:00.654321+00:00",
    fullName: "Maria Teste",
    phone: "62900000001",
    email: "maria@example.test",
    formData: { hasTradeIn: true, hasDriversLicense: false },
    consentVersion: "2026-10-v1",
    consentAt: "2026-11-11T14:30:00.654321+00:00",
    utmSource: "instagram",
    utmMedium: "cpc",
    utmCampaign: "fabrica-nov",
    utmContent: null,
    utmTerm: null,
    pageUrl: "https://fabrica.example.test/?utm_source=instagram",
    referrer: null,
    illustrativeAmountCents: 5_475_000,
    illustrativePresentedAt: "2026-11-11T14:30:00.654321+00:00",
    illustrativeExpiresAt: "2026-11-13T02:30:00.654321+00:00",
    cpfCooldownUntil: "2026-11-26T03:00:00+00:00",
    ...overrides,
  };
}

function setup(overrides: Partial<CrmExportDeps> = {}, env: Record<string, string> = {}) {
  const logs: CrmExportLogEntry[] = [];
  const listCalls: Parameters<CrmExportDeps["listLeads"]>[0][] = [];
  const deps: CrmExportDeps = {
    config: readCrmExportConfig({ CRM_EXPORT_SECRET: SECRET, CRM_EXPORT_STORE_IDS: STORE, ...env }),
    listLeads: async (input) => {
      listCalls.push(input);
      return [row()];
    },
    countLeads: async () => 7,
    rateLimiter: null,
    now: () => NOW,
    newRequestId: () => "req-1",
    log: (entry) => logs.push(entry),
    ...overrides,
  };
  return { handler: createCrmExportHandler(deps), logs, listCalls };
}

function signed(pathAndQuery: string, opts: { secret?: string; ts?: number; signature?: string } = {}): Request {
  const ts = String(opts.ts ?? Math.floor(NOW.getTime() / 1000));
  const signature = opts.signature ?? `v1=${computeSignature(opts.secret ?? SECRET, ts, "GET", pathAndQuery)}`;
  return new Request(`https://leads.example.test${pathAndQuery}`, {
    method: "GET",
    headers: { "x-kapa-timestamp": ts, "x-kapa-signature": signature },
  });
}

const listQuery = (params: Record<string, string> = {}) =>
  `${EXPORT_PATH}?${new URLSearchParams({ storeId: STORE, afterCreatedAt: CURSOR.createdAt, afterId: CURSOR.id, ...params })}`;

describe("signature", () => {
  it("accepts the current and the previous secret and rejects others", () => {
    const base = { method: "GET", pathAndQuery: "/x?a=1", nowMs: NOW.getTime() };
    const ts = String(NOW.getTime() / 1000);
    const sig = (secret: string) => `v1=${computeSignature(secret, ts, "GET", "/x?a=1")}`;
    expect(verifySignature({ ...base, secrets: [SECRET, OLD_SECRET], timestampHeader: ts, signatureHeader: sig(OLD_SECRET) })).toEqual({ ok: true });
    expect(verifySignature({ ...base, secrets: [SECRET], timestampHeader: ts, signatureHeader: sig("x".repeat(40)) })).toEqual({ ok: false, reason: "mismatch" });
    // Segredo curto nunca autoriza, mesmo com assinatura "correta" para ele.
    expect(verifySignature({ ...base, secrets: ["short"], timestampHeader: ts, signatureHeader: sig("short") })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("binds method, path and query", () => {
    const ts = String(NOW.getTime() / 1000);
    const signature = `v1=${computeSignature(SECRET, ts, "GET", "/x?a=1")}`;
    const check = (pathAndQuery: string, method = "GET") =>
      verifySignature({ secrets: [SECRET], timestampHeader: ts, signatureHeader: signature, method, pathAndQuery, nowMs: NOW.getTime() });
    expect(check("/x?a=1").ok).toBe(true);
    expect(check("/x?a=2").ok).toBe(false);
    expect(check("/y?a=1").ok).toBe(false);
    expect(check("/x?a=1", "POST").ok).toBe(false);
  });

  it("rejects missing, malformed and expired headers", () => {
    const base = { secrets: [SECRET], method: "GET", pathAndQuery: "/x", nowMs: NOW.getTime() };
    expect(verifySignature({ ...base, timestampHeader: null, signatureHeader: "v1=" + "0".repeat(64) }).ok).toBe(false);
    expect(verifySignature({ ...base, timestampHeader: "abc", signatureHeader: "v1=" + "0".repeat(64) })).toEqual({ ok: false, reason: "malformed" });
    expect(verifySignature({ ...base, timestampHeader: String(NOW.getTime() / 1000), signatureHeader: "v2=abc" })).toEqual({ ok: false, reason: "malformed" });
    const old = String(NOW.getTime() / 1000 - 301);
    const sig = `v1=${computeSignature(SECRET, old, "GET", "/x")}`;
    expect(verifySignature({ ...base, timestampHeader: old, signatureHeader: sig })).toEqual({ ok: false, reason: "expired" });
  });
});

describe("config", () => {
  it("is disabled without a valid secret or store list", () => {
    expect(readCrmExportConfig({}).enabled).toBe(false);
    expect(readCrmExportConfig({ CRM_EXPORT_SECRET: SECRET }).enabled).toBe(false);
    expect(readCrmExportConfig({ CRM_EXPORT_SECRET: "short", CRM_EXPORT_STORE_IDS: STORE }).enabled).toBe(false);
    expect(readCrmExportConfig({ CRM_EXPORT_SECRET_PREVIOUS: SECRET, CRM_EXPORT_STORE_IDS: STORE }).enabled).toBe(false);
    expect(readCrmExportConfig({ CRM_EXPORT_SECRET: SECRET, CRM_EXPORT_STORE_IDS: "not-a-uuid" }).enabled).toBe(false);
  });

  it("parses stores case-insensitively and reports invalid entries without values", () => {
    const config = readCrmExportConfig({ CRM_EXPORT_SECRET: SECRET, CRM_EXPORT_STORE_IDS: ` ${STORE.toUpperCase()} , bad ` });
    expect(config.enabled).toBe(true);
    if (config.enabled) expect([...config.storeIds]).toEqual([STORE]);
    expect(config.warnings).toEqual(["invalid_store_id"]);
  });
});

describe("GET leads", () => {
  it("returns 404 when disabled, before checking anything else", async () => {
    const { handler, listCalls } = setup({ config: { enabled: false, warnings: [] } });
    const res = await handler.list(new Request(`https://leads.example.test${listQuery()}`));
    expect(res.status).toBe(404);
    expect(listCalls).toHaveLength(0);
  });

  it("requires a valid signature", async () => {
    const { handler, listCalls, logs } = setup();
    expect((await handler.list(new Request(`https://leads.example.test${listQuery()}`))).status).toBe(401);
    expect((await handler.list(signed(listQuery(), { secret: "x".repeat(40) }))).status).toBe(401);
    expect((await handler.list(signed(listQuery(), { ts: NOW.getTime() / 1000 - 600 }))).status).toBe(401);
    expect(listCalls).toHaveLength(0);
    expect(logs.map((l) => l.outcome)).toEqual(["unauthorized_missing", "unauthorized_mismatch", "unauthorized_expired"]);
  });

  it("refuses a store that is not allowed", async () => {
    const { handler, listCalls } = setup();
    const res = await handler.list(signed(listQuery({ storeId: OTHER_STORE })));
    expect(res.status).toBe(403);
    expect(listCalls).toHaveLength(0);
  });

  it("requires a cursor (no export of everything)", async () => {
    const { handler, listCalls } = setup();
    const path = `${EXPORT_PATH}?storeId=${STORE}`;
    const res = await handler.list(signed(path));
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual(["afterCreatedAt", "afterId"]);
    expect(listCalls).toHaveLength(0);
  });

  it("validates limit", async () => {
    const { handler } = setup();
    expect((await handler.list(signed(listQuery({ limit: String(MAX_LIMIT + 1) })))).status).toBe(400);
    expect((await handler.list(signed(listQuery({ limit: "0" })))).status).toBe(400);
    expect((await handler.list(signed(listQuery({ limit: "2.5" })))).status).toBe(400);
  });

  it("reads after the cursor up to now minus the settle window, asking for one extra row", async () => {
    const { handler, listCalls } = setup();
    const res = await handler.list(signed(listQuery({ limit: "10" })));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(listCalls).toEqual([
      { storeId: STORE, after: CURSOR, upTo: new Date(NOW.getTime() - SETTLE_SECONDS * 1000).toISOString(), limit: 11 },
    ]);
  });

  it("exports only the minimal fields and the labels of present keys", async () => {
    const { handler } = setup();
    const body = await (await handler.list(signed(listQuery()))).json();
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toEqual({ createdAt: "2026-11-11T14:30:00.654321+00:00", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const [item] = body.items;
    expect(Object.keys(item).sort()).toEqual(
      ["campaign", "consent", "contact", "cpfCooldownUntil", "createdAt", "formData", "formLabels", "id", "illustrative", "storeId", "tracking"].sort(),
    );
    expect(item.contact).toEqual({ name: "Maria Teste", phone: "62900000001", email: "maria@example.test" });
    expect(item.formLabels).toEqual({ hasTradeIn: { label: "Possui veículo na troca", format: "boolean" } });
    expect(item.illustrative).toEqual({
      amountCents: 5_475_000,
      presentedAt: "2026-11-11T14:30:00.654321+00:00",
      expiresAt: "2026-11-13T02:30:00.654321+00:00",
    });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/cpf"|birth|assigned|status"/i);
  });

  it("reports hasMore and trims the extra row", async () => {
    const rows = [row({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" }), row({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002" })];
    const { handler } = setup({ listLeads: async () => rows });
    const body = await (await handler.list(signed(listQuery({ limit: "1" })))).json();
    expect(body.items).toHaveLength(1);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-000000000001");
  });

  it("returns an empty page with a null cursor", async () => {
    const { handler } = setup({ listLeads: async () => [] });
    const body = await (await handler.list(signed(listQuery()))).json();
    expect(body).toMatchObject({ success: true, items: [], nextCursor: null, hasMore: false });
  });

  it("fails closed if a row belongs to another store", async () => {
    const { handler } = setup({ listLeads: async () => [row({ storeId: OTHER_STORE })] });
    const res = await handler.list(signed(listQuery()));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("Maria");
  });

  it("maps repository failures to 500 without details", async () => {
    const { handler } = setup({
      listLeads: async () => {
        throw new Error("boom with Maria Teste 62900000001");
      },
    });
    const res = await handler.list(signed(listQuery()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "INTERNAL_ERROR", requestId: "req-1" });
  });

  it("rate limits only signed calls", async () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });
    const { handler } = setup({ rateLimiter: limiter });
    expect((await handler.list(new Request(`https://leads.example.test${listQuery()}`))).status).toBe(401);
    expect((await handler.list(signed(listQuery()))).status).toBe(200);
    expect((await handler.list(signed(listQuery()))).status).toBe(429);
  });

  it("never logs personal data", async () => {
    const { handler, logs } = setup();
    await handler.list(signed(listQuery()));
    expect(logs).toEqual([expect.objectContaining({ operation: "list", status: 200, outcome: "ok", count: 1 })]);
    const text = JSON.stringify(logs);
    for (const value of PII) expect(text).not.toContain(value);
  });
});

describe("GET count", () => {
  const countQuery = (params: Record<string, string> = {}) =>
    `${COUNT_PATH}?${new URLSearchParams({ storeId: STORE, from: "2026-11-10T00:00:00Z", to: "2026-11-11T00:00:00Z", ...params })}`;

  it("returns the count for a signed, allowed request", async () => {
    const calls: unknown[] = [];
    const { handler } = setup({ countLeads: async (input) => (calls.push(input), 7) });
    const res = await handler.count(signed(countQuery()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, count: 7 });
    expect(calls).toEqual([{ storeId: STORE, from: "2026-11-10T00:00:00Z", to: "2026-11-11T00:00:00Z" }]);
  });

  it("rejects inverted or too long windows", async () => {
    const { handler } = setup();
    expect((await handler.count(signed(countQuery({ to: "2026-11-09T00:00:00Z" })))).status).toBe(400);
    expect((await handler.count(signed(countQuery({ to: "2026-12-30T00:00:00Z" })))).status).toBe(400);
  });

  it("requires signature and allowed store", async () => {
    const { handler } = setup();
    expect((await handler.count(new Request(`https://leads.example.test${countQuery()}`))).status).toBe(401);
    expect((await handler.count(signed(countQuery({ storeId: OTHER_STORE })))).status).toBe(403);
  });
});

describe("labelsFor", () => {
  it("ignores malformed schema entries", () => {
    expect(labelsFor({ a: "x", b: { label: "" }, c: { label: "C", format: 1 } }, { a: 1, b: 2, c: 3 })).toEqual({ c: { label: "C", format: null } });
  });
});
