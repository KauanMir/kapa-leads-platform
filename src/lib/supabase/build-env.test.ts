import { describe, expect, it } from "vitest";

import { buildEnvErrors } from "@/lib/supabase/build-env";
import { DEV_SUPABASE_REFS, PRODUCTION_SUPABASE_REF } from "@/lib/supabase/project";

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

  describe("Vercel: DEV x PRODUÇÃO pelo ref do Supabase", () => {
    const PROD = { ...OK, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` };

    it("Production só com o Supabase de produção", () => {
      expect(buildEnvErrors({ ...PROD, VERCEL_ENV: "production" })).toEqual([]);
      expect(buildEnvErrors({ ...OK, VERCEL_ENV: "production" }).join()).toMatch(/PRODUÇÃO precisa usar o Supabase de produção/);
    });

    it("Preview/Development nunca com o Supabase de produção", () => {
      expect(buildEnvErrors({ ...PROD, VERCEL_ENV: "preview" }).join()).toMatch(/não pode usar o Supabase de PRODUÇÃO/);
      expect(buildEnvErrors({ ...PROD, VERCEL_ENV: "development" }).join()).toMatch(/não pode usar o Supabase de PRODUÇÃO/);
    });

    it("Preview exige um Supabase DEV conhecido", () => {
      expect(buildEnvErrors({ ...OK, VERCEL_ENV: "preview" }).join()).toMatch(/Supabase DEV conhecido/);
      for (const ref of DEV_SUPABASE_REFS) {
        expect(buildEnvErrors({ ...OK, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, VERCEL_ENV: "preview" })).toEqual([]);
      }
    });

    it("build local (sem VERCEL_ENV) não aplica a regra", () => {
      expect(buildEnvErrors(PROD)).toEqual([]);
      expect(buildEnvErrors(OK)).toEqual([]);
    });
  });
});
