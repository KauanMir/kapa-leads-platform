# Ambientes: DEV x PRODUÇÃO

Regra única: **desenvolvimento, testes e previews usam o Supabase DEV. Só o deploy de produção usa o Supabase de
produção.** Produção nunca recebe testes automatizados nem dados fictícios.

## 1. Mapa

| Onde roda | Plataforma (Supabase) | LP Duelo (API + campanha) |
|---|---|---|
| Local (`npm run dev`, testes) | **DEV** (`.env.local`) | plataforma local `http://localhost:3000` + campanha **Duelo de Aprovações DEV** |
| Vercel **Preview** | **DEV** (variáveis do ambiente Preview) | nunca a API de produção (o build falha); ver §5 |
| Vercel **Development** (`vercel env pull`) | **DEV** | — |
| Vercel **Production** | **PRODUÇÃO** | `https://leads.assessoriakapa.com.br` + campanha real |

| Projeto Supabase | Ref | Conteúdo |
|---|---|---|
| `kapa-leads-platform` (PRODUÇÃO, São Paulo) | `scjkyzdagwkscuxydgld` | Dados reais. Vitrine Veículos + Duelo de Aprovações. |
| `kapa-leads-platform-dev` (DEV, São Paulo) | em `DEV_SUPABASE_REFS` | Só dados fictícios: Vitrine Veículos DEV / Duelo de Aprovações DEV, Fortium DEV / Aprova Tudo DEV, sobras temporárias das suítes. |

Os refs não são segredo (fazem parte da URL pública) e ficam versionados em `src/lib/supabase/project.ts` — a fonte
única usada pelo build, pelas suítes e pelos scripts.

## 2. Travas (identificação pelo ref do projeto, nunca pelo nome da variável)

| Onde | Trava |
|---|---|
| `next build` da plataforma na Vercel | `VERCEL_ENV=production` exige o ref de produção; `preview`/`development` exigem um ref de `DEV_SUPABASE_REFS` (o de produção é recusado). `src/lib/supabase/build-env.ts`. |
| `next build` da LP na Vercel | `VERCEL_ENV=preview`/`development` recusa a API de produção; `production` exige ela. `lib/kapa-config.ts` (repositório da LP). |
| Suítes remotas (`test:rls`, `test:api`, `test:admin`, `test:e2e`) | `supabase/tests/production-guard.ts`, antes de qualquer escrita: (1) URL estritamente `https://<ref>.supabase.co` — domínio próprio/proxy/URL estranha bloqueia; (2) ref ≠ produção; (3) ref ∈ `DEV_SUPABASE_REFS`; (4) `E2E_BASE_URL` só `localhost`; (5) ao vivo: a chave secreta é aceita pelo projeto da URL **e** o banco tem a loja-marcador `vitrine-veiculos-dev` (nunca existe em produção). Repetida dentro de cada suíte. Mais a flag `ALLOW_REMOTE_*_TESTS=true`. |
| `supabase/seed-dev.sql` | Aborta se o banco tiver a loja de produção `vitrine-veiculos`. |
| `npm run dev:setup` | Só aceita ref de `DEV_SUPABASE_REFS`, nunca o de produção; recusa banco com a loja de produção; nunca aplica `supabase/seed.sql` (seed de produção). |
| CLI do Supabase | Fica **vinculado ao DEV** (`supabase/.temp/project-ref`). Um `supabase db push` esquecido cai no DEV. |

## 3. Variáveis

