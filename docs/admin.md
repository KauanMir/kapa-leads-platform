# Admin — login, papéis e telas

Painel interno da KAPA Leads Platform. Não há cadastro público: todo usuário é criado pela KAPA.

## Login

- `/login` — e-mail e senha (Supabase Auth). A sessão fica em cookies (`@supabase/ssr`) e é renovada pelo proxy (`src/proxy.ts`).
- Sem sessão, qualquer rota do Admin leva a `/login`.
- O servidor confere **em toda requisição**, no banco:
  - `profiles.is_active = false` → sessão encerrada, mensagem “Usuário inativo”;
  - sem vínculo ativo em `store_members` (e não é SUPER_ADMIN) → sessão encerrada, “sem loja ativa”.
- “Esqueci a senha”: por enquanto, falar com a KAPA (não há SMTP configurado). O próprio usuário troca a senha em **Meu perfil**.

## Papéis

As permissões vêm do banco (`profiles.is_super_admin` e `store_members.role`), nunca do e-mail ou do navegador. A interface só esconde o que não se aplica; quem garante é o RLS + as checagens no servidor.

| Papel | Vê | Pode |
|---|---|---|
| **SUPER_ADMIN** (KAPA) | Todas as lojas, campanhas, leads e usuários | Tudo do Admin + Configurações (lojas, campanhas, usuários) |
| **STORE_ADMIN** | Lojas onde é membro ativo: leads, campanhas e equipe | Alterar status, adicionar observações, WhatsApp |
| **STORE_USER** | Leads e campanhas das lojas onde é membro ativo | Alterar status, adicionar observações, WhatsApp |

Um usuário pode pertencer a várias lojas (vê todas elas).

## Telas

| Rota | Quem | O que faz |
|---|---|---|
| `/dashboard` | todos | Contagem por status (total, novos, contatados, em atendimento, ganhos, perdidos) e 10 leads mais recentes. Filtros: período, campanha, loja. Cards levam à lista filtrada. |
| `/leads` | todos | Lista com busca (nome ou telefone), status, campanha, loja, período; 25 por página; filtros na URL. Sem CPF. Cards no celular. |
| `/config/lgpd` | SUPER_ADMIN | **Pedidos LGPD**: consulta por CPF (só no corpo da requisição) em quais lojas há registro de bloqueio (10 dias úteis), elimina o da loja escolhida com motivo e confirmação de identidade — mesmo com o lead já excluído — e mostra a auditoria (sem CPF). |
| `/leads/[id]` | todos | Topo com nome, telefone, WHATSAPP e COPIAR RESUMO, status e responsável; simulação (via `form_schema`) e, quando a LP enviou, a **Simulação apresentada** ao cliente (valores salvos, sem recalcular); em campanhas com valor ilustrativo (Fábrica de Aprovação), o bloco **"Valor da simulação — ilustrativo"** (valor gravado no lead, cliente, data/hora, respostas, cronômetro de 36 h e status Vigente/Expirada — expirar só muda o visual; nada é apagado), dados pessoais com **CPF mascarado**, campanha/origem e histórico com observações. |
| `/loja` | STORE_ADMIN | Campanhas e equipe das lojas que administra (somente leitura). |
| `/perfil` | todos | Nome e troca de senha. |
| `/config/lojas` | SUPER_ADMIN | Listar, criar, ativar/desativar lojas. |
| `/config/campanhas` | SUPER_ADMIN | Listar, criar, editar campanhas; copiar e **rotacionar** a `campaignKey`. |
| `/config/usuarios` | SUPER_ADMIN | Listar, criar usuários (Administrador Geral, Gerente ou SDR), ativar/desativar, vincular a lojas e definir papel. O detalhe mostra quem criou o usuário. |

Detalhes:

- **Status**: Novo, Contatado, Em atendimento, Ganho, Perdido (sempre cor + texto). Cada mudança gera `STATUS_CHANGED` (trigger do banco).
- **Observações**: só inclusão (não editam nem apagam), até 5000 caracteres. Geram `NOTE_ADDED`.
- **Linha do tempo**: lead recebido, mudanças de status e observações, em ordem cronológica. Para STORE_USER, o nome de outros membros aparece como “Membro da equipe” (o RLS não expõe perfis de colegas).
- **WhatsApp**: abre `wa.me` com uma mensagem sugerida; nada é enviado automaticamente.
- **CPF**: o Admin nunca recebe o CPF completo (o papel `authenticated` não tem acesso à coluna). A revelação auditada fica para uma fase futura. A busca recusa CPF para que ele nunca vá para a URL.

## Novo usuário: Administrador Geral, Gerente ou SDR

**Configurações → Usuários → Novo usuário** (só SUPER_ADMIN). Escolha o **tipo de acesso**:

