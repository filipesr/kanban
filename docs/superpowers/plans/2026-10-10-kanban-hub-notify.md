# Plan — review notification outside the browser

**Spec:** [docs/superpowers/specs/2026-10-10-kanban-hub-notify-design.md](../specs/2026-10-10-kanban-hub-notify-design.md)
**Branch:** `feat/hub-notify-on-review` in the `filipesr/kanban` fork

## Constraints that hold for every task

- **Node 20+**, `npm run install:all` before anything; `npm run dev:full` brings up the runtime
  and the UI together; the runtime listens on `http://127.0.0.1:3484`.
- **The notification is an accessory.** No failure of it may take the board down, stall an
  agent, or delay a card's transition. A hub that is not running is a normal condition, not an
  exception.
- **No SDK changes**: we consume `@clinebot/core` from npm.
- **SDK imports only through `src/cline-sdk/`**, which is the rule stated in
  `sdk-runtime-boundary.ts`.
- `npm run lint` and `npm test` clean before every commit.
- This repository is in English — **commit messages, code and comments in English**.

---

## Task 0 — the environment runs

Without this nothing else exists, and it is where someone else's development environment usually
fails.

- [ ] `npm run install:all`
- [ ] `npm run dev:full`; confirm the runtime on 3484 and the UI coming up
- [ ] open the `partyshare` board on the local build and see the existing cards
- [ ] `npm test` and `npm run lint` on a clean tree — **write down the result**, because it is
      the ruler for telling whether we broke something later

**Done when:** the local board opens and shows the same state as the installed version.

---

## Task 1 — how the hub accepts a client (resolving `hub_connect_failed`)

Publishing `ui.notify` from a standalone client failed with `hub_connect_failed`. Find out why
before writing production code.

- [ ] Read in `@clinebot/core` how `HubUIClient` authenticates (`authToken` in the options) and
      where the CLI gets that token from
- [ ] Reproduce a successful connection in a throwaway script
- [ ] With a Telegram connector running, publish a `ui.notify` and **observe whether it reaches
      Telegram**

**This task answers the spec's central unknown:** if it arrives, the work is one PR; if it does
not, the connector in `filipesr/cline` has to change too.

**Done when:** a hand-published `ui.notify` appears in `~/.cline/data/db/hub-events-*.db`, and
whether it reaches Telegram is recorded by measurement.

---

## Task 2 — reproduce #308 (the bug they do accept PRs for)

- [ ] Reproduce: with notifications on, create a card and let it reach `review`; confirm that
      **no** browser notification appears
- [ ] Trace the path: `broadcastTaskReadyForReview` →
      `RuntimeStateStreamTaskReadyForReviewMessage` → consumption in `web-ui/src/` →
      `canShowBrowserNotifications` / `getBrowserNotificationPermission`
- [ ] Find and write down **where** it is lost (permission never requested? message never
      consumed? a race with tab focus?)

**Done when:** one sentence explains the cause, with a file and a line. Without that there is
nothing to fix — and a fix made without knowing the cause is a fix nobody can trust.

---

## Task 3 — fix #308, with a test

- [ ] A test that fails today and passes afterwards
- [ ] The fix
- [ ] **Mutation**: undo the fix and confirm the test fails again
- [ ] `npm test` and `npm run lint` clean

**Done when:** the browser notification appears as a card enters `review`. This becomes the
**first PR** upstream, in the category they accept.

---

## Task 4 — the hub notifier

- [ ] `src/cline-sdk/cline-hub-notifier.ts`: wraps `HubUIClient`, connects lazily, **swallows
      every error** (a hub that is down is normal), never blocks its caller
- [ ] Test: the notifier against a hub that does not exist **does not throw** and does not delay
      the caller
- [ ] `broadcastTaskReadyForReview` calls the notifier in addition to the existing broadcast
- [ ] Test: the transition to `review` publishes `ui.notify` with a useful title and body
      (project, card title, id)
- [ ] **Mutation**: kill the hub mid-flight and confirm the card still transitions

**Done when:** a card in `review` produces `ui.notify` on the hub, and nothing breaks with the
hub switched off.

---

## Task 5 — the destination setting

- [ ] `readyForReviewNotificationsEnabled` starts accepting a destination (`browser`, `hub`,
      both), with a **default identical to today's**
- [ ] Migration: the old boolean setting stays valid
- [ ] UI: the existing toggle becomes a destination choice
- [ ] A test for each combination, including "neither"

**Done when:** anyone already using it notices no difference, and anyone enabling `hub` is
reached outside the browser.

---

## Task 6 — the Telegram end

Depends on the result of Task 1.

- [ ] **If the connector already subscribes to `ui.notify`:** an end-to-end test — card in
      review, message on the phone. Done.
- [ ] **If it does not:** a change in the `filipesr/cline` fork so the connector forwards
      `ui.notify` into the conversation, with a test; then the end-to-end test.

**Done when:** the owner is told on their phone that a card needs them, without the board open.

---

## Task 7 — taking it outside

- [ ] **The #308 PR** to `cline/kanban`, carrying only the bug fix and its test (no spec, no
      plan, no feature)
