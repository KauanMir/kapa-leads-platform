import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Projetos:
//   unit  → `npm test`: sem rede, roda sempre.
//   rls   → `npm run test:rls`:   Supabase remoto, exige ALLOW_REMOTE_RLS_TESTS=true.
//   api   → `npm run test:api`:   Supabase remoto, exige ALLOW_REMOTE_API_TESTS=true.
//   admin → `npm run test:admin`: Supabase remoto, exige ALLOW_REMOTE_ADMIN_TESTS=true.
//   e2e   → `npm run test:e2e`:   servidor rodando + Supabase remoto, exige ALLOW_REMOTE_E2E_TESTS=true.
// Remotos nunca rodam contra o Supabase de produção (supabase/tests/production-guard.ts).
const remote = {
  fileParallelism: false,
  testTimeout: 30_000,
  hookTimeout: 120_000,
  globalSetup: ["supabase/tests/production-guard.ts"],
};

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // Fora do Next, "server-only" lança erro ao ser importado; nos testes
      // (Node) usamos a versão vazia do próprio pacote.
      "server-only": fromRoot("./node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.{ts,tsx}"] } },
      { extends: true, test: { name: "rls", include: ["supabase/tests/rls.test.ts"], ...remote } },
      { extends: true, test: { name: "api", include: ["supabase/tests/public-leads-api.test.ts"], ...remote } },
      { extends: true, test: { name: "admin", include: ["supabase/tests/admin-access.test.ts"], ...remote } },
      { extends: true, test: { name: "e2e", include: ["supabase/tests/admin-e2e.test.ts"], ...remote } },
    ],
  },
});
