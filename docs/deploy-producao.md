# Deploy de produção — checklist

Vale para a **KAPA Leads Platform** e para a LP **Duelo de Aprovações** (repositório `duelo-de-aprovacoes`).
Os itens marcados com ⏳ dependem de decisões ainda em aberto.

## 0. Decisões

| Item | Decisão |
|---|---|
| Hospedagem | **Vercel Pro**, os dois projetos no mesmo time. Sem Cloudflare/OpenNext nesta fase. |
| Domínio da plataforma | `https://leads.assessoriakapa.com.br` |
| Domínio da LP | ⏳ `https://duelo.vitrineveiculos.com.br` (preferência) ou `https://duelo.assessoriakapa.com.br` |
| Supabase | O projeto atual é **PRODUÇÃO** (região São Paulo). Testes remotos bloqueados nele (seção 8). |
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

## 2. Supabase Auth (Dashboard → Authentication → URL Configuration)

O Admin usa só e-mail + senha, tudo no servidor (sem link mágico, OAuth ou "esqueci a senha"). As URLs abaixo só
importam para e-mails enviados pelo próprio Supabase (convite / redefinição pelo Dashboard), mas devem estar certas
antes do go-live:

- **Site URL:** `https://leads.assessoriakapa.com.br`
- **Redirect URLs:** `https://leads.assessoriakapa.com.br/**`. Remover `http://localhost:3000/**`: este projeto é
  produção; o desenvolvimento vai para um projeto Supabase separado (seção 8).

Sessão: cookies `sb-<ref>-auth-token` com `HttpOnly`, `SameSite=Lax` e, em produção, `Secure` (conferido no
`next start`). Exigem HTTPS no domínio da plataforma.

## 3. Origens permitidas da campanha Duelo ⏳

Hoje `allowed_origins` está **vazio** (a LP em produção recebe 403 até o cadastro). Quando o domínio da LP existir:

- Admin → Campanhas → Duelo de Aprovações → Origens permitidas.
- Cadastrar **somente** a origem `https://<domínio-da-lp>`; a variação com `www` só se ela realmente servir a LP
  (se `www` redireciona para o domínio sem `www`, não precisa).
- O formulário recusa `http` (exceto localhost), caminho e curinga (`*`).

## 4. Páginas públicas que precisam existir antes do tráfego real ⏳

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

Na Vercel Pro também dá para criar uma regra de rate limit no Firewall (WAF) para `POST /api/public/leads`.

## 6. Headers de segurança (plataforma)

Todas as rotas: `X-Frame-Options: DENY`, `CSP frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritiva; sem `X-Powered-By`.
Páginas do Admin: `Cache-Control: private, no-store`. HSTS fica com o provedor/HTTPS do domínio.

## 7. Ordem sugerida do go-live

1. Publicar Política de Privacidade e Termos de Uso.
2. Deploy da plataforma com as variáveis da seção 1 → testar login no domínio final.
3. Supabase Auth: Site URL / Redirect URLs (seção 2).
4. Deploy da LP com as variáveis da seção 1.
5. Cadastrar a origem da LP na campanha (seção 3).
6. Teste real: simular na LP de produção → lead aparece no Admin; repetir o envio (200 idempotente, sem duplicar).
7. Só então apagar o lead "TESTE Demonstracao KAPA (pode apagar)" e liberar o tráfego pago.

## 8. Supabase de desenvolvimento/testes (pendente)

O projeto Supabase atual é **produção**. As suítes remotas (`test:rls`, `test:api`, `test:admin`, `test:e2e`) criam e
apagam usuários, lojas e leads; por isso `supabase/tests/production-guard.ts` **bloqueia** essas suítes quando
`NEXT_PUBLIC_SUPABASE_URL` aponta para o projeto de produção — mesmo com `ALLOW_REMOTE_*=true`.

**Necessário:** criar um projeto Supabase separado para desenvolvimento/testes, aplicar as migrations
(`docs/banco-e-seguranca.md`) e apontar o `.env.local` de desenvolvimento para ele. Até lá, só `npm test`
(unitários, sem rede) roda localmente. O `npm run dev` local também usa o banco de produção enquanto o `.env.local`
apontar para ele: cuidado com dados de teste.
