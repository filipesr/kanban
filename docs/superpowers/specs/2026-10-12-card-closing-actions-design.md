# Closing a card from the conversation

Written 2026-10-12. Follows `2026-10-11-kanban-chat-loop.md`: the loop already carries a card's
questions out and its answers back. This closes the last gap, which is the end of the card's life.

| half | repository |
|---|---|
| closing state, `task integrate` / `task push`, shared commit prompt, two turn-boundary fixes | `cline/kanban` |
| typed payload fields, closing buttons, button routing | `cline/cline` |

## The problem

A card that finishes says "Ready for review" and stops there. Getting its work into the base
branch means opening the board, and on the phone, where the notification is read, there is
nothing to tap.

Leaving it undone costs more than it seems to. A task worktree is a **detached HEAD**
(`git worktree add --detach`, `src/workspace/task-worktree.ts:517`). No branch belongs to the
task, so a commit made there is reachable only from that worktree. Moving the card to Done
deletes the worktree, and the commit goes with it. The only thing left is the patch under
`~/.cline/kanban/trashed-task-patches`.

Two defects found while looking at this make the conclusion itself unreliable, and they are part
of the fix:

1. **A notification carried the previous turn's conclusion.** `hooks-api.ts` moved the card to
   review, which announces it, before storing the hook's metadata. After "faz o merge com o
   main", the phone showed the conclusion of the turn before. *Fixed already:* metadata is now
   stored before the transition. The test is in `test/runtime/trpc/hooks-api.test.ts`.
2. **A finished turn's conclusion survives into the next turn.** `applyHookActivity` treats a
   `null` field as "keep the previous one". A new turn therefore starts with the old
   `finalMessage`, and `isAwaitingAnswer` reads that as "the agent has said its final word". A
   question asked in a follow-up turn would be announced as "Ready for review", carrying the old
   conclusion. *To fix:* when a hook moves the card back to running, the turn's `finalMessage`
   is cleared.

## What it does

When a card enters review and is not asking anything, its notification offers **the next step
still missing, plus Concluir**. The next step is worked out from git, not remembered:

| what git shows | buttons |
|---|---|
| the worktree has uncommitted changes, or commits not yet in `baseRef` | **[Integrar na main]** · [Concluir] |
| the work is in `baseRef`, and `baseRef` is ahead of its upstream | **[Push]** · [Concluir] |
| nothing is left to integrate or push, or nothing ever changed | [Concluir] |

The button reads "Integrar na `<baseRef>`", not always "main", so it shows the card's actual
base.

- **Integrar** is what the board's Commit button already does. It sends the project's commit
  prompt into the card. The default template, `runtime-config.ts:66`, commits in the worktree
  and cherry-picks onto `baseRef`. The agent works it out, conflicts included. Its conclusion
  comes back as the next review notification, which then offers the next step.
- **Push** runs in the runtime, not through the agent. It uses the same `runGitSyncAction`
  behind the board's push button, run in the repository. Its result is posted as a reply to the
  card.
- **Concluir** moves the card to Done (`kanban task done`), which also deletes the worktree.
  When commits are still not in `baseRef`, it asks first: "N commits não integrados serão
  descartados. [Concluir mesmo assim] [Cancelar]".

Because the step comes from state, a step done any other way still counts. If you type "faz o
merge" in a reply, or press Commit on the board, the next notification already offers Push. A
step that fails, such as a conflict or a rejected push, leaves its button in place for another
try. Nothing is stored that could fall out of step with the repository.

Push is never chained after Integrar. In repositories that deploy from the base branch (work-os
deploys to Vercel on push), pushing is the deploy, so it is always a separate, deliberate tap.

## Kanban

**Closing state** — `src/server/card-closing-state.ts` (new):
`resolveCardClosingState({ worktreePath, repoPath, baseRef })` returns
`{ next: "integrate" | "push" | null, unintegratedCommits: number }`.

