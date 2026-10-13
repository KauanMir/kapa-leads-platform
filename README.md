# KAPA Leads Platform

Plataforma central da KAPA para **receber e gerenciar leads** vindos das Landing Pages das lojas automotivas (Vitrine Veículos, Fortium, RCAR, ...).

Este projeto **não é uma Landing Page**. Cada LP é um projeto independente que envia seus leads para a API pública desta plataforma.

```
STORE (loja) → CAMPAIGNS (campanhas) → LEADS
USERS → STORE_MEMBERS (vínculo usuário ↔ loja, com papel)
```

- A KAPA (`SUPER_ADMIN`) vê tudo.
- Cada loja (`STORE_ADMIN`, `STORE_USER`) vê somente os próprios dados.

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Supabase (Postgres, Auth, RLS) — sem Prisma
- Zod (validação)

O projeto é **neutro em relação à hospedagem**: nenhum código específico de provedor (Vercel, Cloudflare etc.). O destino de deploy será decidido no final.

## Requisitos

- Node.js 20.9 ou superior (recomendado: 24 LTS)
- npm

Docker **não** é necessário. As migrations ficam versionadas em `supabase/migrations` e são aplicadas no Supabase remoto (via Supabase CLI vinculada ao projeto ou SQL Editor).

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencher quando o Supabase for configurado
npm run dev                  # http://localhost:3000
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Sobe o build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera os tipos de rotas do Next e roda o TypeScript sem emitir arquivos |
| `npm run check` | `typecheck` + `lint` |
| `npm test` | Testes unitários (sem rede) |
| `npm run test:rls` | Testes de isolamento RLS no Supabase remoto (exige `ALLOW_REMOTE_RLS_TESTS=true`; **bloqueado no Supabase de produção**) |
| `npm run test:api` | Testes da API pública no Supabase remoto (exige `ALLOW_REMOTE_API_TESTS=true`; **bloqueado no Supabase de produção**) |
| `npm run test:admin` | Autorização do Admin por papel no Supabase remoto (exige `ALLOW_REMOTE_ADMIN_TESTS=true`; **bloqueado no Supabase de produção**) |
| `npm run test:e2e` | Telas do Admin via HTTP com sessões reais (servidor rodando + `ALLOW_REMOTE_E2E_TESTS=true`; **bloqueado no Supabase de produção**) |
| `npm run db:types` | Gera `src/types/database.ts` a partir do projeto Supabase vinculado |

- **Admin** (login, papéis, telas, primeiro SUPER_ADMIN, lojas, campanhas, `allowed_origins`, `form_schema`): [`docs/admin.md`](docs/admin.md).
- Banco, RLS e como aplicar migrations: [`docs/banco-e-seguranca.md`](docs/banco-e-seguranca.md).
- API pública para Landing Pages (`POST /api/public/leads`): [`docs/integracao-landing-page.md`](docs/integracao-landing-page.md).

## Estrutura de pastas

```
src/
  app/(auth)/login     tela de login
  app/(admin)/         Admin protegido (dashboard, leads, loja, perfil, config/*)
  app/api/public/      API pública das Landing Pages
  proxy.ts             renova a sessão e manda para /login quem não está logado
  components/          ui/ (básicos), admin/ (shell e menu), leads/, config/, profile/
  lib/supabase/        clientes Supabase (sessão do usuário / chave secreta server-only)
  lib/auth/            contexto do usuário (perfil + vínculos), guards de papel
  lib/admin/           consultas do Admin (sempre com a sessão → RLS), filtros, linha do tempo
  lib/actions/         Server Actions (revalidam sessão e permissão)
  lib/leads/           API pública: handler, schema, rate limit
  lib/validation/      CPF, telefone, nascimento
  lib/format/          datas (America/Sao_Paulo), dinheiro, telefone, status, form_data
  types/               tipos gerados do banco
supabase/
  migrations/          SQL versionado (fonte da verdade do banco)
  tests/               testes remotos (RLS, API pública, Admin, ponta a ponta)
docs/                  documentação (ex.: guia de integração das LPs)
```

## Regras de segurança (valem desde o primeiro commit)

- `SUPABASE_SECRET_KEY` só no servidor; nunca com prefixo `NEXT_PUBLIC_` (o build de produção falha se uma `NEXT_PUBLIC_*` parecer secreta).
- O navegador nunca acessa diretamente a tabela de leads.
- CPF nunca aparece em logs, URLs, query strings ou na listagem geral; no Admin aparece mascarado por padrão.
- A API pública só **cria** leads; nunca lista nem devolve dados pessoais.
- A loja é sempre descoberta pelo backend a partir da campanha (`campaignKey`); `store_id` enviado por LP nunca é aceito.
- RLS ligado em todas as tabelas: uma loja jamais acessa dados de outra.

## Fases

1. **Fundação** — projeto Next.js, TypeScript, Tailwind, ESLint, estrutura. ✅
2. **Banco e segurança** — migrations, RLS, GRANTs, triggers de eventos, seed, testes de isolamento. ✅
3. **API pública** `POST /api/public/leads` — validação, CORS por campanha, honeypot, idempotência, rate limit básico. ✅
4. **Autenticação** — login por e-mail/senha, sessão em cookies, guards no servidor, bloqueio de inativos. ✅
5. **Admin MVP** — dashboard, leads, detalhe com status/observações/linha do tempo, contato rápido, configurações KAPA. ✅
6. **Integração da LP Vitrine — Duelo de Aprovações** — LP envia direto do navegador, `form_schema` da campanha, teste local ponta a ponta (ver [`docs/integracao-landing-page.md`](docs/integracao-landing-page.md#10-campanha-integrada-duelo-de-aprovações)). ✅
7. **Preparação de produção** — build trava com env incompleta, cookies `Secure`/`HttpOnly`, headers de segurança, origens só `https`, checklist de go-live em [`docs/deploy-producao.md`](docs/deploy-producao.md). Hospedagem: Vercel (`gru1`; Hobby no desenvolvimento, Pro antes da campanha), plataforma em `https://leads.assessoriakapa.com.br`.

## Tarefas futuras (fora do MVP)

- Backup automático do banco (`pg_dump` agendado), já que o Supabase Free não oferece backups gerenciados.
- Projeto Supabase separado para desenvolvimento/testes (o atual é produção; as suítes remotas estão bloqueadas nele).
- SMTP próprio para convites e redefinição de senha ("esqueci a senha").
- Revelação auditada do CPF completo (`CPF_REVEALED`).
- Nomes dos colegas na linha do tempo para STORE_USER (hoje aparece "Membro da equipe"; exige ajuste de RLS/função).
- Anti-abuso mais forte na API pública (ex.: Cloudflare WAF/Turnstile, rate limit distribuído com Redis/KV, ou assinatura server-side para LPs com backend). O rate limit atual é em memória, por instância (padrão 30/60 s por IP, ajustável por `PUBLIC_LEADS_RATE_LIMIT_*`) — **migrar para a borda antes de escalar o tráfego pago**.
