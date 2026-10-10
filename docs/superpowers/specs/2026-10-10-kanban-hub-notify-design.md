# Notificação de "pronto para revisão" fora do navegador — design

**Data:** 2026-10-10 · **Repositório:** fork `filipesr/kanban` (upstream `cline/kanban` 0.1.70)

## O problema

Um cartão que termina e entra em **Review** só avisa por **notificação de navegador**. Isso
exige o quadro aberto numa aba, na mesma máquina — e contradiz a promessa do produto: rodar
muitos agentes em paralelo é, por construção, algo que você **não** está olhando.

Pior: esse único caminho de entrega está quebrado. [#308](https://github.com/cline/kanban/issues/308)
(bug, aberta desde abril, 0.1.60) e [#284](https://github.com/cline/kanban/issues/284) relatam
que a notificação não aparece mesmo com a opção ligada.

Medido nesta máquina em 2026-10-10 (macOS, `cline` 3.0.70, `kanban` 0.1.70, provedor
`claude-code`): um cartão rodou uma tarefa real, moveu para **Review** e esperou resposta
humana; responder no cartão o fez retomar. Em nenhum momento houve notificação fora da aba.

## O que já existe, e o que falta

| peça | estado |
|---|---|
| conceito de notificação de review | **existe** (`readyForReviewNotificationsEnabled`) |
| entrega | **só navegador**, e quebrada (#308) |
| barramento do hub do Cline | **existe**: `HubUIClient.sendNotify()` publica `ui.notify`, o hub difunde a todos os assinantes |
| conectores Telegram/Slack/Discord na CLI | **existem** e são **bidirecionais** |
| Kanban → hub | **não existe**: o banco de eventos do hub (`~/.cline/data/db/hub-events-*.db`) recebe `ui.notify`, `session.updated`, `tool.started` e `run.completed` das sessões da CLI, e **nenhum** evento do Kanban |
| Kanban depende de `@clinebot/core` | **sim** — `src/cline-sdk/` já faz essa fronteira |

**Falta apenas o fio entre o Kanban e o hub.**

## Objetivo

Quando um cartão entra em `review`, quem precisa saber fica sabendo **onde estiver** — pelo
canal que a pessoa já usa (Telegram, Slack, Discord), sem o quadro aberto.

### Fora de escopo (por ora)

- Responder/aprovar o cartão **a partir** da conversa. O transporte existe (os conectores são
  bidirecionais), mas exige correlacionar a resposta ao id do cartão. Fica para um segundo
  passo, depois que a notificação estiver provada.
- Qualquer mudança no SDK (`cline/sdk-wip` não é público; consumimos `@clinebot/core` do npm).

## Desenho

### Ponto de inserção

O fluxo atual, achado no fonte:

```
src/server/runtime-state-hub.ts:533   detecta tarefa pronta
                              :325   broadcastTaskReadyForReview(workspaceId, taskId)
                                     └─ emite no stream do runtime → só o navegador ouve
```

A mudança é **nessa função**, que já é o ponto único por onde o evento passa.

### Três peças

1. **`src/cline-sdk/cline-hub-notifier.ts`** (novo). Embrulha o `HubUIClient` de
   `@clinebot/core`. Conecta preguiçosamente, na primeira notificação, e **falha em silêncio**
   se o hub não estiver no ar: notificação nunca pode derrubar o quadro nem travar o agente.
   Entra em `src/cline-sdk/` porque o `sdk-runtime-boundary.ts` manda centralizar ali todo
   import do SDK, "so the rest of Kanban stays decoupled from the SDK package layout".

2. **`broadcastTaskReadyForReview`** passa a chamar o notificador **além** do broadcast atual.
   O caminho do navegador não muda.

3. **Configuração**: `readyForReviewNotificationsEnabled` (booleano) vira um destino —
   `browser`, `hub`, ou ambos. **Default idêntico ao de hoje**, para não mudar nada para quem
   já usa.

### A incógnita que define o tamanho da entrega

Não sabemos se o conector de Telegram **assina** `ui.notify`. A API documenta que o hub
difunde "to all subscribers (e.g. the menu bar app)" — os assinantes conhecidos são clientes
de interface.

- **Se assina:** a entrega inteira é uma mudança só, neste repositório.
- **Se não assina:** acrescenta uma mudança no `filipesr/cline` (fork da CLI, também público)
  para o conector encaminhar.

Uma tentativa de publicar `ui.notify` por um cliente avulso falhou com `hub_connect_failed`,
provavelmente por exigir token — resolver isso é o primeiro passo do plano.

## Estratégia de contribuição

O `CONTRIBUTING.md` é explícito: **"We are not currently accepting feature PRs"**. Eles aceitam
compatibilidade entre plataformas, compatibilidade de agentes, **correção de bugs** e testes.

Por isso a entrega se divide em três, em ordem de aceitação provável:

1. **Correção da #308** (categoria aceita). Investigar por que a notificação de navegador não
   dispara e consertar, com teste. É o mesmo código deste design, então a investigação serve
   aos dois.
2. **A integração com o hub no fork**, para uso imediato do dono. Não depende de aprovação
   de ninguém.
3. **Feature Request discussion** (não issue, não PR), com as medições deste documento e um
   link para a implementação no fork — que é o argumento mais forte que existe: funciona, e
   dá para ver.

## Como se prova que funciona

- Um cartão que entra em `review` gera `ui.notify` no hub — verificável em
  `~/.cline/data/db/hub-events-*.db`.
- Com um conector de Telegram no ar, a mensagem chega no celular.
- Com o hub **desligado**, o quadro continua funcionando e o cartão transita normalmente.
  Este é o teste que importa mais: a notificação é acessório, não pode virar dependência.
- O caminho do navegador continua como antes quando o destino é `browser`.
