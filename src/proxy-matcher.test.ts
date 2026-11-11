import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// O matcher do Next é uma string estática; o teste lê o arquivo para não importar o proxy
// (que depende de next/server e das variáveis do Supabase).
const source = readFileSync(fileURLToPath(new URL("./proxy.ts", import.meta.url)), "utf8");
const pattern = /matcher:\s*\["(.+)"\]/.exec(source)?.[1].replace(/\\\\/g, "\\");
const matcher = new RegExp(`^${pattern}$`);

describe("proxy matcher", () => {
  it("keeps the Admin behind the session proxy", () => {
    for (const path of ["/", "/leads", "/leads/abc", "/config/campanhas", "/api/integrations/other", "/api/integrations/crmx"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });

  it("skips the public API and the signed CRM export only", () => {
    for (const path of ["/api/public/leads", "/api/integrations/crm/leads", "/api/integrations/crm/leads/count"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });
});
