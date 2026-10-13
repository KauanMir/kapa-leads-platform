# Deploy de produção — checklist

Vale para a **KAPA Leads Platform** e para a LP **Duelo de Aprovações** (repositório `duelo-de-aprovacoes`).
Os itens marcados com ⏳ dependem de decisões ainda em aberto.

## 0. Decisões

| Item | Decisão |
|---|---|
| Hospedagem | **Vercel**, time `kauan-s-projects3`, projetos `kapa-leads-platform` e `duelo-de-aprovacoes` (ligados ao GitHub, deploy de produção pela `main`). Plano **Hobby** durante o desenvolvimento; **upgrade do mesmo time para Pro antes da campanha operar de verdade** (o Hobby não permite uso comercial). Sem Cloudflare/OpenNext nesta fase. |
| Domínio da plataforma | `https://leads.assessoriakapa.com.br` |
| Domínio da LP | `https://duelo.assessoriakapa.com.br` (em uso). Migrar para `https://duelo.vitrineveiculos.com.br` **só com autorização explícita**, quando o projeto estiver pronto (ver seção 3). |
| Supabase | Dois projetos (região São Paulo): **PRODUÇÃO** (`scjkyzdagwkscuxydgld`, só o deploy de produção) e **DEV** (desenvolvimento, testes e previews). Ver [ambientes.md](ambientes.md). |
| Região das funções | `gru1` (São Paulo, junto do banco) — `vercel.json`. A LP é estática. |
| Política de Privacidade | `https://assessoriakapa.com.br/privacidade` (em revisão antes do tráfego real) |
| Termos de Uso | `https://assessoriakapa.com.br/termos` (em revisão antes do tráfego real) |

## 1. Variáveis de ambiente

### Plataforma

| Variável | Produção | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | obrigatória, `https` | Pública. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | obrigatória | Pública (`sb_publishable_…`); o acesso é controlado pelo RLS. |
| `SUPABASE_SECRET_KEY` | obrigatória | **Secreta**, só servidor. Marcar como "sensitive"/secret no provedor. |
| `PUBLIC_LEADS_RATE_LIMIT_MAX` | opcional | Padrão 30. |
| `PUBLIC_LEADS_RATE_LIMIT_WINDOW_SECONDS` | opcional | Padrão 60. |
| `PUBLIC_LEADS_DEV_ORIGINS` | **não definir** | Ignorada com `NODE_ENV=production` (conferido: `http://localhost:3001` recebe 403). |
| `ALLOW_REMOTE_*_TESTS`, `E2E_BASE_URL` | **não definir** | Só para testes locais. |

