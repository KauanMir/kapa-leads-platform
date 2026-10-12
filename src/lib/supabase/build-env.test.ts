import { describe, expect, it } from "vitest";

import { buildEnvErrors } from "@/lib/supabase/build-env";

const OK = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
};

describe("buildEnvErrors (build de produção)", () => {
  it("ok com as 3 variáveis", () => expect(buildEnvErrors(OK)).toEqual([]));

  it("acusa ausentes", () => {
    const errors = buildEnvErrors({}).join("\n");
    expect(errors).toMatch(/NEXT_PUBLIC_SUPABASE_URL ausente/);
    expect(errors).toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente/);
    expect(errors).toMatch(/SUPABASE_SECRET_KEY ausente/);
  });

  it("URL do Supabase: https (http só local)", () => {
    expect(buildEnvErrors({ ...OK, NEXT_PUBLIC_SUPABASE_URL: "http://abc.supabase.co" })).toHaveLength(1);
    expect(buildEnvErrors({ ...OK, NEXT_PUBLIC_SUPABASE_URL: "abc.supabase.co" })).toHaveLength(1);
    expect(buildEnvErrors({ ...OK, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toEqual([]);
  });

  it("recusa segredo exposto via NEXT_PUBLIC_*", () => {
    expect(buildEnvErrors({ ...OK, NEXT_PUBLIC_SUPABASE_SECRET_KEY: "x" }).join()).toMatch(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
    expect(buildEnvErrors({ ...OK, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "x" })).toHaveLength(1);
    expect(buildEnvErrors({ ...OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" })).toHaveLength(1);
  });
});
