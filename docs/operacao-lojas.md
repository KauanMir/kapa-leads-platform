# Operação das lojas — usuários, papéis e atendimento

Guia para colocar pessoas de uma loja (ex.: Vitrine Veículos) no Admin `https://leads.assessoriakapa.com.br`.

## 1. Papéis

| Papel | Em uma frase |
|---|---|
| **SUPER_ADMIN** (só KAPA) | Vê e configura tudo: lojas, campanhas, usuários e leads de todas as lojas. |
| **STORE_ADMIN** | Gerencia a operação da própria loja: vê os leads, as campanhas e a equipe da loja. Não vê configurações globais da KAPA nem outras lojas. |
| **STORE_USER** | Atende os leads da própria loja: abre o lead, liga/WhatsApp, muda o status e adiciona observações. |

Nenhum usuário de loja vira SUPER_ADMIN. Quem cria usuários, lojas e campanhas é sempre a KAPA (SUPER_ADMIN).

## 2. Criar usuário de loja (SUPER_ADMIN)

1. Admin → **Configurações → Usuários → Novo usuário**.
2. Preencher **nome**, **e-mail**, **senha inicial** (mín. 10 caracteres), **loja** e **papel**.
3. Entregar e-mail + senha inicial à pessoa por um canal privado (nunca em grupo). A senha não é guardada nem
   exibida de novo.
4. A pessoa entra em `/login` e troca a senha em **Meu perfil**.

Não existe "esqueci a senha" por e-mail ainda (sem SMTP próprio). Se a pessoa esquecer: Configurações → Usuários →
desativar/recriar, ou a KAPA define uma nova senha pelo Dashboard do Supabase (Authentication → Users).

## 3. Vincular/ajustar loja e papel

- Admin → **Configurações → Usuários → (usuário)** → vínculo com a loja e papel (`STORE_ADMIN`/`STORE_USER`).
- Desativar o **vínculo** tira o acesso àquela loja; desativar o **usuário** bloqueia o login inteiro (a sessão cai na
  próxima requisição).
- Um usuário pode estar em mais de uma loja (vê todas elas). Para a Vitrine, vincular **somente** à Vitrine Veículos.

## 4. Fluxo de atendimento

| Status | Quando usar |
|---|---|
| **Novo** | Lead acabou de chegar da LP (automático). |
| **Contatado** | O vendedor fez o primeiro contato (ligação ou WhatsApp). |
| **Em atendimento** | Cliente seguiu na negociação (visita, proposta, análise). |
| **Ganho** | Venda fechada. |
| **Perdido** | Cliente desistiu / comprou em outro lugar / sem retorno. Registrar o motivo numa observação. |

Na tela do lead: botões **LIGAR**, **WHATSAPP** (abre o WhatsApp com mensagem sugerida, nada é enviado sozinho) e
**COPIAR TELEFONE**; seletor de **status**; campo de **observação**. Tudo aparece na **linha do tempo**:
lead recebido (`CREATED`), mudanças de status (`STATUS_CHANGED`) e observações (`NOTE_ADDED`), com quem fez e quando.

Observações não podem ser editadas nem apagadas (histórico confiável). CPF aparece sempre mascarado.

## 5. Checagem depois de criar os usuários reais

| Quem | Deve |
|---|---|
| STORE_ADMIN Vitrine | Entrar; ver só a Vitrine (leads, campanhas, equipe em **Minha loja**); **não** ver o menu "Configurações KAPA" nem outra loja. |
| STORE_USER Vitrine | Entrar; ver só os leads da Vitrine; abrir lead, mudar status, adicionar observação, ligar/WhatsApp; **não** ver "Configurações KAPA" nem **Minha loja**. |
| SUPER_ADMIN KAPA | Continuar vendo tudo. |

As mesmas regras são cobertas automaticamente no DEV pelas suítes `test:admin` e `test:e2e` (docs/ambientes.md §6).