### `.env.local` da plataforma (local) → DEV

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref-dev>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…   (do DEV)
SUPABASE_SECRET_KEY=sb_secret_…                         (do DEV)
PUBLIC_LEADS_DEV_ORIGINS=http://localhost:3001
```

As chaves do DEV saem de `npx supabase projects api-keys --project-ref <ref-dev> --reveal` (login do CLI) ou do
Dashboard → Project Settings → API Keys. **As chaves de produção não ficam em nenhum arquivo local**: existem só na
Vercel (Production) e no Dashboard.

### Vercel — plataforma (`kapa-leads-platform`)

| Variável | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | produção | DEV | DEV |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | produção | DEV | DEV |
| `SUPABASE_SECRET_KEY` (sensitive) | produção | DEV | DEV |

### Vercel — LP (`duelo-de-aprovacoes`)

Production: valores do [deploy-producao.md §1](deploy-producao.md#1-variáveis-de-ambiente). Preview: ver §5.

### `.env.local` da LP (local) → plataforma local + campanha DEV

```
NEXT_PUBLIC_KAPA_LEADS_API_URL=http://localhost:3000
NEXT_PUBLIC_KAPA_CAMPAIGN_KEY=camp_pk_…   (campanha "Duelo de Aprovações DEV": Admin local → Campanhas)
NEXT_PUBLIC_KAPA_CONSENT_VERSION=2026-10-v1
```

## 4. Comandos

| Comando | O que faz | Toca produção? |
|---|---|---|
| `npm run dev:setup` | Aplica as migrations versionadas no DEV (`supabase db push`, as mesmas de produção) + `seed-dev.sql`. Idempotente. | Não |
| `npm run dev:setup -- status` | Estado do DEV: migrations, lojas, campanhas, contagens e sobras de teste. | Não |
| `npm run db:compare` | Compara a estrutura DEV x produção (tabelas, colunas, enums, RLS, policies, funções, triggers, constraints, índices, GRANTs). Sai com erro se houver diferença. | Só leitura |
| `npm run prod:check` | Conferência de produção: leads, SUPER_ADMIN ativo, Vitrine/Duelo ativas, lojas de teste. Só contagens. | Só leitura |

Os três últimos usam `supabase db query` (Management API, login do CLI): sem senha do banco e sem chaves no disco.

## 5. LP em Preview

O preview da LP **nunca** envia para a API de produção (o build falha) e, mesmo que enviasse, a origem `*.vercel.app`
não está em `allowed_origins` da campanha real (403). Sem variáveis no ambiente Preview da LP, o build de preview
falha — de propósito.

Para um preview da LP enviar leads de verdade ao DEV, seria preciso um endereço público e estável da plataforma DEV
(os previews da plataforma ficam atrás da proteção de deploy da Vercel). Até lá, o teste LP → API → DEV é feito
**localmente** (LP em `:3001` → plataforma em `:3000` → Supabase DEV).

## 6. Testes

```powershell
# PowerShell — sempre com o .env.local apontando para o DEV
npm run check; npm test
$env:ALLOW_REMOTE_RLS_TESTS="true"; npm run test:rls; Remove-Item Env:ALLOW_REMOTE_RLS_TESTS
$env:ALLOW_REMOTE_API_TESTS="true"; npm run test:api; Remove-Item Env:ALLOW_REMOTE_API_TESTS
$env:ALLOW_REMOTE_ADMIN_TESTS="true"; npm run test:admin; Remove-Item Env:ALLOW_REMOTE_ADMIN_TESTS
# e2e: em outro terminal, npm run build; npx next start -p 3123
$env:ALLOW_REMOTE_E2E_TESTS="true"; npm run test:e2e; Remove-Item Env:ALLOW_REMOTE_E2E_TESTS
npm run dev:setup -- status   # sobras de teste devem ser 0
npm run prod:check            # produção intacta
```

Cada suíte cria dados com prefixo próprio (`rls-test-`, `api-test-`, `adm-test-`, `e2e-test-`), apaga tudo ao final e,
se uma execução for interrompida, a próxima remove as sobras. A loja-marcador e as lojas/campanhas DEV do seed não são
apagadas.

## 7. Adicionar outro Supabase DEV (ou trocar)

1. Criar o projeto (Dashboard), região São Paulo.
2. Incluir o ref em `DEV_SUPABASE_REFS` (`src/lib/supabase/project.ts`) e fazer commit.
3. `npm run dev:setup -- <ref>` e `npm run db:compare -- <ref>`.
4. Atualizar `.env.local` e as variáveis Preview/Development da Vercel.

Migrations novas: aplicar e testar primeiro no DEV (`npm run dev:setup`), depois em produção **só com autorização**
(vincular o CLI à produção, `supabase db push`, e voltar o vínculo para o DEV).
