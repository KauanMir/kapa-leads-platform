import { describe, expect, it } from "vitest";

import { PRODUCTION_SUPABASE_REF, supabaseProjectKind, supabaseProjectRef } from "@/lib/supabase/project";

const REF = "abcdefghij0123456789";

describe("supabaseProjectRef (estrito, falha fechado)", () => {
  it("lê o ref de https://<ref>.supabase.co", () => {
    expect(supabaseProjectRef(`https://${REF}.supabase.co`)).toBe(REF);
    expect(supabaseProjectRef(`https://${REF}.supabase.co/`)).toBe(REF);
    expect(supabaseProjectRef(` https://${REF}.supabase.co `)).toBe(REF);
  });

  it("não identifica outras formas", () => {
    for (const url of [
      undefined,
      "",
      "lixo",
      `http://${REF}.supabase.co`,
      `https://${REF}.supabase.co:8443`,
      `https://${REF}.supabase.co/rest/v1`,
      `https://user:pass@${REF}.supabase.co`,
      `https://${REF}.supabase.co.evil.com`,
      `https://x.${REF}.supabase.co`,
      "https://abc.supabase.co",
      "https://api.minhaempresa.com.br",
    ]) {
      expect(supabaseProjectRef(url), String(url)).toBeNull();
    }
  });
});

describe("supabaseProjectKind", () => {
  it("produção pelo ref", () => expect(supabaseProjectKind(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`)).toBe("production"));
  it("local", () => expect(supabaseProjectKind("http://127.0.0.1:54321")).toBe("local"));
  it("desconhecido", () => {
    expect(supabaseProjectKind(`https://${REF}.supabase.co`)).toBe("unknown");
    expect(supabaseProjectKind("https://api.minhaempresa.com.br")).toBe("unknown");
    expect(supabaseProjectKind(undefined)).toBe("unknown");
  });
});