Na Vercel: **Production** → Supabase de produção; **Preview** e **Development** → Supabase DEV. O build confere o
ref do projeto e falha se um preview apontar para produção (ou a produção para outro projeto) — [ambientes.md §2](ambientes.md#2-travas-identificação-pelo-ref-do-projeto-nunca-pelo-nome-da-variável).

O `next build` **falha de propósito** se faltar uma das três variáveis do Supabase, se a URL não for `https`, ou se
alguma variável `NEXT_PUBLIC_*` parecer uma chave secreta (`sb_secret_…`, nomes com `SECRET`/`SERVICE_ROLE`).

### LP Duelo

Todas públicas (embutidas no build). Detalhes no `README.md` da LP.

| Variável | Valor de produção |
|---|---|
| `NEXT_PUBLIC_KAPA_LEADS_API_URL` | `https://leads.assessoriakapa.com.br` (só a origem, sem caminho) |
| `NEXT_PUBLIC_KAPA_CAMPAIGN_KEY` | `camp_pk_…` da campanha Duelo (Admin → Campanhas; o mesmo do `.env.local` atual) |
| `NEXT_PUBLIC_KAPA_CONSENT_VERSION` | `2026-10-v1` (igual à campanha no banco) |
| `NEXT_PUBLIC_PRIVACY_POLICY_URL` | `https://assessoriakapa.com.br/privacidade` |
| `NEXT_PUBLIC_TERMS_URL` | `https://assessoriakapa.com.br/termos` |
| `ALLOW_LOCAL_TEST_BUILD` | **não definir** (só build local de teste) |

O `next build` da LP falha se faltar qualquer uma, se a API não for `https` só com a origem (ou apontar para
`localhost`), se `campaignKey`/versão forem inválidas, ou se as URLs legais não forem `https`.

### DNS (Registro.br)

| Host | Tipo | Valor |
|---|---|---|
| `leads.assessoriakapa.com.br` | CNAME | `25dd0ce7240afe36.vercel-dns-017.com.` (projeto `kapa-leads-platform`) |
| `duelo.assessoriakapa.com.br` | CNAME | `51aff8f98ba9df30.vercel-dns-017.com.` (projeto `duelo-de-aprovacoes`) |

Valores conferíveis com `vercel domains verify <domínio>`. HTTPS (Let's Encrypt) emitido pela Vercel; `http` → `https` (308).

## 2. Supabase Auth (Dashboard → Authentication → URL Configuration)

O Admin usa só e-mail + senha, tudo no servidor (sem link mágico, OAuth ou "esqueci a senha"). As URLs abaixo só
importam para e-mails enviados pelo próprio Supabase (convite / redefinição pelo Dashboard), mas devem estar certas
antes do go-live:

- **Site URL:** `https://leads.assessoriakapa.com.br`
- **Redirect URLs:** `https://leads.assessoriakapa.com.br/**`. (`http://localhost:3000/**` vai para o projeto DEV; remover
  do projeto de produção quando o DEV estiver em uso.)

Configurado em 13/10/2026.

Sessão: cookies `sb-<ref>-auth-token` com `HttpOnly`, `SameSite=Lax` e, em produção, `Secure` (conferido no
`next start`). Exigem HTTPS no domínio da plataforma.

## 3. Origens permitidas da campanha Duelo

Hoje: `allowed_origins = ['https://duelo.assessoriakapa.com.br']` (13/10/2026). Origens fora da lista recebem 403
(conferido: `*.vercel.app` e `localhost`). `localhost` nunca entra aqui; no desenvolvimento local usar
`PUBLIC_LEADS_DEV_ORIGINS`, ignorada em produção.

Ao migrar para o domínio da Vitrine (com autorização): adicionar a nova origem **antes** de trocar o domínio da LP e
remover a antiga só depois do teste.

- Admin → Campanhas → Duelo de Aprovações → Origens permitidas.
- Cadastrar **somente** a origem `https://<domínio-da-lp>`; a variação com `www` só se ela realmente servir a LP
  (se `www` redireciona para o domínio sem `www`, não precisa).
- O formulário recusa `http` (exceto localhost), caminho e curinga (`*`).

## 4. Páginas públicas que precisam existir antes do tráfego real

Publicadas (HTTP 200 em 13/10/2026); revisão jurídica do texto ainda pendente antes do tráfego pago.

1. **Política de Privacidade** (HTTPS) → `NEXT_PUBLIC_PRIVACY_POLICY_URL`. Linkada no checkbox de consentimento e no
   rodapé. O texto deve corresponder ao consentimento versão `2026-10-v1`; se o texto do checkbox mudar, criar nova
   versão na campanha **e** na LP.
2. **Termos de Uso** (HTTPS) → `NEXT_PUBLIC_TERMS_URL`. Linkado no rodapé.

O conteúdo jurídico não faz parte destes repositórios.

## 5. Rate limit e anti-abuso

Mantida a solução atual: limite por IP em memória, por instância (padrão 30 envios/60 s, ajustável). Ver
[integracao-landing-page.md §9](integracao-landing-page.md#9-limites-e-proteção-contra-abuso).

**Antes de escalar tráfego alto**, recomendamos uma ou mais camadas na borda:

- Cloudflare WAF / regra de Rate Limiting na rota `POST /api/public/leads`;
- Cloudflare Turnstile no simulador da LP;
- limiter distribuído (Redis/KV).

O IP vem do primeiro valor de `x-forwarded-for` (ou `x-real-ip`). Na **Vercel** (decisão atual) esse header é
sobrescrito com o IP real — funciona como está. Se um dia a Cloudflare ficar na frente (proxy laranja), ela
*acrescenta* ao `x-forwarded-for` enviado pelo cliente; aí o IP confiável passa a ser `CF-Connecting-IP` e
`clientIpFromHeaders` (`src/lib/leads/rate-limit.ts`) precisa ser ajustado.

Depois do upgrade para Vercel Pro, também dá para criar uma regra de rate limit no Firewall (WAF) para `POST /api/public/leads`.

## 6. Headers de segurança (plataforma)

Todas as rotas: `X-Frame-Options: DENY`, `CSP frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritiva; sem `X-Powered-By`.
Páginas do Admin: `Cache-Control: private, no-store`. HSTS fica com o provedor/HTTPS do domínio.

## 7. Checklist de entrada em operação (go-live)

Situação em 13/10/2026 (✅ feito, ⏳ pendente). Fluxo diário dos usuários: [operacao-lojas.md](operacao-lojas.md).

**Infraestrutura**

1. ✅ Domínios e HTTPS: `leads.assessoriakapa.com.br` (Admin/API) e `duelo.assessoriakapa.com.br` (LP).
2. ✅ Supabase Auth: Site URL / Redirect URLs (seção 2).
3. ✅ Origem da LP cadastrada na campanha (seção 3).
4. ✅ Teste real LP de produção → API → Supabase → Admin (Fase 7); leads de teste apagados (produção com 0 leads).
5. ✅ Supabase DEV separado (`kapa-leads-platform-dev`); `.env.local` e Vercel Preview/Development no DEV
   ([ambientes.md](ambientes.md)).
6. ✅ Suítes remotas verdes no DEV (RLS 22, API 9, Admin 23, E2E 13) e teste LP local → API → DEV.
7. ⏳ `npm run db:compare` (DEV x produção, item a item) e `npm run prod:check` com o CLI enxergando as duas contas.
8. ⏳ Remover `http://localhost:3000/**` das Redirect URLs do projeto de produção (seção 2).

**Pessoas**

9. ⏳ Primeiro STORE_ADMIN real da Vitrine (e STORE_USERs, se houver), vinculados só à Vitrine Veículos.
10. ⏳ Checagem de permissões com os usuários reais ([operacao-lojas.md §5](operacao-lojas.md#5-checagem-depois-de-criar-os-usuários-reais)).

**ANTES DE TRÁFEGO REAL (bloqueantes)**

11. ⏳ **Revisão jurídica/comercial final** da Política de Privacidade e dos Termos de Uso (seção 4).
12. ⏳ **"PRÉ-APROVADO"**: validação comercial/jurídica do texto da LP antes de campanha pública.
13. ⏳ **ANTES DE OPERAÇÃO COMERCIAL REAL: upgrade do time da Vercel para Pro** (o Hobby não permite uso comercial).
14. ⏳ Antes de escalar o tráfego pago: proteção na borda (seção 5).

**Fora desta etapa (só com autorização explícita)**

- Migrar a LP para `duelo.vitrineveiculos.com.br` (seção 3).
- Backup automático do banco (`pg_dump` agendado).

## 8. Supabase de desenvolvimento/testes

Ver [ambientes.md](ambientes.md). As suítes remotas (`test:rls`, `test:api`, `test:admin`, `test:e2e`) criam e
apagam usuários, lojas e leads e só rodam no Supabase DEV — `supabase/tests/production-guard.ts` bloqueia qualquer
outro projeto, inclusive produção, mesmo com `ALLOW_REMOTE_*=true`.
