# Ready-for-review notification outside the browser — design

**Date:** 2026-10-10 · **Repository:** fork `filipesr/kanban` (upstream `cline/kanban` 0.1.70)

## The problem

A card that finishes and enters **Review** announces itself only through a **browser
notification**. That requires the board open in a tab, on the same machine — and it contradicts
the product's own promise: running many agents in parallel is, by construction, something you
are **not** watching.

Worse, that single delivery path is broken.
[#308](https://github.com/cline/kanban/issues/308) (a bug, open since April, 0.1.60) and
[#284](https://github.com/cline/kanban/issues/284) both report the notification never appearing
even with the setting on.

Measured on this machine on 2026-10-10 (macOS, `cline` 3.0.70, `kanban` 0.1.70, `claude-code`
provider): a card ran a real task, moved to **Review** and waited for a human answer; replying
on the card made it resume. At no point was there a notification outside the tab.

## What exists already, and what is missing

| piece | state |
|---|---|
| the notion of a review notification | **exists** (`readyForReviewNotificationsEnabled`) |
| delivery | **browser only**, and broken (#308) |
| the Cline hub's event bus | **exists**: `HubUIClient.sendNotify()` publishes `ui.notify`, the hub broadcasts it to every subscriber |
| Telegram/Slack/Discord connectors in the CLI | **exist**, and are **bidirectional** |
| Kanban → hub | **does not exist**: the hub's event store (`~/.cline/data/db/hub-events-*.db`) holds `ui.notify`, `session.updated`, `tool.started` and `run.completed` from CLI sessions, and **nothing** from Kanban |
| Kanban depends on `@clinebot/core` | **yes** — `src/cline-sdk/` already draws that boundary |

**All that is missing is the wire between Kanban and the hub.**

## Goal

When a card enters `review`, whoever needs to know finds out **wherever they are**, through the
channel they already use (Telegram, Slack, Discord), without the board open.

### Out of scope (for now)

- Answering or approving the card **from** the conversation. The transport exists — the
  connectors are bidirectional — but it needs the reply correlated to a card id. A second step,
  once the notification itself is proven.
- Any change to the SDK (`cline/sdk-wip` is not public; we consume `@clinebot/core` from npm).

## Design

### Insertion point

The current flow, found in the source:

```
src/server/runtime-state-hub.ts:533   detects a task is ready
                              :325   broadcastTaskReadyForReview(workspaceId, taskId)
                                     └─ emits on the runtime stream → only the browser hears it
```

The change goes **in that function**, which is already the single point the event passes through.

### Three pieces

1. **`src/cline-sdk/cline-hub-notifier.ts`** (new). Wraps `HubUIClient` from `@clinebot/core`.
   Connects lazily, on the first notification, and **fails silently** when the hub is not
   running: a notification must never take the board down or stall an agent. It lives in
   `src/cline-sdk/` because `sdk-runtime-boundary.ts` requires every SDK import to be
   centralised there, "so the rest of Kanban stays decoupled from the SDK package layout".

2. **`broadcastTaskReadyForReview`** calls the notifier **in addition to** the existing
   broadcast. The browser path does not change.

3. **Configuration**: `readyForReviewNotificationsEnabled` (a boolean) becomes a destination —
   `browser`, `hub`, or both. **The default matches today's behaviour exactly**, so nothing
   changes for anyone already using it.

### The unknown that decides how big this is

We do not know whether the Telegram connector **subscribes** to `ui.notify`. The API documents
that the hub broadcasts "to all subscribers (e.g. the menu bar app)" — and the known
subscribers are UI clients.

- **If it subscribes:** the whole delivery is one change, in this repository.
- **If it does not:** it adds a change in `filipesr/cline` (the CLI fork, also public) so the
  connector forwards it.

An attempt to publish `ui.notify` from a standalone client failed with `hub_connect_failed`,
most likely because a token is required. Resolving that is the first step of the plan.

## Contribution strategy

`CONTRIBUTING.md` is explicit: **"We are not currently accepting feature PRs"**. They do accept
cross-platform compatibility, agent compatibility, **bug fixes** and tests.

So the work splits in three, ordered by how likely each is to be accepted:

1. **Fixing #308** (an accepted category). Find out why the browser notification does not fire
   and fix it, with a test. It is the same code this design touches, so the investigation serves
   both.
2. **The hub integration in the fork**, for the owner's immediate use. It depends on nobody's
   approval.
3. **A Feature Request discussion** (not an issue, not a PR), carrying the measurements in this
   document and a link to the implementation in the fork — which is the strongest argument
   available: it works, and you can see it.

## How this is proven

- A card entering `review` produces `ui.notify` on the hub, verifiable in
  `~/.cline/data/db/hub-events-*.db`.
- With a Telegram connector running, the message arrives on the phone.
- With the hub **switched off**, the board keeps working and the card transitions normally.
  This is the test that matters most: the notification is an accessory and must never become a
  dependency.
- The browser path behaves as before when the destination is `browser`.
