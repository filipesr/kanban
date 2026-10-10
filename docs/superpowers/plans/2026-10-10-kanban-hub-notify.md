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

---

# Resultado da Tarefa 1 — medido em 2026-10-10

**O conector de Telegram NÃO encaminha `ui.notify`.** Logo, a entrega são **dois PRs**.

Como se provou, por três caminhos independentes:

1. **Empírico.** Dois `ui.notify` publicados no hub, autenticados (17:19 e 17:31 UTC), ambos
   confirmados em `hub_events`. Nada chegou ao Telegram. O conector estava no ar e **registrado
   como cliente do hub** (`type=cli name=telegram connector`), então o problema não é conexão.
2. **Busca no fonte.** Dos 10 arquivos de `cline/cline` que mencionam `ui.notify`, **nenhum** é
   de conector. Os conectores vivem em `apps/cli/src/connectors/` e não o referenciam.
3. **Declarado em comentário.** `apps/cli/src/main.ts:1227-1229`, sobre o modo `--zen`:
   *"completion is delivered via the hub's existing ui.notify broadcast (picked up by the
   menubar app when installed)"*.

## O que isso muda, e melhora, no argumento upstream

O `--zen` já é "dispara no hub e me avise quando terminar". Hoje esse aviso só existe para quem
instalou o app de barra de menu — macOS, e opcional. **Um conector assinando `ui.notify` não é
feature nova: é a entrega que falta a um recurso que já existe**, e passa a servir qualquer
pessoa com Telegram, Slack ou Discord.

Isso vale para a discussão upstream mais que o caso do Kanban: o Kanban é um consumidor novo do
mesmo barramento; o `--zen` é um consumidor que já está lá, mudo.

## Consequência para o plano

- **Tarefa 6 deixa de ser "teste de ponta a ponta"** e passa a ser uma mudança no fork
  `filipesr/cline`: o conector assina `ui.notify` e encaminha para a conversa.
- O SDK **é** público, dentro do monorepo `cline/cline` (`sdk/packages/core/src/hub/...`) — a
  busca inicial por `cline/sdk-wip` falhou porque é só o `repository.url` do pacote npm.

---

# Resultado do teste de ponta a ponta (10/10/2026, 16h)

Ciclo fechado e provado com disparo real: cartão → review → hub → conector → tópico do Telegram.
A evidência é o par de registros a um segundo de distância:

```
hub_events  16:47:55  ui.notify  {"title":"Ready for review",
                                  "body":"Teste de carão/tarefa — partyshare",
                                  "source":{"workspacePath":"/Users/fsrezende/Documents/algorithm/partyshare",
                                            "itemId":"461e5"}}
cline.log   16:47:56  Telegram notification delivered  telegram:-1004378402573:49
```

## Três defeitos que 209 + 598 testes verdes não pegavam

Nenhum é erro de lógica. Todos são da classe "o programa encontra o mundo", e todos estavam na
costura entre peças que, isoladas, estavam certas.

**1. Método inventado, escondido por um molde** (`cline`, conector).
A interface declarava `subscribe`; `HubUIClient` tem `subscribeUI`. Um `as unknown as`
silenciou a divergência, e todos os testes passavam contra um dublê com a forma errada. O
conector em execução morria com `client.subscribe is not a function` e a inscrição nunca
existia. Corrigido sem molde; o teste agora atribui a classe real à interface, e o `tsc`
reclama se voltarem a divergir.

**2. A notificação existia só num dos dois runtimes** (`kanban`).
O bloco vivia em `trackClineTaskSessionService`. Cartão com agente de terminal — o padrão de
`agentId: "claude"`, que é o que se usa aqui — ia para review em silêncio. A funcionalidade
não podia disparar para esse público. A decisão passou a viver num ponto só.

**3. A notificação anunciava a worktree, não o repositório** (`kanban`).
Cartão roda em worktree descartável sob `~/.cline/worktrees/<id>/<repo>`. Nada se liga a uma
worktree: nem aba de navegador, nem conversa de chat. O aviso ia para um endereço inexistente
e o roteamento, que entrega em nenhum lugar quando nada casa, ficava mudo. Passa a anunciar o
repositório do workspace.

## Uma armadilha de diagnóstico, não de funcionalidade

`resolveClineBuildEnv()` devolve `development` quando `NODE_ENV=development`, e o `dev:full` do
Kanban força isso. O notificador então procura `locks/hub/development.json`, que não existe, e
retorna calado — por contrato, ele nunca lança e nunca registra. Em instalação real os
ambientes coincidem e não há problema; em desenvolvimento, rodar com `CLINE_BUILD_ENV=production`
resolve.

O custo disso foi real: duas rodadas inteiras de diagnóstico. O silêncio total do notificador
protege o board de ruído, mas torna "desligado", "hub ausente" e "falhou ao conectar"
indistinguíveis. Se isso for para upstream, vale propor uma costura de diagnóstico opcional.

## Ligação local usada no teste

- **O Kanban não precisou do SDK recompilado.** Tipos são de compilação; `sendNotify` repassa o
  payload inteiro e o servidor do hub também (`envelope.payload ?? {}`), então o campo `source`
  atravessa intacto contra o `@clinebot/core` publicado.
- **O conector precisou.** Rodando do fonte do fork, o `bun` resolve os workspaces mas os
  pacotes apontam para `dist/`: `bun run build:sdk` no monorepo, uma vez.
- Conector do fork subido com os argumentos que o CLI instalado já havia persistido em
  `~/.cline/data/db/connectors.db`, para não passar o token em linha de comando.