- *Integrate pending:* `probeGitWorkspaceState(worktreePath).changedFiles > 0`, or
  `git cherry <baseRef> HEAD` in the worktree lists any `+` commit. `cherry` compares by patch,
  not by hash, so a cherry-picked commit counts as integrated. That is what the default template
  produces; a fast-forward produces the same hash.
- *Push pending:* `probeGitWorkspaceState(repoPath)` shows `currentBranch === baseRef`, an
  upstream, and `aheadCount > 0`. When `baseRef` is not checked out in the repository, no Push is
  offered: pushing a branch nobody is on is not what this button is for.
- Any git failure returns `{ next: null, unintegratedCommits: 0 }`, which leaves only Concluir. A
  notification is an accessory and must never fail because of this.

**Notification** — `notifyHubTaskReadyForReview` computes the closing state only when the card
is not awaiting an answer, and passes it to the notifier. `ClineHubNotifyClient.sendNotify` gains
`actions?: Array<{ id: "integrate" | "push" | "done"; label: string; confirm?: string }>`. Only
Concluir carries `confirm`, and only when `unintegratedCommits > 0`.

**Shared commit prompt** — `buildTaskGitActionPrompt` moves from
`web-ui/src/git-actions/build-task-git-action-prompt.ts` to `src/core/`. The web-ui imports it
through a `@runtime-*` alias, the same way it already imports the contract. There is one prompt,
whether it is sent from the board or from a phone.

**CLI**

- `kanban task integrate --task-id <id> [--project-path]`: resolves the task workspace info and
  the project's templates, builds the commit prompt, and sends it through the same path as
  `task input`. A terminal agent gets the text, then Enter on its own write; a native Cline
  session gets a single chat message.
- `kanban task push --task-id <id> [--project-path]`: checks that the repository is on the card's
  `baseRef` and refuses otherwise, then runs the push. It prints the output, and exits non-zero
  on failure.
- `kanban task done` already exists and is unchanged.

## Cline connector

- `HubUINotifyPayload` (`sdk/packages/shared/src/hub.ts:1010`) gains `actions`. It also gains
  `column` and `updateOnly`, which Kanban already sends and the connector already reads untyped.
- A second action-id prefix, `kba:<taskId>:<integrate|push|done|done!|cancel>`, sits beside the
  existing `kbq:` for questions. `done!` is the confirmed form. The 64-byte `callback_data` limit
  is far away.
- The review notice renders `actions` as buttons. It goes through the same two routes the
  question buttons use: a raw reply to the anchor, or a chat-lib Card.
- `bot.onAction` routes `kba:` to `kanban task integrate | push | done`. The card is resolved
  from the remembered message, as `kbq:` does.
- After a tap, the message is rewritten without its keyboard, so a button cannot be pressed
  twice. It reads "⏳ Integrando na main…", "✅ Push feito" with the push result as a reply, or
  "🟢 Concluído". A Concluir that needs confirmation edits the same message into the confirmation
  and its two buttons.

## Out of scope

- A deploy warning on the Push label. It would need per-project configuration, and the tap is
  already deliberate.
- Opening a PR from the conversation, which is the board's other git action. The same mechanism
  would carry it later.
- The in-memory anchor caveat: after a connector restart, an answered message keeps its buttons.
  This is an existing limitation, and tapping a closing button twice is safe because the state is
  recomputed.

## Testing

- `card-closing-state`: run against a real temporary repository with a worktree. Cover
  uncommitted changes → integrate; a commit in the worktree → integrate; that commit
  cherry-picked onto base → push when there is an upstream and base is ahead, otherwise null;
  base not checked out → no push; a git failure → null.
- `hooks-api` / state machine: a hook moving the card to running clears `finalMessage`. A
  question asked in the second turn is announced as awaiting an answer.
- Notifier: `actions` is present on a non-awaiting review and absent on a question.
- `task integrate` builds the same prompt as the board for the same inputs. `task push` refuses
  off-base.
- Connector: `kba:` parse and build; routing each action to its command; the confirmation flow
  for `done`; the message rewritten without its keyboard after a tap.
- Live: one card in work-os, taken from review to Done from Telegram alone.