- [ ] **A Feature Request discussion** with the spec's measurements and a link to the working
      implementation in the fork
- [ ] The fork stays usable by its owner whatever upstream decides

---

## Later (outside this plan)

- **Answering or approving a card from Telegram** (item 2 of the original request): the
  transport exists; what is missing is correlating the reply to a card id.
- **Tags, categories and priority on cards** (item 3): independent, only model and UI; but it is
  a **feature**, so it starts in the fork and goes to a discussion, not a PR.

---

# Result of Task 1 — measured 2026-10-10

**The Telegram connector does NOT forward `ui.notify`.** So the work is **two PRs**.

Proven three independent ways:

1. **Empirically.** Two `ui.notify` published to the hub, authenticated (17:19 and 17:31 UTC),
   both confirmed in `hub_events`. Nothing reached Telegram. The connector was running and
   **registered as a hub client** (`type=cli name=telegram connector`), so this is not a
   connection problem.
2. **Searching the source.** Of the 10 files in `cline/cline` that mention `ui.notify`, **none**
   belongs to a connector. The connectors live in `apps/cli/src/connectors/` and never
   reference it.
3. **Stated in a comment.** `apps/cli/src/main.ts:1227-1229`, about `--zen` mode: *"completion
   is delivered via the hub's existing ui.notify broadcast (picked up by the menubar app when
   installed)"*.

## What this changes, and improves, in the upstream argument

`--zen` already means "fire it at the hub and tell me when it is done". Today that telling only
exists for whoever installed the menubar app — macOS, and optional. **A connector subscribing
to `ui.notify` is not a new feature: it is the missing delivery for one that already exists**,
and it starts serving anyone with Telegram, Slack or Discord.

That matters upstream more than the Kanban case does: Kanban is a new consumer of the same bus;
`--zen` is a consumer already there, mute.

## Consequence for the plan

- **Task 6 stops being "an end-to-end test"** and becomes a change in the `filipesr/cline` fork:
  the connector subscribes to `ui.notify` and forwards it into the conversation.
- The SDK **is** public, inside the `cline/cline` monorepo (`sdk/packages/core/src/hub/...`) —
  the initial search for `cline/sdk-wip` failed because that is only the npm package's
  `repository.url`.

---

# Result of the end-to-end test (2026-10-10, 16:00)

The loop closed and was proven by a real run: card → review → hub → connector → Telegram topic.
The evidence is the pair of records one second apart:

```
hub_events  16:47:55  ui.notify  {"title":"Ready for review",
                                  "body":"Teste de carão/tarefa — partyshare",
                                  "source":{"workspacePath":"/Users/fsrezende/Documents/algorithm/partyshare",
                                            "itemId":"461e5"}}
cline.log   16:47:56  Telegram notification delivered  telegram:-1004378402573:49
```

## Three defects that 209 + 598 green tests did not catch

None is a logic error. All are of the "program meets the world" kind, and all lived in the seam
between pieces that were each correct in isolation.

**1. A method that did not exist, hidden by a cast** (`cline`, connector).
The interface declared `subscribe`; `HubUIClient` has `subscribeUI`. An `as unknown as` silenced
the mismatch, and every test passed against a fake with the invented shape. The running
connector died with `client.subscribe is not a function` and the subscription never existed.
Fixed without the cast; a test now assigns the real class to the interface, so `tsc` complains
if they drift again.

**2. The notification existed in only one of the two runtimes** (`kanban`).
The block lived in `trackClineTaskSessionService`. A card running a terminal agent — the default
for `agentId: "claude"`, which is what is used here — went to review in silence. The feature
could not fire for that audience at all. The decision now lives in one place.

**3. The notification announced the worktree, not the repository** (`kanban`).
A card runs in a throwaway worktree under `~/.cline/worktrees/<id>/<repo>`. Nothing is bound to
a worktree: no browser tab, no chat conversation. The notice was addressed somewhere that does
not exist, and the routing — which delivers nowhere when nothing matches — stayed silent. It
now announces the workspace's repository.

## A diagnosis trap, not a feature one

`resolveClineBuildEnv()` returns `development` when `NODE_ENV=development`, and Kanban's
`dev:full` forces that. The notifier then looks for `locks/hub/development.json`, which does not
exist, and returns quietly — by contract it never throws and never logs. In a real installation
the environments match and there is no problem; in development, running with
`CLINE_BUILD_ENV=production` resolves it.

The cost was real: two full rounds of diagnosis. The notifier's total silence protects the board
from noise, but it makes "disabled", "no hub" and "failed to connect" indistinguishable. If this
goes upstream, an optional diagnostic seam is worth proposing.

## The local wiring used for the test

- **Kanban did not need the SDK rebuilt.** Types are compile-time only; `sendNotify` forwards
  the whole payload and so does the hub server (`envelope.payload ?? {}`), so the `source` field
  survives intact against the published `@clinebot/core`.
- **The connector did.** Running from the fork's source, `bun` resolves the workspaces but the
  packages point at `dist/`: `bun run build:sdk` in the monorepo, once.
- The fork's connector was started with the arguments the installed CLI had already persisted in
  `~/.cline/data/db/connectors.db`, to keep the token off the command line.
