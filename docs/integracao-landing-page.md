# Integração de Landing Pages

Cada Landing Page (LP) é um projeto independente que envia seus leads para a KAPA Leads Platform por **uma única rota pública**:

```
POST https://<domínio-da-plataforma>/api/public/leads
Content-Type: application/json
```

A chamada é feita **direto do navegador** (fetch/XHR). A plataforma identifica a campanha pela `campaignKey` e, a partir dela, a loja. A LP nunca informa loja (`store_id`) — se enviar, é ignorado.

## 1. Pré-requisitos (feitos pela KAPA)

1. Campanha cadastrada e ativa, em loja ativa.
2. **Origem da LP cadastrada** em `allowed_origins` da campanha (ver [seção 8](#8-cadastrar-o-domínio-da-lp-allowed_origins)).
3. `campaignKey` e `consent_version` vigentes repassados ao time da LP.

Para consultar no SQL Editor do Supabase:

```sql
select c.name, c.campaign_key, c.consent_version, c.allowed_origins, c.is_active
from public.campaigns c
join public.stores s on s.id = c.store_id
where s.slug = 'vitrine-veiculos';
```

## 2. Payload

```json
{
  "campaignKey": "camp_pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "clientSubmissionId": "3f0c9a52-6b0e-4c1e-9d0a-2a8f5c1d7e44",
  "lead": {
    "name": "Maria da Silva",
    "cpf": "529.982.247-25",
    "birthDate": "1990-05-20",
    "phone": "(11) 98765-4321",
    "email": null
  },
  "formData": {
    "downPaymentCents": 1500000,
    "vehicle": "Onix",
    "hasTradeIn": false
  },
  "tracking": {
    "utmSource": "instagram",
    "utmMedium": "cpc",
    "utmCampaign": "duelo-outubro",
    "utmContent": null,
    "utmTerm": null,
    "pageUrl": "https://<domínio-da-lp>/duelo?utm_source=instagram",
    "referrer": "https://www.instagram.com/"
  },
  "consent": {
    "accepted": true,
    "version": "2026-10-v1"
  },
  "website": ""
}
```

| Campo | Regra |
|---|---|
| `campaignKey` | Obrigatório. `camp_pk_` + 32 caracteres `[a-z0-9]`. Identificador **público** (não é senha). |
| `clientSubmissionId` | Obrigatório. UUID gerado pela LP **uma vez por envio de formulário** (`crypto.randomUUID()`). Ver [idempotência](#5-idempotência-clientsubmissionid). |
| `lead.name` | Obrigatório, 2 a 150 caracteres. |
| `lead.cpf` | Obrigatório. Com ou sem máscara. Dígitos verificadores são conferidos; sequências repetidas são recusadas. |
| `lead.birthDate` | Obrigatório, formato `AAAA-MM-DD`. Idade entre 18 e 120 anos (data de São Paulo). |
| `lead.phone` | Obrigatório. DDD válido + número. Celular: 11 dígitos com `9` após o DDD. Fixo: 10 dígitos. Aceita máscara e `+55`. |
| `lead.email` | Opcional (`null`, `""` ou ausente). |
| `formData` | Opcional. Campos específicos da campanha (ver abaixo). |
| `tracking` | Opcional. UTMs e URLs (ver abaixo). |
| `consent.accepted` | Obrigatório, precisa ser `true`. |
| `consent.version` | Obrigatório, precisa ser **igual** à versão vigente da campanha. |
| `website` | Honeypot. Deve ir **vazio** (ver [seção 6](#6-honeypot-website)). |

Campos desconhecidos no nível raiz são ignorados. O corpo inteiro tem limite de **16 KB**.

### formData

A API é genérica e não conhece os campos de cada LP. Regras:

- objeto plano, no máximo **50 chaves**;
- chaves: começam com letra, depois letras/números/`_`, até 64 caracteres (ex.: `downPaymentCents`, `vehicle_model`);
- valores: `string` (até 1000 caracteres), `number`, `boolean` ou `null`;
- **não** são aceitos arrays nem objetos aninhados;
- **valores monetários sempre em centavos inteiros**, em chaves terminadas em `Cents` (ex.: `downPaymentCents: 1500000` = R$ 15.000,00). Valores `*Cents` não inteiros são recusados.

O Admin usa `campaigns.form_schema` para exibir rótulos e formatos desses campos.

#### Simulação apresentada (opcional, `simulation*`)

Uma LP que mostra parcelas ao cliente pode salvar **exatamente o que foi exibido**, para o Admin não recalcular
(se a taxa de referência mudar, leads antigos continuam com os valores originais):

| Chave | Tipo | Exemplo |
|---|---|---|
| `simulationFinancedAmountCents` | inteiro (centavos) | `5000000` = R$ 50.000,00 |
| `simulationMonthlyRateBps` | inteiro (pontos-base) | `190` = 1,9% a.m. |
| `simulation{N}Cents` | inteiro (centavos), um por prazo | `simulation48Cents: 159710` |
| `simulationSelectedTerm` | inteiro (meses) | `48` |

O detalhe do lead mostra o bloco **Simulação apresentada** (valor a financiar, taxa e uma linha por prazo, com o
prazo registrado em destaque) e o COPIAR RESUMO inclui as parcelas. Sem valor a financiar, taxa ou ao menos um prazo
válido, o bloco não aparece. Essas chaves nunca são exibidas com o nome técnico. São campos comuns do `formData`:
nenhuma regra da API muda.

### tracking (UTMs)

`utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm` (até 255 caracteres) e `pageUrl`, `referrer` (URLs http/https, até 2048). Valores inválidos viram `null` e **nunca** causam recusa do lead. Tracking é informação de marketing, não de segurança.

Não coloque CPF, telefone ou outros dados pessoais em URLs (`pageUrl`, query string).

## 3. Consentimento

A LP exibe o texto de consentimento da versão vigente (ex.: `2026-10-v1`) e envia `consent.accepted: true` + `consent.version`. Se a KAPA publicar um novo texto, a versão da campanha muda e envios com a versão antiga passam a ser recusados (`400`, `fields: ["consent.version"]`) até a LP ser atualizada.

A data do consentimento (`consent_at`) é registrada pelo servidor; a LP não envia.

## 4. Respostas

| HTTP | Corpo | Quando |
|---|---|---|
| `201` | `{ "success": true, "leadId": "uuid" }` | Lead criado. |
| `200` | `{ "success": true, "leadId": "uuid" }` | Reenvio do mesmo `clientSubmissionId` (devolve o lead já criado). |
| `400` | `{ "success": false, "error": "INVALID_PAYLOAD", "requestId": "...", "fields": ["lead.cpf"] }` | Dados inválidos, JSON inválido ou `Content-Type` diferente de `application/json`. `fields` lista **apenas os caminhos** dos campos com problema. |
| `403` | `{ "success": false, "error": "ORIGIN_NOT_ALLOWED", "requestId": "..." }` | Origem da página não cadastrada na campanha. |
| `404` | `{ "success": false, "error": "CAMPAIGN_UNAVAILABLE", "requestId": "..." }` | Campanha inexistente, inativa ou de loja inativa (resposta propositalmente genérica). |
| `413` | `{ "success": false, "error": "PAYLOAD_TOO_LARGE", "requestId": "..." }` | Corpo acima de 16 KB. |
| `429` | `{ "success": false, "error": "TOO_MANY_REQUESTS", "requestId": "..." }` | Muitas tentativas do mesmo IP em pouco tempo. |
| `500` | `{ "success": false, "error": "INTERNAL_ERROR", "requestId": "..." }` | Erro interno. Pode tentar de novo com o **mesmo** `clientSubmissionId`. |

As respostas nunca devolvem dados pessoais. O header `X-Request-Id` (também no corpo dos erros) identifica a requisição nos logs — informe-o ao suporte.

**CORS nas respostas:** toda resposta para uma origem autorizada (cadastrada nesta campanha, em alguma campanha ativa, ou em `PUBLIC_LEADS_DEV_ORIGINS` fora de produção) leva `Access-Control-Allow-Origin` — inclusive `400`, `404`, `413`, `429` e `500` —, para a LP conseguir ler o status. Só o `403 ORIGIN_NOT_ALLOWED` sai **sem** CORS (o navegador mostra erro de CORS; veja o status na aba Network). A checagem "origem autorizada em alguma campanha" fica em cache por até 60 s por instância: uma origem recém-cadastrada pode levar até 1 minuto para valer no preflight.

## 5. Idempotência (clientSubmissionId)

- Gere **um** UUID quando o usuário clicar em enviar e **reutilize o mesmo** em todas as novas tentativas desse envio (timeout, erro de rede, 500, duplo clique).
- O mesmo `clientSubmissionId` na mesma campanha nunca gera lead duplicado: a API responde `200` com o `leadId` original.
- Um novo preenchimento do formulário deve gerar um novo UUID. O mesmo CPF pode gerar vários leads (não há bloqueio por CPF).

## 6. Honeypot (website)

Inclua no formulário um campo `website` **invisível para pessoas** (fora da tela, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`) e envie seu valor. Pessoas deixam vazio; bots costumam preencher. Se vier preenchido, a API responde como sucesso (`201`) mas **não salva** o lead.

```html
<div style="position:absolute;left:-10000px" aria-hidden="true">
  <label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
</div>
```

## 7. Exemplo (navegador)

```js
const submissionId = crypto.randomUUID(); // gerar uma vez por envio

async function enviarLead(form) {
  const response = await fetch("https://<domínio-da-plataforma>/api/public/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignKey: "camp_pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      clientSubmissionId: submissionId,
      lead: {
        name: form.name.value,
        cpf: form.cpf.value,
        birthDate: form.birthDate.value, // AAAA-MM-DD
        phone: form.phone.value,
        email: form.email.value || null,
      },
      formData: { downPaymentCents: Math.round(Number(form.downPayment.value) * 100) },
      tracking: {
        utmSource: new URLSearchParams(location.search).get("utm_source"),
        utmMedium: new URLSearchParams(location.search).get("utm_medium"),
        utmCampaign: new URLSearchParams(location.search).get("utm_campaign"),
        utmContent: new URLSearchParams(location.search).get("utm_content"),
        utmTerm: new URLSearchParams(location.search).get("utm_term"),
        pageUrl: location.href,
        referrer: document.referrer || null,
      },
      consent: { accepted: form.consent.checked, version: "2026-10-v1" },
      website: form.website.value,
    }),
  });

  const result = await response.json();
  if (response.ok) return result.leadId; // 200 ou 201
  throw new Error(result.error); // ex.: INVALID_PAYLOAD (veja result.fields)
}
```

Exemplo com `curl` (útil para testes; o `Origin` precisa estar autorizado):

```bash
curl -i https://<domínio-da-plataforma>/api/public/leads \
  -H "Content-Type: application/json" \
  -H "Origin: https://<domínio-da-lp>" \
  --data @lead.json
```

## 8. Cadastrar o domínio da LP (allowed_origins)

A origem é `https://domínio[:porta]`, **sem** caminho, sem barra final e **sem curinga** (`*`). Cadastre a variação com `www` somente se ela realmente servir a LP (se `www` só redireciona, não precisa). Prefira o Admin (Campanhas → Origens permitidas), que valida o formato. Exemplo no SQL Editor:

```sql
update public.campaigns
set allowed_origins = array['https://<domínio-da-lp>']
where slug = 'duelo-de-aprovacoes';
```

- O navegador faz um *preflight* (`OPTIONS`) antes do `POST`; ele é aceito se a origem estiver cadastrada em **alguma** campanha ativa. O `POST` confere a origem da **campanha específica**.
- Sem `Origin` (ou com `Origin: null`) a requisição é recusada.
- A checagem de origem impede que **outros sites** enviem leads pelo navegador dos visitantes. Ela não impede scripts fora do navegador (que podem forjar o header) — para isso existem honeypot, validação, limites e rate limit.

### Testes locais (desenvolvimento)

Enquanto a campanha não tem domínio cadastrado, origens locais podem ser liberadas pela variável `PUBLIC_LEADS_DEV_ORIGINS` no `.env.local` da plataforma:

```bash
PUBLIC_LEADS_DEV_ORIGINS=http://localhost:3001   # LP Duelo em dev; várias origens separadas por vírgula
```

Essa variável é **ignorada em produção** (`NODE_ENV=production`, ou seja, `next build`/`next start` e qualquer deploy). Não cadastre `localhost` em `allowed_origins` de campanhas reais.

## 9. Limites e proteção contra abuso

- Corpo máximo: 16 KB; somente `application/json`.
- Rate limit por IP, **em memória** (por instância do servidor; o IP nunca é gravado). Padrão: **30 envios a cada 60 s**, configurável:

  | Variável | Padrão | Faixa aceita |
  |---|---|---|
  | `PUBLIC_LEADS_RATE_LIMIT_MAX` | `30` | 1 a 10000 |
  | `PUBLIC_LEADS_RATE_LIMIT_WINDOW_SECONDS` | `60` | 1 a 3600 |

  Valor inválido → usa o padrão e registra um aviso (`public_leads_config`) no log. O padrão é folgado de propósito: redes móveis (CGNAT) e Wi-Fi corporativo colocam muitas pessoas atrás do mesmo IP, e um bloqueio falso perde um lead real. Bots insistentes ainda são contidos, e o `429` leva CORS (a LP mostra a mensagem amigável).
- **Limitações aceitas no MVP:** o contador é por instância e zera em reinícios/deploys; com várias instâncias (serverless) o limite efetivo é maior; o IP vem do primeiro valor de `x-forwarded-for` (ou `x-real-ip`), então a plataforma precisa estar atrás de um proxy que sobrescreva esse header (a Vercel faz isso; atrás da Cloudflare, usar `CF-Connecting-IP` — ver [deploy-producao.md §5](deploy-producao.md#5-rate-limit-e-anti-abuso)).
- **Produção futura — migrar a proteção para a borda antes de escalar o tráfego pago:** Cloudflare (WAF + regra de rate limiting e/ou Turnstile no formulário) ou um limiter distribuído (Redis/KV). O limite em memória é só a primeira camada.
- O IP do visitante nunca é armazenado no lead.

## 10. Campanha integrada: Duelo de Aprovações

LP: repositório `duelo-de-aprovacoes` (Next.js, sem backend próprio). Implementação em `lib/kapa-leads.ts` e
`lib/tracking.ts`; detalhes do lado da LP no `README.md` dela.

| Item | Valor |
|---|---|
| Loja / campanha | Vitrine Veículos / Duelo de Aprovações (`slug` `duelo-de-aprovacoes`) |
| `consent_version` | `2026-10-v1` (texto: checkbox da etapa 03 do simulador) |
| Variáveis da LP | `NEXT_PUBLIC_KAPA_LEADS_API_URL`, `NEXT_PUBLIC_KAPA_CAMPAIGN_KEY`, `NEXT_PUBLIC_KAPA_CONSENT_VERSION` (todas públicas) |
| `allowed_origins` | vazio até existir o domínio de produção da LP |

### form_schema da campanha

Configurado no banco (também está no `supabase/seed.sql` para ambientes novos). Pode ser editado em
**Admin → Campanhas → Duelo de Aprovações**.

```json
{
  "hasTradeIn":               { "label": "Possui veículo na troca",              "format": "boolean", "order": 1 },
  "tradeInVehicle":           { "label": "Veículo na troca",                     "format": "text",    "order": 2 },
  "tradeInYear":              { "label": "Ano do veículo na troca",              "format": "number",  "order": 3 },
  "hasDownPayment":           { "label": "Possui entrada",                       "format": "boolean", "order": 4 },
  "downPaymentCents":         { "label": "Valor da entrada",                     "format": "money",   "order": 5 },
  "desiredVehicleValueCents": { "label": "Valor aproximado do veículo desejado", "format": "money",   "order": 6 }
}
```

`tradeInVehicle`/`tradeInYear` só são enviados quando há troca, e `downPaymentCents` só quando há entrada.
Valores monetários chegam em centavos inteiros.

### Testar localmente (os dois projetos)

1. Plataforma: `.env.local` com `PUBLIC_LEADS_DEV_ORIGINS=http://localhost:3001`; `npm run dev` → `http://localhost:3000`.
2. LP: `.env.local` com as 3 variáveis (`NEXT_PUBLIC_KAPA_LEADS_API_URL=http://localhost:3000`); `npm run dev` → `http://localhost:3001`.
3. Abrir `http://localhost:3001/?utm_source=teste&utm_medium=qa`, preencher o simulador e clicar em **SIMULAR AGORA**.
4. O lead aparece em `http://localhost:3000/leads`; o detalhe mostra CPF mascarado, campos do `form_schema`, UTMs e "Lead recebido".

Em baterias de teste, lembre do rate limit (padrão 30 envios/minuto por IP; ajustável por `PUBLIC_LEADS_RATE_LIMIT_*`).
O `429` volta com CORS e a LP mostra a mensagem amigável.

### Produção

1. Publicar LP e plataforma em HTTPS.
2. Cadastrar a origem exata da LP em `allowed_origins` da campanha (Admin → Campanhas, ou SQL da [seção 8](#8-cadastrar-o-domínio-da-lp-allowed_origins)).
3. Na LP, apontar `NEXT_PUBLIC_KAPA_LEADS_API_URL` para o domínio da plataforma e refazer o build.

Checklist completo do go-live (variáveis, Supabase Auth, páginas legais, ordem dos passos): [deploy-producao.md](deploy-producao.md).
