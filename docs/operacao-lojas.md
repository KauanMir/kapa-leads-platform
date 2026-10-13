# Operação das lojas — SDR, gerente, atendimento e KPIs

Guia para a loja (ex.: Vitrine Veículos) usar o Admin `https://leads.assessoriakapa.com.br`.

## 1. Modelo de operação

Vendedores finais **não** usam a plataforma. O fluxo é:

```
Lead chega da LP (Novo, sem responsável)
 → SDR assume (ou o gerente atribui) e trabalha o lead na KAPA
 → SDR qualifica e repassa ao vendedor pelo WhatsApp pessoal (COPIAR RESUMO)
 → vendedor negocia fora da plataforma
 → SDR acompanha e atualiza o resultado (Ganho / Perdido)
```

## 2. Papéis

| Papel (na tela) | Papel técnico | Em uma frase |
|---|---|---|
| **KAPA** | SUPER_ADMIN | Vê e configura tudo: lojas, campanhas, usuários e leads de todas as lojas. |
| **Gerente** | STORE_ADMIN | Supervisiona a loja: vê todos os leads, distribui para os SDRs, vê a equipe e os KPIs da equipe. |
| **SDR** | STORE_USER | Atende os **próprios** leads: assume da fila, liga/WhatsApp, muda status, registra observações, vê o CPF e repassa ao vendedor. |

O banco continua usando `STORE_USER`; "SDR" é só o nome na tela. Nenhum usuário de loja vira SUPER_ADMIN. Quem cria
usuários, lojas e campanhas é sempre a KAPA.

## 3. Criar usuário de loja (KAPA)

1. Admin → **Configurações → Usuários → Novo usuário**.
2. Preencher **nome**, **e-mail**, **senha inicial** (mín. 10 caracteres), **loja** e **papel** (SDR ou Gerente).
3. Entregar e-mail + senha inicial à pessoa por um canal privado (nunca em grupo). A senha não é guardada nem
   exibida de novo.
4. A pessoa entra em `/login` e troca a senha em **Meu perfil**.

Não existe "esqueci a senha" por e-mail ainda (sem SMTP próprio). Se a pessoa esquecer: Configurações → Usuários →
desativar/recriar, ou a KAPA define uma nova senha pelo Dashboard do Supabase (Authentication → Users).

Vínculos: Configurações → Usuários → (usuário). Desativar o **vínculo** tira o acesso àquela loja; desativar o
**usuário** bloqueia o login inteiro. Para a Vitrine, vincular **somente** à Vitrine Veículos.

## 4. Responsável pelo lead

Todo lead tem **um SDR responsável** ou está **sem responsável** (fila).

| Situação | Como acontece | Histórico |
|---|---|---|
| Sem responsável | O lead acabou de chegar. | — |
| Atribuído | O SDR clicou em **ASSUMIR LEAD**, ou o gerente escolheu o responsável. | "Lead assumido por Maria" / "Lead atribuído a Maria" |
| Reatribuído | O gerente trocou o responsável. | "Responsável alterado: Maria → João" |
| Devolvido | O gerente escolheu "Sem responsável". | "Lead devolvido para a fila" |

**Quem pode:**

- **SDR:** só **assume para si** um lead **sem responsável**. Não toma lead de outro SDR, não atribui para outra
  pessoa e não devolve para a fila (pede ao gerente). Se dois SDRs clicarem ao mesmo tempo, só um fica com o lead.
- **Gerente:** atribui, reatribui ou devolve qualquer lead da própria loja, para qualquer membro **ativo** da loja
  (SDR ou gerente). Nunca para alguém de outra loja.
- **KAPA:** o mesmo, em qualquer loja.

Usuário ou vínculo desativado não assume nem recebe leads. Se um SDR sair, o gerente reatribui os leads dele
(no seletor ele aparece como "(inativo)" até a troca).

**Como atribuir (gerente):** abra o lead → **Responsável pelo lead** → escolha o SDR. Salva na hora.
**Como assumir (SDR):** abra o lead da fila → **ASSUMIR LEAD**.

**O responsável vale de verdade** (regra no banco, não só na tela):

| Para o SDR | Ver | Assumir | Status / observação / CPF / ligar / resumo |
|---|---|---|---|
| Lead **dele** | ✅ | — | ✅ |
| Lead **sem responsável** | ✅ | ✅ | ❌ — assume primeiro |
| Lead de **outro SDR** | ✅ (com o nome de quem atende) | ❌ | ❌ — "Este lead está sendo atendido por Maria." |

O **gerente** trabalha qualquer lead da própria loja (status, observação, CPF) e atribui/reatribui/devolve. A **KAPA**
trabalha qualquer lead.

## 5. Filas e filtros

Na tela **Leads**:

- Abas **Meus leads** · **Sem responsável** · **Todos**. O SDR abre direto em **Meus leads**; o gerente em **Todos**.
- Gerente/KAPA filtram também por **Responsável** (um SDR específico, sem responsável ou meus).
- Continuam: busca por **nome ou telefone**, **status**, **campanha**, **período** e **loja** (KAPA).
- CPF **não** é aceito na busca e nunca vai para a URL.

A coluna **Responsável** mostra o nome do SDR ou "Sem responsável".

## 6. Atendimento (status)

