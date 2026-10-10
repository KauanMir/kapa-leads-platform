import { defineConfig } from "vitest/config";

// Único conjunto de testes atual: isolamento de RLS no Supabase remoto.
// Só roda via `npm run test:rls` e exige ALLOW_REMOTE_RLS_TESTS=true.
export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
