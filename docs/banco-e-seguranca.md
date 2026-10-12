# Banco de dados e segurança

As migrations em `supabase/migrations` são a fonte da verdade do banco. Docker **não** é necessário: tudo é aplicado direto no projeto Supabase remoto.

## Modelo

```
stores ──< campaigns ──< leads ──< lead_notes
   │                         └──< lead_events
   └──< store_members >── profiles (1:1 auth.users)
```

| Tabela | Observações |
|---|---|
| `stores` | Loja (tenant). `slug` único. |
| `campaigns` | `campaign_key` pública (`camp_pk_` + 32 caracteres `[a-z0-9]`), gerada pelo banco. `consent_version` vigente, `allowed_origins`, `form_schema`. `slug` único por loja. |
| `profiles` | Criado automaticamente quando um usuário é criado no Auth. `is_super_admin` = KAPA. |
| `store_members` | Vínculo usuário ↔ loja (`STORE_ADMIN` / `STORE_USER`). Um usuário pode ter várias lojas. |
| `leads` | `form_data` (JSONB), UTMs, `page_url`, `referrer`. `cpf` completo + `cpf_masked` gerado. Sem unique por CPF. Unique `(campaign_id, client_submission_id)`. |
| `lead_notes` | Só inclusão. `store_id` e `author_id` definidos pelo banco. |
| `lead_events` | Append-only, gerado por triggers: `CREATED`, `STATUS_CHANGED`, `NOTE_ADDED`. |

## Regras garantidas pelo banco

- **`store_id` do lead vem sempre da campanha.** Qualquer valor enviado é sobrescrito; uma FK composta `(campaign_id, store_id)` garante a consistência.
- **`consent_at = now()`** e **`status = NEW`** na criação, ignorando o que for enviado.
- Lead é rejeitado se a campanha ou a loja estiver inativa (`KL002`) ou se `consent_version` for diferente da campanha (`KL003`). Campanha inexistente: `KL001`.
- `store_id`, `campaign_id`, `client_submission_id`, `consent_version`, `consent_at` e `created_at` são imutáveis (`KL004`).
- CPF validado com dígitos verificadores (CHECK). Idade mínima e demais validações ficam na API (Fase 3).

## Acesso (RLS + GRANTs)

RLS é habilitado explicitamente em todas as tabelas pelas migrations.

| Quem | Acesso |
|---|---|
| `anon` (sem login) | Nenhum. |
| `STORE_USER` | Lê loja, campanhas, leads, notas e eventos **das próprias lojas**. Altera só `leads.status`. Cria notas. |
| `STORE_ADMIN` | Igual ao STORE_USER + lê membros e perfis dos membros das próprias lojas. |
| `SUPER_ADMIN` | Lê tudo. Cria/edita lojas, campanhas e vínculos. |
| `service_role` (chave secreta, só servidor) | Ignora RLS. Usado pela API pública (Fase 3). |

**CPF:** usuários autenticados **não** têm `SELECT` na coluna `leads.cpf`, apenas em `cpf_masked` (`***.456.789-**`). Por isso, consultas a `leads` precisam listar as colunas (`select=*` falha). A revelação do CPF completo será uma função controlada que registra `CPF_REVEALED` (fase do Admin). CPF nunca vai em URL, query string ou log.

Usuários/vínculos inativos (`profiles.is_active`, `store_members.is_active`) perdem acesso. Loja inativa bloqueia novos leads, mas os membros continuam vendo o histórico.

## Aplicar no Supabase remoto (sem Docker)

```bash
npx supabase login                          # abre o navegador (token pessoal)
npx supabase link --project-ref <ref>       # pede a senha do banco
npx supabase db push --dry-run --include-seed   # revisar
npx supabase db push --include-seed
npm run db:types                            # gera src/types/database.ts
```

Alternativa: colar os arquivos de `supabase/migrations` (em ordem) e depois `supabase/seed.sql` no SQL Editor do painel e então registrar o histórico com `npx supabase migration repair --status applied <versão>`.

## Criar o SUPER_ADMIN

1. No painel: **Authentication → Users → Add user** (e-mail + senha, marcar como confirmado). O `profile` é criado automaticamente.
2. No SQL Editor:

```sql
update public.profiles set is_super_admin = true where email = 'email-do-admin@exemplo.com';
```

## Testes de isolamento (RLS)

> ⚠️ O projeto Supabase atual é **produção**. As suítes remotas são bloqueadas nele por
> `supabase/tests/production-guard.ts`. Rode-as só contra um projeto Supabase separado de
> desenvolvimento/testes (ver [deploy-producao.md §8](deploy-producao.md#8-supabase-de-desenvolvimentotestes-pendente)).

`supabase/tests/rls.test.ts` cria lojas, campanhas, leads e usuários temporários (prefixo `rls-test-`) **no projeto remoto** e remove tudo ao final. Só roda com a trava explícita:

```powershell
# PowerShell
$env:ALLOW_REMOTE_RLS_TESTS = "true"; npm run test:rls; Remove-Item Env:ALLOW_REMOTE_RLS_TESTS
```

```bash
# bash
ALLOW_REMOTE_RLS_TESTS=true npm run test:rls
```

Sem a variável o teste aborta antes de qualquer acesso ao banco. Não roda em `build` nem em `npm install`. Use apenas em projeto de desenvolvimento.

Se uma execução for interrompida, a próxima remove automaticamente as sobras com prefixo `rls-test-`.

Os testes da API pública (`supabase/tests/public-leads-api.test.ts`, prefixo `api-test-`) seguem o mesmo modelo com a trava `ALLOW_REMOTE_API_TESTS=true` e o comando `npm run test:api`. `npm test` roda só os testes unitários, sem rede.
