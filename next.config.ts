import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { buildEnvErrors } from "./src/lib/supabase/build-env";

/** Headers de segurança para todas as rotas (Admin e API). HSTS fica com o provedor/HTTPS do domínio. */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    // A raiz leva ao Admin; o proxy manda para /login quem não está logado.
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default function config(phase: string): NextConfig {
  // Build de produção com configuração incompleta não pode passar despercebido.
  if (phase === PHASE_PRODUCTION_BUILD) {
    const errors = buildEnvErrors(process.env);
    if (errors.length) throw new Error(`[KAPA] Configuração incompleta para o build:\n- ${errors.join("\n- ")}`);
  }
  return nextConfig;
}