| Status | Quando usar |
|---|---|
| **Novo** | Lead acabou de chegar da LP (automático). |
| **Contatado** | O SDR fez o primeiro contato (ligação ou WhatsApp). |
| **Em atendimento** | Lead qualificado: repassado ao vendedor / negociação em andamento (visita, proposta, análise). |
| **Ganho** | Venda concluída. |
| **Perdido** | Encerrado sem venda (desistiu, comprou em outro lugar, sem retorno). Registrar o motivo numa observação. |

Na tela do lead: **LIGAR**, **WHATSAPP** (abre o WhatsApp com mensagem sugerida, nada é enviado sozinho),
**COPIAR TELEFONE**, **COPIAR RESUMO**, seletor de **status**, **responsável** e campo de **observação**.

## 7. Repasse ao vendedor (manual)

1. No lead, clique em **COPIAR RESUMO**. O texto vai para a área de transferência, por exemplo:

   ```
   Lead: João Silva
   Telefone: (61) 99999-9999
   Campanha: Duelo de Aprovações
   Possui veículo na troca: Sim
   Veículo na troca: Onix
   Ano do veículo na troca: 2021
   Possui entrada: Sim
   Valor da entrada: R$ 15.000,00
   Valor aproximado do veículo desejado: R$ 80.000,00
   ```

   Os campos vêm do formulário da campanha (qualquer campanha, não só o Duelo). O resumo **nunca** inclui CPF,
   data de nascimento, UTMs/origem, ids ou links internos.
2. Cole no WhatsApp do vendedor que você escolher. Nada é enviado automaticamente.
3. Clique em **ADICIONAR OBSERVAÇÃO** (aparece depois de copiar) e complete: "Encaminhado ao vendedor João".
4. Mude o status para **Em atendimento**.

Vendedores não são cadastrados na plataforma nesta fase: o nome do vendedor fica só na observação.

## 8. CPF e auditoria

- O CPF aparece **mascarado** (`***.456.789-**`). O completo nunca está na página, na lista, na busca ou na URL.
- **REVELAR CPF** busca o CPF no banco **naquele momento**. Ele fica visível por 1 minuto (ou até **Ocultar**) e
  pode ser copiado. Quem pode:
  - **SDR:** só no lead em que **ele é o responsável** (lead da fila: assumir antes);
  - **gerente:** qualquer lead da própria loja;
  - **KAPA:** qualquer lead.
- **Toda** revelação fica registrada (`CPF_REVEALED`: lead, quem, quando — sem o CPF). Na linha do tempo aparece
  "CPF visualizado · Maria SDR" **só para o gerente e a KAPA**; o SDR não vê a auditoria.
- SDR que não é o responsável, usuário de outra loja ou desativado não revela (o banco recusa e não registra nada).

## 9. Linha do tempo

Tudo em ordem cronológica, com quem fez e quando: lead recebido (`CREATED`), atribuições (`ASSIGNED`), observações
(`NOTE_ADDED`), mudanças de status (`STATUS_CHANGED`) e CPF visualizado (`CPF_REVEALED`, só gerente/KAPA).
Observações não podem ser editadas nem apagadas (histórico confiável).

## 10. KPIs (Dashboard)

Números simples, sem gráficos e sem ranking. Seguem o período, a campanha e a loja escolhidos no filtro (período
= data de chegada do lead).

**Gerente / KAPA — visão da equipe:**

| Indicador | Fórmula |
|---|---|
| Leads recebidos | Todos os leads do período. |
| Sem responsável | Leads na fila. |
| Pendentes | Novos + Contatados + Em atendimento. |
| Novo / Contatado / Em atendimento / Ganho / Perdido | Leads em cada status. |
| **Conversão** | **Ganhos ÷ (Ganhos + Perdidos)** — só leads já concluídos. Sem concluídos mostra "—". |
| **1º atendimento** | Média de (primeira mudança de status saindo de **Novo** − chegada do lead), só entre leads que já saíram de Novo. Mede o atendimento **registrado no sistema** (o SDR precisa atualizar o status ao fazer o contato). |

Tabela **Equipe** (ordem alfabética): por SDR, Atribuídos, Novo, Contatado, Em atendimento, Ganho, Perdido,
Conversão e 1º atendimento; mais a linha "Sem responsável". Clique no nome para ver os leads dele.

**SDR — meus números:** Meus novos, Meus contatados, Em atendimento, Ganhos, Perdidos e o tamanho da **fila sem
responsável**. O SDR não vê os números de outros SDRs (regra no banco, função `lead_kpis`).

## 11. Checagem depois de criar usuários reais

| Quem | Deve |
|---|---|
| Gerente (STORE_ADMIN) Vitrine | Entrar; ver só a Vitrine (leads, campanhas, equipe em **Minha loja**, Dashboard com **Equipe**); atribuir um lead a um SDR; **não** ver "Configurações KAPA" nem outra loja. |
| SDR (STORE_USER) Vitrine | Entrar; cair em **Meus leads**; assumir um lead da fila; no próprio lead: mudar status, observar, ligar/WhatsApp, copiar resumo, revelar CPF; no lead de um colega: só ver quem atende; **não** ver "Configurações KAPA", **Minha loja** nem números de outros SDRs. |
| KAPA | Continuar vendo tudo. |

As mesmas regras são cobertas automaticamente no DEV pelas suítes `test:rls` (inclui `sdr-operation`), `test:admin`
e `test:e2e` (docs/ambientes.md §6).
