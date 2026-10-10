import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Projetos:
//   unit → `npm test`: sem rede, roda sempre.
//   rls  → `npm run test:rls`: Supabase remoto, exige ALLOW_REMOTE_RLS_TESTS=true.
//   api  → `npm run test:api`: Supabase remoto, exige ALLOW_REMOTE_API_TESTS=true.
const remote = { fileParallelism: false, testTimeout: 30_000, hookTimeout: 120_000 };

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
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      { extends: true, test: { name: "rls", include: ["supabase/tests/rls.test.ts"], ...remote } },
      { extends: true, test: { name: "api", include: ["supabase/tests/public-leads-api.test.ts"], ...remote } },
    ],
  },
});
