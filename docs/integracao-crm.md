# Integração com o KAPA CRM (exportação somente leitura)

O KAPA CRM **busca** (pull) os leads novos das lojas liberadas. O KAPA Leads não envia nada, não
espera o CRM e não muda o caminho de gravação das Landing Pages:

```
Landing Page ──POST /api/public/leads──▶ KAPA Leads (grava, responde à LP)      [inalterado]
KAPA CRM ──GET assinado /api/integrations/crm/leads──▶ KAPA Leads (só SELECT)   [novo]
```

Se o CRM estiver fora do ar, nada acontece aqui. Se esta rota for desligada, a captação continua
igual. Não há migration, tabela nova, trigger nem escrita no banco.

## 1. Ativação (desligada por padrão)

| Variável (só servidor, Vercel Production) | Valor |
|---|---|
| `CRM_EXPORT_SECRET` | segredo aleatório de 64 hex (mín. 32 caracteres); o mesmo em `KAPA_LEADS_SYNC_SECRET` no CRM |
| `CRM_EXPORT_SECRET_PREVIOUS` | opcional: segredo anterior, aceito durante uma troca |
| `CRM_EXPORT_STORE_IDS` | UUIDs das lojas liberadas, separados por vírgula |

Sem segredo válido ou sem loja, as rotas respondem **404** (como se não existissem). Para desligar:
remover `CRM_EXPORT_STORE_IDS` (ou a loja da lista) e redeployar. A LP não é afetada.

Troca de segredo sem parar: colocar o novo em `CRM_EXPORT_SECRET` e o antigo em
`CRM_EXPORT_SECRET_PREVIOUS`; trocar no CRM; depois remover o anterior.

## 2. Autenticação (contrato v1)

```
X-Kapa-Timestamp: <segundos Unix>
X-Kapa-Signature: v1=<hex HMAC-SHA256(segredo, "v1:<timestamp>:GET:<pathname><search>")>
```

Tolerância de relógio: 300 s. Comparação em tempo constante. A rota fica fora do `proxy.ts` (não usa
sessão do Admin). Rate limit: 120 chamadas assinadas por minuto por instância.

## 3. `GET /api/integrations/crm/leads`

Parâmetros: `storeId` (UUID liberado), `afterCreatedAt` + `afterId` (cursor, **obrigatório**),
`limit` (1–100, padrão 50).

- Devolve leads da loja com `(created_at, id) > cursor`, em ordem, só até **agora − 60 s** (um INSERT
  ainda não confirmado não é pulado pelo cursor).
- Não existe "exportar tudo": sem cursor → 400. O CRM grava o cursor no momento da ativação, então
  leads antigos nunca são enviados por engano.
- Dados devolvidos: id, loja, campanha (id, slug, nome), data, **nome, telefone, e-mail**, `formData`
  com os rótulos do `form_schema`, consentimento (versão e data), UTMs/página/referência, valor
  ilustrativo (valor, apresentação, validade) e `cpfCooldownUntil`.
- **Nunca** devolvidos: CPF, nascimento, status, responsável, observações, eventos.

```json
{ "success": true, "items": [ … ], "nextCursor": { "createdAt": "…", "id": "…" }, "hasMore": false,
  "upTo": "…", "serverTime": "…" }
```

| HTTP | Quando |
|---|---|
| 200 | página (pode ser vazia, `nextCursor: null`) |
| 400 | parâmetro inválido (`fields` com os nomes) |
| 401 | assinatura ausente, inválida ou expirada |
| 403 | loja não liberada |
| 404 | exportação desligada |
| 429 | limite de chamadas |
| 500 | erro interno (sem detalhes) |

## 4. `GET /api/integrations/crm/leads/count`

`storeId`, `from`, `to` (janela de até 31 dias): `{ "count": n }`. Usado para reconciliar "recebidos no
KAPA Leads × sincronizados no CRM". Sem dados pessoais.

## 5. Logs

`{"event":"crm_export","operation":"list","status":200,"outcome":"ok","count":3,...}` — só contadores
e códigos; nunca dados do lead, cursor ou segredo.

## 6. LGPD

Excluir um lead no Admin do KAPA Leads **não** apaga a cópia já sincronizada no CRM. Um pedido do
titular precisa ser atendido nas duas plataformas (no CRM: arquivar/excluir o lead).