| Tipo | Papel no banco | Loja | Acesso |
|---|---|---|---|
| **Administrador Geral** | SUPER_ADMIN | não tem | Todas as lojas (atuais e futuras), leads, campanhas, usuários e Configurações da KAPA. |
| **Gerente de Loja** | STORE_ADMIN | obrigatória | Leads, campanhas e equipe da loja escolhida. |
| **SDR** | STORE_USER | obrigatória | Leads da loja escolhida. |

1. Informe nome, e-mail e **senha inicial** (10 a 72 caracteres; não é exibida depois).
2. Gerente ou SDR: escolha a loja. Administrador Geral: marque a **confirmação do acesso global**.
3. Clique em **Criar usuário** / **Criar administrador geral**.
4. Passe a senha inicial por um canal separado (ex.: ligação). No primeiro acesso, a pessoa troca a senha em **Meu perfil**.

Garantias (servidor + banco, não só a tela):

- Só um SUPER_ADMIN ativo cria usuários. Gerente e SDR não conseguem nem chamando a Server Action ou a API diretamente
  (o banco recusa em `grant_new_user_access`).
- A conta é criada pela API oficial do Supabase Auth; o acesso e o registro de auditoria (quem criou, quando, qual acesso)
  são gravados juntos. Se definir o acesso falhar, a conta recém-criada é apagada — nada fica pela metade.
- E-mail repetido é recusado sem alterar a conta existente. A senha não é guardada nem registrada em logs.
- A função não promove contas existentes nem a própria conta: para mudar o acesso de quem já existe, use os vínculos no
  detalhe do usuário (Gerente/SDR). Promover uma conta existente a Administrador Geral continua fora do painel.
- O detalhe do usuário mostra "criado em … por …" (contas criadas antes desta versão não têm esse registro).

Não há convite nem recuperação de senha por e-mail (sem SMTP).

## Primeiro SUPER_ADMIN (projeto novo)

Só para o primeiro administrador de um projeto vazio; os demais são criados pelo Admin (seção acima).

1. No painel do Supabase: **Authentication → Users → Add user → Create new user**. Preencha e-mail e senha e marque **Auto Confirm User**.
2. O `profile` é criado automaticamente (trigger). Promova no **SQL Editor**:

```sql
update public.profiles set is_super_admin = true where email = 'email-do-admin@exemplo.com';
```

3. Entre em `/login`. Os próximos usuários podem ser criados pelo próprio Admin em **Configurações → Usuários**.

Para remover o acesso de SUPER_ADMIN: `update public.profiles set is_super_admin = false where email = '...';`

## Fluxo de configuração de uma nova loja

1. **Lojas → Nova loja**: nome e slug (ex.: `fortium`).
2. **Campanhas → Nova campanha**: loja, nome, slug, versão do consentimento (ex.: `2026-11-v1`), origens permitidas e `form_schema`. Ao salvar, a `campaignKey` é gerada — copie e envie ao time da LP.
3. **Usuários → Novo usuário**: tipo de acesso (Gerente de Loja ou SDR), nome, e-mail, senha inicial (mín. 10 caracteres; não é exibida depois) e a loja.

### Origens permitidas (allowed_origins)

Uma por linha, no formato `https://dominio.com.br` — sem caminho, sem barra final e sem curinga (`*`); `http` só para `localhost`. Cadastre a variação com `www` somente se ela realmente servir a LP. Sem origem cadastrada, a LP recebe `403 ORIGIN_NOT_ALLOWED`. Detalhes em [integracao-landing-page.md](integracao-landing-page.md#8-cadastrar-o-domínio-da-lp-allowed_origins).

### form_schema

Define rótulo e formato de cada campo de `formData` para exibição no detalhe do lead:

```json
{
  "hasTradeIn": { "label": "Possui carro na troca", "format": "boolean", "order": 1 },
  "tradeVehicle": { "label": "Veículo na troca", "format": "text", "order": 2 },
  "tradeYear": { "label": "Ano", "format": "number", "order": 3 },
  "downPaymentCents": { "label": "Valor da entrada", "format": "money", "order": 4 }
}
```

Formatos: `text`, `number`, `money` (valor em centavos → R$), `boolean` (Sim/Não), `date` (AAAA-MM-DD → DD/MM/AAAA). `order` é opcional. Campos sem entrada no schema aparecem com um rótulo automático (e `*Cents` como dinheiro). O conteúdo é sempre exibido como texto — HTML não é interpretado.

### Rotação da campaignKey

Em **Campanhas → (campanha) → Trocar a chave**. Exige confirmação: a chave antiga para de funcionar na hora e a LP precisa ser atualizada. Editar a campanha nunca muda a chave.

## Cache e dados privados

O projeto usa Cache Components. No Admin **nenhum** dado é cacheado no servidor: sessão e consultas são lidas por requisição dentro de `<Suspense>`, sempre com o cliente da sessão (RLS). Só a “casca” visual (esqueleto) é pré-renderizada.
