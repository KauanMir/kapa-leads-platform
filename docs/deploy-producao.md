# Deploy de produção — checklist

Vale para a **KAPA Leads Platform** e para a LP **Duelo de Aprovações** (repositório `duelo-de-aprovacoes`).
Os itens marcados com ⏳ dependem de decisões ainda em aberto (domínios, hospedagem, páginas legais).

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
| `NEXT_PUBLIC_KAPA_LEADS_API_URL` | ⏳ `https://<domínio-da-plataforma>` (só a origem, sem caminho) |
| `NEXT_PUBLIC_KAPA_CAMPAIGN_KEY` | `camp_pk_…` da campanha Duelo (Admin → Campanhas; o mesmo do `.env.local` atual) |
| `NEXT_PUBLIC_KAPA_CONSENT_VERSION` | `2026-10-v1` (igual à campanha no banco) |
| `NEXT_PUBLIC_PRIVACY_POLICY_URL` | ⏳ `https://…` da Política de Privacidade publicada |
| `NEXT_PUBLIC_TERMS_URL` | ⏳ `https://…` dos Termos de Uso publicados |
| `ALLOW_LOCAL_TEST_BUILD` | **não definir** (só build local de teste) |

O `next build` da LP falha se faltar qualquer uma, se a API não for `https` só com a origem (ou apontar para
`localhost`), se `campaignKey`/versão forem inválidas, ou se as URLs legais não forem `https`.

## 2. Supabase Auth (Dashboard → Authentication → URL Configuration) ⏳

O Admin usa só e-mail + senha, tudo no servidor (sem link mágico, OAuth ou "esqueci a senha"). As URLs abaixo só
importam para e-mails enviados pelo próprio Supabase (convite / redefinição pelo Dashboard), mas devem estar certas
antes do go-live:

- **Site URL:** `https://<domínio-da-plataforma>` (hoje provavelmente `http://localhost:3000`).
- **Redirect URLs:** `https://<domínio-da-plataforma>/**`. Manter `http://localhost:3000/**` só enquanto este mesmo
  projeto Supabase for usado em desenvolvimento.
- Não alterar antes de o domínio da plataforma estar definido.

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

O IP vem do primeiro valor de `x-forwarded-for` (ou `x-real-ip`). ⏳ Depende da hospedagem:

- **Vercel:** sobrescreve `x-forwarded-for` com o IP real — funciona como está.
- **Cloudflare na frente:** a Cloudflare *acrescenta* ao `x-forwarded-for` enviado pelo cliente (o primeiro valor
  pode ser forjado para driblar o limite); o IP confiável é `CF-Connecting-IP`. Ajustar `clientIpFromHeaders`
  (`src/lib/leads/rate-limit.ts`) quando a hospedagem for definida.

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
