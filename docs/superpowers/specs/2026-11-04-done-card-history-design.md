# A finished card's history

Written 2026-11-04.

## Why

Clicking a card in Done today shows almost nothing. The worktree is gone, so the diff is gone,
and for terminal agents (Claude Code, Codex, …) the terminal panel is disabled outside
`in_progress`/`review` (`web-ui/src/components/card-detail-view.tsx:556`). Compared with Trello,
where a closed card still tells its story, the card feels empty.

Native Cline cards are the exception: `ClineAgentChatPanel` renders in every column, Done
included, with the persisted conversation and a live composer (`canSend` in
`use-cline-chat-panel-controller.ts:76` doesn't look at the column).

The need is **looking back**: remembering what a finished card was about and how it got done. It is
a convenience for checking past work, not something the day-to-day flow depends on. That sets the
bar: useful and cheap to maintain, not exhaustive.

## What the user sees (option B, chosen from three mockups)

Selecting a card in Done replaces the empty detail with a read-only **summary first, details on
demand** view:

1. **Pedido**: what was asked (the card's prompt, with title).
2. **Resultado**: the agent's last answer before the card finished. That answer usually already
   summarizes the work, so no new AI-generated summary is made.
3. **A few facts**: agent, duration, commit, files changed, how many questions the agent asked,
   date finished. Any fact that can't be found is left out, not shown as "unknown".
4. Two collapsed sections:
   - **Conversa completa**: the whole conversation, the user's messages and the agent's
     answers and questions, with technical steps (tool calls, file reads, commands) folded into
     one-line summaries rather than shown in full.
   - **Movimentos do card**: the column changes with times, Trello-style.

The view is read-only. Nothing on it reopens the task. Dragging the card back to Review still
does that, as it does today.

**Decided by the user:** in Done, this view replaces the detail for every agent, Cline included.
The Cline chat panel, and its composer, no longer shows for Done cards. Every other column keeps
exactly what it shows today, with no summary added.

**My calls (the builder check raised them):**
- *Several Claude Code sessions in one folder* (a card resumed from Done relaunches with
  `--continue`, and Kanban never records a session id): Conversa shows every top-level
  `<uuid>.jsonl` in the card's folder, oldest first, each as its own run with a divider and start
  time. Resultado and the questions count come from the newest session. Subagent transcripts (the
  per-session subfolders) are left out.
- *Cards that reached Done without finishing* (interrupted sessions sent to `trash` by
  `src/core/live-task-column.ts`, or cards dragged there from In progress): if the card never
  entered Review before Done (per `events.jsonl`, or unknown), the block is labelled "Última
  resposta" instead of "Resultado", so a half-finished turn is not presented as the outcome.
- *Cards finished before `events.jsonl` existed* (2026-10-15): Movimentos falls back to what the
  board has (`createdAt`, `updatedAt`), as `task-flow-statistics.ts` does.

## Goals

- A Done card answers "what was this, and how did it go?" without leaving the board.
- Works for cards finished before this feature ships, as far as the data still exists.
- Native Cline and Claude Code cards are covered first.

## Non-goals

- Keeping history after "Limpar Concluídos". When the card is cleared, its history goes with it.
  No copy is made to survive the clear.
- Codex, OpenCode, Gemini and other terminal agents in the first cut. The view should degrade
  gracefully for them (Pedido + facts + Movimentos, no Conversa/Resultado), and the transcript
  readers should be shaped so adding one later is a new reader, not a redesign.
- Resuming, replying, or editing from this view.
- Search across finished cards' histories.

## Anti-goals

- Making the detail view slower or heavier for live cards. This only runs for Done cards, on
  demand.
- Showing raw tool output walls. If the conversation reads like a log dump, it failed even if
  it's complete.
- Kanban starting to copy or own agent transcripts. It reads what the agents already keep.

## Where the data already is

| Piece | Source |
|---|---|
| Pedido | the card on the board (`prompt`, `title`, `images`) |
| Movimentos, duration, finish date | `events.jsonl` beside the project's board (`src/core/task-events.ts`), the same log the statistics dashboard reads |
| Conversa (Cline) | the Cline SDK's persisted session, already loaded by `loadTaskSessionMessages` (`src/trpc/runtime-api.ts:384`) |
| Conversa (Claude Code) | Claude Code's own session files: `~/.claude/projects/<worktree path with / and . as ->/<session>.jsonl`. The worktree path is deterministic (`~/.cline/worktrees/<normalized task id>/<repo label>`, `src/workspace/task-worktree.ts:131`), so it can be found after the worktree is deleted. A card resumed from Done may have several session files in that folder |
| Resultado | the last assistant message of the conversation; the persisted session summary's `latestHookActivity.finalMessage` (`sessions.json`) is a fallback when no transcript is found |
| Commit, files changed | best effort from git in the base repo; see open points |

## Constraints

- Follow AGENTS.md: summary and history come through the runtime (tRPC), and the web-ui only
  renders. Use Tailwind, design tokens and the existing UI primitives. Keep files small and
  single-purpose.
- Claude Code deletes its own transcripts after `cleanupPeriodDays` (default 30 days). Older
  cards will have no Conversa. That's acceptable; the view just shows less.
- Claude Code's `.jsonl` format is not a public contract. Parsing must be tolerant: skip unknown
  lines, never fail the whole view because one entry is odd.
- Session files can be large (several MB seen). Read them off the hot path, only when a Done card
  is opened, and only parse what the view needs.

## Left to the builder

- How commit and files-changed are found (git log/`git cherry` against the base ref, the trashed
  patch file, or leaving them out when unclear). It's fine to ship without them if no reliable
  source exists.
- Exact folding rules for technical steps in the Conversa ("leu 6 arquivos · editou X"), as long
  as the conversation stays readable.
- Whether the Conversa section reuses the existing Cline chat message components for rendering
  (without the composer) or a new read-only timeline, whichever keeps one rendering path.
- API shape, caching, and how the Claude Code project folder name is derived (verify against real
  folders in `~/.claude/projects`).
- Handling of the "All projects" overview: opening a Done card there should show the same view
  if that path already opens card details; otherwise out of scope.
