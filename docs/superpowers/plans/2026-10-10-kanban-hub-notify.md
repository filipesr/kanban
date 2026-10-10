# Plano — notificação de review fora do navegador

**Spec:** [docs/superpowers/specs/2026-10-10-kanban-hub-notify-design.md](../specs/2026-10-10-kanban-hub-notify-design.md)
**Branch:** `feat/hub-notify-on-review` no fork `filipesr/kanban`

## Restrições que valem para todas as tarefas

- **Node 20+**, `npm run install:all` antes de qualquer coisa; `npm run dev:full` sobe runtime
  e UI juntos; o runtime fica em `http://127.0.0.1:3484`.
- **A notificação é acessório.** Nenhuma falha dela pode derrubar o quadro, travar o agente ou
  atrasar a transição do cartão. Hub fora do ar é caso normal, não exceção.
- **Nada de mudança no SDK**: consumimos `@clinebot/core` do npm.
- **Imports do SDK só por `src/cline-sdk/`**, que é a regra declarada no
  `sdk-runtime-boundary.ts`.
- `npm run lint` e `npm test` limpos antes de cada commit.
- Commits em português não; este repositório é em inglês — **mensagens de commit e código em
  inglês**, comentários em inglês.

---

## Tarefa 0 — o ambiente roda

Sem isto nada mais existe, e é onde um ambiente de desenvolvimento alheio costuma falhar.

- [ ] `npm run install:all`
- [ ] `npm run dev:full`; confirmar runtime na 3484 e UI subindo
- [ ] abrir o quadro do `partyshare` na build local e ver os cartões existentes
- [ ] `npm test` e `npm run lint` na base limpa — **anotar o resultado**, porque é a régua para
      saber se nós quebramos algo depois

**Critério:** quadro local abre e mostra o mesmo estado da versão instalada.

---

## Tarefa 1 — como o hub aceita um cliente (resolve o `hub_connect_failed`)

A tentativa de publicar `ui.notify` por um cliente avulso falhou com `hub_connect_failed`.
Antes de escrever código de produção, descobrir o porquê.

- [ ] Ler em `@clinebot/core` como o `HubUIClient` autentica (`authToken` nas opções) e de onde
      a CLI tira esse token
- [ ] Reproduzir uma conexão bem-sucedida num script descartável
- [ ] Com o conector de Telegram no ar, publicar um `ui.notify` e **observar se chega no
      Telegram**

**Esta tarefa responde a incógnita central do spec:** se chegar, a entrega é um PR só; se não
chegar, é preciso mudar também o conector no `filipesr/cline`.

**Critério:** um `ui.notify` publicado à mão aparece em
`~/.cline/data/db/hub-events-*.db`; e está registrado, por medição, se ele chega ou não ao
Telegram.

---

## Tarefa 2 — reproduzir a #308 (o bug que eles aceitam PR)

- [ ] Reproduzir: com notificação ligada, criar um cartão e deixá-lo ir para `review`;
      confirmar que **nenhuma** notificação de navegador aparece
- [ ] Rastrear o caminho: `broadcastTaskReadyForReview` →
      `RuntimeStateStreamTaskReadyForReviewMessage` → consumo em `web-ui/src/` →
      `canShowBrowserNotifications` / `getBrowserNotificationPermission`
- [ ] Achar e escrever **onde** ele se perde (permissão não pedida? mensagem não consumida?
      condição de corrida com o foco da aba?)

**Critério:** uma frase que explica a causa, com o arquivo e a linha. Sem isso, não se conserta
— se consertar sem saber a causa, não se sabe se consertou.

---

## Tarefa 3 — consertar a #308, com teste

- [ ] Teste que falha hoje e passa depois
- [ ] O conserto
- [ ] **Mutação**: desfazer o conserto e confirmar que o teste volta a falhar
- [ ] `npm test` e `npm run lint` limpos

**Critério:** notificação de navegador aparece quando o cartão entra em `review`. Este vira o
**primeiro PR** para o upstream, na categoria que eles aceitam.

---

## Tarefa 4 — o notificador do hub

- [ ] `src/cline-sdk/cline-hub-notifier.ts`: embrulha `HubUIClient`, conexão preguiçosa,
      **engole qualquer erro** (hub fora do ar é normal), sem bloquear quem chama
- [ ] Teste: notificador com hub inexistente **não lança** e não atrasa o chamador
- [ ] `broadcastTaskReadyForReview` chama o notificador além do broadcast atual
- [ ] Teste: a transição para `review` publica `ui.notify` com título e corpo úteis
      (projeto, título do cartão, id)
- [ ] **Mutação**: derrubar o hub no meio e confirmar que o cartão transita normalmente

**Critério:** cartão em `review` gera `ui.notify` no hub, e com o hub desligado nada quebra.

---

## Tarefa 5 — a configuração de destino

- [ ] `readyForReviewNotificationsEnabled` passa a aceitar destino (`browser`, `hub`, ambos),
      com **default idêntico ao de hoje**
- [ ] Migração: configuração booleana antiga continua válida
- [ ] Interface: a opção existente vira escolha de destino
- [ ] Teste de cada combinação, inclusive "nenhum"

**Critério:** quem já usava não percebe diferença; quem liga `hub` recebe fora do navegador.

---

## Tarefa 6 — a ponta do Telegram

Depende do resultado da Tarefa 1.

- [ ] **Se o conector já assina `ui.notify`:** teste de ponta a ponta — cartão em review,
      mensagem no celular. Acabou.
- [ ] **Se não assina:** mudança no fork `filipesr/cline` para o conector encaminhar
      `ui.notify` para a conversa, com teste; e então o teste de ponta a ponta.

**Critério:** o dono recebe no celular que um cartão precisa dele, sem o quadro aberto.

---

## Tarefa 7 — levar para fora

- [ ] **PR da #308** para `cline/kanban`, só com o conserto do bug e o teste (sem o spec, sem
      o plano, sem a feature)
- [ ] **Feature Request discussion** com as medições do spec e link para a implementação
      funcionando no fork
- [ ] O fork fica utilizável pelo dono independentemente do que o upstream decidir

---

## Depois (fora deste plano)

- **Responder/aprovar o cartão a partir do Telegram** (item 2 do pedido original): o transporte
  existe, falta correlacionar a resposta ao id do cartão.
- **Tags, categorias e prioridade nos cartões** (item 3): independente, só modelo e interface;
  mas é **feature**, então nasce no fork e vai para discussão, não para PR.
