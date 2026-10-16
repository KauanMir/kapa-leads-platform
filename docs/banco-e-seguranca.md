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
| `leads` | `form_data` (JSONB), UTMs, `page_url`, `referrer`. `cpf` completo + `cpf_masked` gerado. Sem unique por CPF. Unique `(campaign_id, client_submission_id)`. `assigned_to` = SDR responsável (FK composta `(store_id, assigned_to)` → `store_members`: só membro da mesma loja). |
| `lead_notes` | Só inclusão. `store_id` e `author_id` definidos pelo banco. |
| `lead_events` | Append-only, gerado pelo banco: `CREATED`, `STATUS_CHANGED`, `NOTE_ADDED`, `ASSIGNED` (`{from, to}` = ids de usuário), `CPF_REVEALED` (payload vazio). Nunca contém CPF. |

## Regras garantidas pelo banco

- **`store_id` do lead vem sempre da campanha.** Qualquer valor enviado é sobrescrito; uma FK composta `(campaign_id, store_id)` garante a consistência.
- **`consent_at = now()`** e **`status = NEW`** na criação, ignorando o que for enviado.
- Lead é rejeitado se a campanha ou a loja estiver inativa (`KL002`) ou se `consent_version` for diferente da campanha (`KL003`). Campanha inexistente: `KL001`.
- `store_id`, `campaign_id`, `client_submission_id`, `consent_version`, `consent_at` e `created_at` são imutáveis (`KL004`).
- CPF validado com dígitos verificadores (CHECK). Idade mínima e demais validações ficam na API (Fase 3).
- Responsável só muda por `assign_lead()` (Fase 9); erros: `KL010` lead fora do alcance, `KL011` sem permissão, `KL012` lead já
  tem outro responsável, `KL013` responsável não é membro ativo da loja.
- Lead só é excluído por `delete_lead()`, um por chamada (`KL010` fora do alcance, `KL011` não é gerente). Observações e histórico
  saem junto pelas FKs `ON DELETE CASCADE`, na mesma transação. Nenhum `GRANT DELETE` em `leads`/`lead_notes`/`lead_events` para `authenticated`.

## Acesso (RLS + GRANTs)

RLS é habilitado explicitamente em todas as tabelas pelas migrations.

| Quem | Acesso |
|---|---|
| `anon` (sem login) | Nenhum. |
| `STORE_USER` (SDR) | Lê loja, campanhas, leads, notas e eventos **das próprias lojas** (exceto `CPF_REVEALED`). **Só nos leads em que é o responsável:** altera `leads.status`, cria notas e revela CPF (auditado). Assume para si lead **sem responsável**. |
| `STORE_ADMIN` (gerente) | Lê tudo da própria loja + membros e perfis dos membros; vê `CPF_REVEALED`; altera status, cria notas e revela CPF de **qualquer** lead da loja; atribui/reatribui/devolve leads para membros ativos da loja; **exclui** leads da própria loja. |
| `SUPER_ADMIN` | Lê tudo. Cria/edita lojas, campanhas e vínculos. Atribui em qualquer loja (só para membros daquela loja). Exclui leads de qualquer loja. |
| `service_role` (chave secreta, só servidor) | Ignora RLS. Usado pela API pública (Fase 3). |

**CPF:** usuários autenticados **não** têm `SELECT` na coluna `leads.cpf`, apenas em `cpf_masked` (`***.456.789-**`). Por isso, consultas a `leads` precisam listar as colunas (`select=*` falha). O CPF completo sai **só** por `reveal_lead_cpf(lead)`: confere usuário ativo + loja do lead + `private.can_work_lead` (SDR só se for o responsável), grava `CPF_REVEALED` (sem o CPF) e devolve o CPF daquele lead. CPF nunca vai em URL, query string, log ou HTML inicial.

**Funções da Fase 9** (`public`, `EXECUTE` só para `authenticated`):

| Função | Tipo | O que faz |
|---|---|---|
| `assign_lead(lead, usuário | null)` | SECURITY DEFINER | Atribui/reatribui/devolve (gerente/KAPA) ou assume para si um lead sem responsável (SDR). Trava a linha (`FOR UPDATE`): dois SDRs não assumem o mesmo lead. |
| `reveal_lead_cpf(lead)` | SECURITY DEFINER | CPF de um lead + evento `CPF_REVEALED`. Fora da loja: `KL010`; SDR que não é o responsável: `KL011`. |
| `private.can_work_lead(lead)` | SECURITY DEFINER (privada) | Regra única de quem TRABALHA o lead: KAPA, gerente da loja, ou o SDR responsável. Usada pela policy de `lead_notes` e por `reveal_lead_cpf`; a policy `leads_update` aplica a mesma regra direto na linha. |
| `store_team()` | SECURITY DEFINER | Nome, papel e se está ativo dos membros das lojas do usuário (sem e-mail). O RLS de `profiles` continua restrito. |
| `lead_kpis(loja, campanha, de, até)` | SECURITY INVOKER | Contagens por (responsável, status) + tempo até o 1º atendimento. Usa o RLS do usuário; SDR só agrega os próprios leads e a fila. |

`leads.assigned_to` não tem `GRANT UPDATE` para `authenticated`: um `UPDATE` direto é negado. Policies trocadas pela
Fase 9: `leads_update` e `lead_notes_insert` (SDR só no próprio lead) e `lead_events_select` (`CPF_REVEALED` só gerente/KAPA). Rollback da Fase 9:
`supabase/rollbacks/20261014120000_lead_assignment_cpf_kpis.down.sql`.

**Excluir lead** (migration `20261016120000_delete_lead`): `delete_lead(lead)`, SECURITY DEFINER, `EXECUTE` só para `authenticated`.
SUPER_ADMIN ativo: qualquer lead; STORE_ADMIN ativo: só da própria loja; SDR: nunca (`KL011`). Outra loja, usuário ou vínculo inativo,
lead inexistente: `KL010`. Trava a linha (`FOR UPDATE`) e apaga lead + observações + histórico (cascade). Não fica registro da exclusão.
Rollback: `supabase/rollbacks/20261016120000_delete_lead.down.sql` (só remove a função; leads excluídos não voltam).

Usuários/vínculos inativos (`profiles.is_active`, `store_members.is_active`) perdem acesso. Loja inativa bloqueia novos leads, mas os membros continuam vendo o histórico.

## Aplicar no Supabase remoto (sem Docker)

No **DEV**: `npm run dev:setup` (migrations + `seed-dev.sql`, nunca o `seed.sql` de produção). Abaixo, o processo manual
(usado na criação da produção).

```bash
npx supabase login                          # abre o navegador (token pessoal)
npx supabase link --project-ref <ref>       # pede a senha do banco
npx supabase db push --dry-run --include-seed   # revisar (produção: SOMENTE com autorização)
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

> ⚠️ As suítes remotas só rodam no **Supabase DEV** (`supabase/tests/production-guard.ts` bloqueia produção e
> qualquer projeto fora de `DEV_SUPABASE_REFS`). Ver [ambientes.md](ambientes.md).

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

`supabase/tests/sdr-operation.test.ts` (prefixo `sdr-test-`) roda junto no `npm run test:rls`: atribuição, CPF auditado, equipe e KPIs.

Os testes da API pública (`supabase/tests/public-leads-api.test.ts`, prefixo `api-test-`) seguem o mesmo modelo com a trava `ALLOW_REMOTE_API_TESTS=true` e o comando `npm run test:api`. `npm test` roda só os testes unitários, sem rede.
