# Done Card History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a card in Done shows a read-only "summary first, details on demand" view: request, result, a few facts, and collapsed Conversation and Card moves sections.

**Architecture:** One new runtime query, `runtime.getTaskHistory`, assembles everything server-side from data that already exists: the board card, `events.jsonl`, `sessions.json`, the Cline SDK's persisted session, and Claude Code's own transcripts. Claude Code transcript lines are Anthropic-shaped messages, so they go through the same hydration the Cline SDK history uses (`hydratePersistedSessionMessages`) and come out as `RuntimeTaskChatMessage[]`. The web-ui then renders them with the existing `ClineChatMessageItem`, which keeps one rendering path. In `card-detail-view.tsx`, a Done card's agent panel is replaced by the new panel. Every other column is untouched.

**Tech Stack:** TypeScript, zod, tRPC, Node fs; React, Tailwind v4, Radix Collapsible, vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-done-card-history-design.md`

## Global Constraints

- AGENTS.md applies. No `any`, no inline/dynamic imports, small single-purpose files, Tailwind tokens (`bg-surface-*`, `text-text-*`, `border-border`), Radix + Lucide, `react-use` via `@/kanban/utils/react-use` where a hook fits.
- **Never commit.** AGENTS.md: "NEVER commit unless user asks." Each task ends with verification, not a commit.
- Read-only. Nothing in the Done view sends messages, resumes, or writes state.
- Done (`trash`) column only. `backlog`, `in_progress` and `review` render exactly what they render today.
- Agents in the first cut: `cline` and `claude`. Any other agent gets request + facts + card moves, with no conversation and no result unless `latestHookActivity.finalMessage` exists.
- Claude Code transcripts live at `<claude config dir>/projects/<worktree path with every non-alphanumeric char replaced by "-">/`, where `<claude config dir>` is `$CLAUDE_CONFIG_DIR` if set, else `~/.claude`. Example: `/Users/fsrezende/.cline/worktrees/ab61f/kanban` → `-Users-fsrezende--cline-worktrees-ab61f-kanban`.
- Transcript parsing is tolerant. An unparseable line or an unknown line type is skipped and never fails the request.
- UI copy is English, matching the rest of the app (my call). Labels: "Request", "Result" / "Last reply", "Conversation", "Card moves".
- Commit and files-changed facts are **out of this plan**. The spec allows shipping without them, and nothing today links a card to its commit.

## Review Focus

1. **Transcript gone** (Claude Code deletes transcripts after `cleanupPeriodDays`, default 30). Expected: the panel still shows Request, facts and Card moves. Result falls back to `latestHookActivity.finalMessage`, and Conversation says nothing was saved. Pinned in Task 3 and Task 5.
2. **Truncated or odd transcript lines** (crash mid-write, a newer Claude Code line type). Expected: those lines are skipped and the rest renders. Pinned in Task 2.
3. **Card reached Done without passing Review** (interrupted, or dragged from In progress). Expected: the block is labelled "Last reply", not "Result". Pinned in Task 1 and Task 5.
4. **Card resumed from Done and finished again.** Expected: several runs, oldest first. Result and the question count come from the newest run. Duration runs from the first entry into In progress to the last entry into Done. Pinned in Task 1 and Task 2.
5. **A Cline card in Done.** Expected: the new panel shows, and the chat composer does not render. Pinned in Task 5.

---

### Task 1: Card moves and timing from the event log

**Files:**
- Create: `src/core/task-history-movements.ts`
- Test: `test/runtime/core/task-history-movements.test.ts`

**Interfaces:**
- Consumes: `RuntimeTaskEvent` (`src/core/task-events.ts`), `RuntimeBoardCard`, `RuntimeBoardColumnId` (`src/core/api-contract.ts`).
- Produces:
  ```ts
  export interface TaskHistoryMovement { at: number; from: RuntimeBoardColumnId | null; to: RuntimeBoardColumnId }
  export interface TaskHistoryTimeline {
    movements: TaskHistoryMovement[];   // oldest first
    startedAt: number | null;           // first move into in_progress
    finishedAt: number | null;          // last move into trash
    reachedReview: boolean;             // some move into review; false when unknown
    fromEventLog: boolean;              // false when the fallback was used
  }
  export function buildTaskHistoryTimeline(events: RuntimeTaskEvent[], card: RuntimeBoardCard): TaskHistoryTimeline
  ```

- [ ] **Step 1: Write the failing tests**
  - `it("lists a card's creation and moves oldest first, ignoring other cards")`: given `card_created(column:"backlog", at:1)`, `card_moved(backlog→in_progress, at:2)`, another task's move at 3, `card_moved(in_progress→review, at:4)`, `card_moved(review→trash, at:5)`, expect `movements` to equal `[{at:1,from:null,to:"backlog"},{at:2,from:"backlog",to:"in_progress"},{at:4,from:"in_progress",to:"review"},{at:5,from:"review",to:"trash"}]`, `startedAt` 2, `finishedAt` 5, `reachedReview` true, `fromEventLog` true.
  - `it("times a card resumed from done from its first start to its last finish")`: moves in_progress@2, review@4, trash@5, review@6, trash@9 → `startedAt` 2, `finishedAt` 9.
  - `it("marks a card that went to done without review")`: moves in_progress@2, trash@3 → `reachedReview` false.
  - `it("falls back to the card's own dates when the log has nothing")`: no events, card `createdAt` 10 and `updatedAt` 20 → `movements` `[{at:10,from:null,to:"backlog"},{at:20,from:null,to:"trash"}]`, `startedAt` null, `finishedAt` 20, `reachedReview` false, `fromEventLog` false.
  - `session_state_changed` and `card_deleted` events are ignored.

- [ ] **Step 2: Run and see it fail**
  Run: `npx vitest run test/runtime/core/task-history-movements.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `buildTaskHistoryTimeline` in `src/core/task-history-movements.ts`**

- [ ] **Step 4: Run and see it pass**
  Same command. Expected: PASS (4 tests).

---

### Task 2: Claude Code transcript reader

**Files:**
- Create: `src/server/claude-code-transcripts.ts`
- Modify: `src/cline-sdk/cline-message-repository.ts:167`: export `hydratePersistedSessionMessages` (no behaviour change).
- Modify: `src/workspace/task-worktree.ts:131`: export `getTaskWorktreePath` (no behaviour change).
- Test: `test/runtime/claude-code-transcripts.test.ts` (fixtures written to a temp dir in the test)

**Interfaces:**
- Consumes: `hydratePersistedSessionMessages(taskId: string, messages: ClineSdkPersistedMessage[]): ClineTaskMessage[]`, `ClineSdkPersistedMessage` (`src/cline-sdk/sdk-runtime-boundary.ts`).
- Produces:
  ```ts
  export function getClaudeCodeProjectDirectory(worktreePath: string, env?: NodeJS.ProcessEnv): string
  export interface TaskHistoryRun { startedAt: number | null; messages: RuntimeTaskChatMessage[] }
  export async function readClaudeCodeTranscriptRuns(taskId: string, projectDirectory: string): Promise<TaskHistoryRun[]>  // oldest first; [] when the folder is missing
  ```

Line rules (each `.jsonl` line is one JSON object):
- Read only top-level `*.jsonl` files in `projectDirectory`, never subfolders (subagent transcripts are excluded by the spec).
- Keep only `type === "user" | "assistant"` lines with `isSidechain !== true`, `isMeta !== true` and `isCompactSummary !== true`. Map each to a `ClineSdkPersistedMessage` `{ role: line.message.role, content: line.message.content }`.
- Drop user lines whose string content (or whose only text block) starts with `<command-`, `<local-command-` or `<system-reminder>`.
- Convert image blocks `{type:"image", source:{type:"base64", media_type, data}}` to the SDK shape `{type:"image", data, mediaType}`.
- Drop `thinking` / `redacted_thinking` blocks before hydration, and drop `reasoning` messages after it. History shows what was said and done, not the reasoning.
- `startedAt` is the first kept line's `timestamp` (ISO → ms). A file with no kept lines yields no run. Runs are sorted by `startedAt`.

- [ ] **Step 1: Write the failing tests**
  - `it("derives the project folder from the worktree path")`: `getClaudeCodeProjectDirectory("/Users/a/.cline/worktrees/ab61f/kanban", {HOME:"/h"})` ends with `/h/.claude/projects/-Users-a--cline-worktrees-ab61f-kanban`. With `CLAUDE_CONFIG_DIR:"/c"` it equals `/c/projects/-Users-a--cline-worktrees-ab61f-kanban`.
  - `it("turns a transcript into user, assistant and tool messages")`: fixture with a user string prompt, an assistant `text` block, an assistant `tool_use` (`name:"Edit"`), and a user `tool_result` for it. Expect roles `["user","assistant","tool"]`, user content equal to the prompt, and the tool message's `meta.toolName` `"Edit"`.
  - `it("skips sidechain, meta, command-wrapper and unparseable lines")`: fixture adds a `not json` line, an `isSidechain:true` assistant line, an `isMeta:true` user line, a `<command-name>/clear</command-name>` user line, and a `type:"attachment"` line. Expect the same three messages as above.
  - `it("orders several sessions oldest first and leaves out subagent folders")`: two files with first timestamps `2026-11-02T10:00:00Z` and `2026-11-02T09:00:00Z`, plus a `<uuid>/subagent.jsonl` → 2 runs, the 09:00 run first, `startedAt` equal to `Date.parse("2026-11-02T09:00:00Z")`.
  - `it("returns no runs when the folder does not exist")` → `[]`.

- [ ] **Step 2: Run and see it fail**
  Run: `npx vitest run test/runtime/claude-code-transcripts.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement both functions in `src/server/claude-code-transcripts.ts`, and add the two exports**

- [ ] **Step 4: Run and see it pass**, then run `npx vitest run test/runtime/cline-sdk` to confirm the hydration export changed nothing. Expected: PASS.

---

### Task 3: `getTaskHistory` runtime query

**Files:**
- Modify: `src/core/api-contract.ts`: add schemas next to `runtimeTaskChatMessagesResponseSchema` (~line 1245)
- Create: `src/server/task-history.ts`
- Modify: `src/trpc/runtime-api.ts`: add `getTaskHistory` next to `getTaskChatMessages` (~line 384)
- Modify: `src/trpc/app-router.ts`: add it to the `runtimeApi` interface (~line 239) and the router (~line 493), as a `workspaceProcedure` `.query`
- Test: `test/runtime/task-history.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildTaskHistoryTimeline`, Task 2 `readClaudeCodeTranscriptRuns`, `getClaudeCodeProjectDirectory`, `getTaskWorktreePath`; `loadWorkspaceBoardById`, `loadWorkspaceSessionsById`, `getWorkspaceDirectoryPath` (`src/state/workspace-state.ts`); `readTaskEvents` (`src/state/task-event-log.ts`); `clineTaskSessionService.loadTaskSessionMessages(taskId)`.
- Produces (contract, exported types `RuntimeTaskHistoryRequest`, `RuntimeTaskHistory`, `RuntimeTaskHistoryResponse`):
  ```ts
  runtimeTaskHistoryRequestSchema = z.object({ taskId: z.string() })
  runtimeTaskHistorySchema = z.object({
    taskId: z.string(), title: z.string().nullable(), prompt: z.string(), images: z.array(runtimeTaskImageSchema).optional(),
    agentId: runtimeAgentIdSchema.nullable(),
    outcome: z.object({ kind: z.enum(["result", "last_reply"]), text: z.string() }).nullable(),
    facts: z.object({ startedAt: z.number().nullable(), finishedAt: z.number().nullable(), durationMs: z.number().nullable(), questionCount: z.number().nullable(), messageCount: z.number() }),
    runs: z.array(z.object({ startedAt: z.number().nullable(), messages: z.array(runtimeTaskChatMessageSchema) })),
    movements: z.array(z.object({ at: z.number(), from: runtimeBoardColumnIdSchema.nullable(), to: runtimeBoardColumnIdSchema })),
  })
  runtimeTaskHistoryResponseSchema = z.object({ ok: z.boolean(), history: runtimeTaskHistorySchema.nullable(), error: z.string().optional() })
  ```
  ```ts
  // src/server/task-history.ts. Dependencies are injected so the test never boots the Cline SDK
  // (see AGENTS.md on the Node 22 CI hang).
  export interface TaskHistorySources {
    loadBoard(): Promise<RuntimeBoardData>;
    loadSessions(): Promise<Record<string, RuntimeTaskSessionSummary>>;
    loadEvents(): Promise<RuntimeTaskEvent[]>;
    loadClineMessages(taskId: string): Promise<RuntimeTaskChatMessage[]>;
    loadClaudeCodeRuns(taskId: string): Promise<TaskHistoryRun[]>;
  }
  export async function buildTaskHistory(taskId: string, sources: TaskHistorySources): Promise<RuntimeTaskHistoryResponse>
  ```

Rules:
- The card must be in the `trash` column, or the response is `{ ok:false, history:null, error:"Task is not in Done." }`. A missing card gets `error:"Task not found."`.
- `agentId = sessions[taskId]?.agentId ?? card.agentId ?? null`. `"cline"` yields a single run `{ startedAt: timeline.startedAt, messages: (await loadClineMessages(taskId)).filter(m => m.role !== "reasoning") }`, or no run if that list is empty. `"claude"` yields `loadClaudeCodeRuns(taskId)`. Any other agent yields `[]`.
- `outcome.text` is the content of the newest run's last `assistant` message. If there is none, it is `sessions[taskId]?.latestHookActivity?.finalMessage`. If that is empty too, `outcome` is null. `outcome.kind` is `timeline.reachedReview ? "result" : "last_reply"`.
- `questionCount` counts the newest run's `tool` messages whose `meta.toolName` is `"AskUserQuestion"` or `"ask_question"`. It is null when there are no runs.
- `messageCount` is the number of `user` + `assistant` messages across all runs. `durationMs` is `finishedAt - startedAt` when both are known.
- In `runtime-api.ts`, wire the sources from `workspaceScope`: board and sessions by `workspaceId`, events from `getWorkspaceDirectoryPath(workspaceId)`, Cline messages from `deps.getScopedClineTaskSessionService(workspaceScope)`, and Claude runs from `getClaudeCodeProjectDirectory(getTaskWorktreePath(workspaceScope.workspacePath, taskId))`. Errors become `{ ok:false, history:null, error }`, as `getTaskChatMessages` does.

- [ ] **Step 1: Write the failing tests** (fake `TaskHistorySources`)
  - `it("builds a Claude Code card's history from its newest run")`: card in trash with prompt "Make Done collapsible". Moves backlog@1 → in_progress@2 → review@5 → trash@8. Two runs; the newest has tool `AskUserQuestion` ×1 and a last assistant message "Done: columns collapse". Expect `outcome` `{kind:"result", text:"Done: columns collapse"}`, `facts.durationMs` 6, `facts.questionCount` 1, `runs.length` 2, `movements.length` 4.
  - `it("labels the outcome as last reply when the card skipped review")`: moves in_progress → trash → `outcome.kind` `"last_reply"`.
  - `it("falls back to the hook's final message when no transcript survives")`: claude card, `loadClaudeCodeRuns` → `[]`, session `latestHookActivity.finalMessage` "Shipped it" → `outcome.text` "Shipped it", `runs` `[]`, `questionCount` null, `messageCount` 0.
  - `it("uses the Cline session for a Cline card and drops reasoning")`: messages user, reasoning, assistant, tool(`ask_question`) → one run with 3 messages, `questionCount` 1.
  - `it("gives other agents only the request, facts and moves")`: agent `"codex"` → `runs` `[]`, and neither loader is called.
  - `it("refuses a card that is not in Done")` → `ok:false`, error "Task is not in Done.".

- [ ] **Step 2: Run and see it fail.** Run: `npx vitest run test/runtime/task-history.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the schemas, `buildTaskHistory`, and the runtime-api/app-router wiring**

- [ ] **Step 4: Verify**
  Run: `npx vitest run test/runtime/task-history.test.ts && npm run typecheck`. Expected: tests PASS, and tsc exits 0. Also run `npx vitest run test/runtime/api-validation.test.ts` if it snapshots the router.

---

### Task 4: `useTaskHistory` hook

**Files:**
- Create: `web-ui/src/hooks/use-task-history.ts`
- Test: `web-ui/src/hooks/use-task-history.test.tsx`

**Interfaces:**
- Consumes: `getRuntimeTrpcClient(projectId).runtime.getTaskHistory.query({ taskId })`; types `RuntimeTaskHistory` from `@/runtime/types`.
- Produces:
  ```ts
  export interface UseTaskHistoryResult { history: RuntimeTaskHistory | null; isLoading: boolean; error: string | null }
  export function useTaskHistory(input: { projectId: string | null; taskId: string }): UseTaskHistoryResult
  ```
  It loads once per `(projectId, taskId)` and does not poll, because Done cards don't change. Only the latest request may land, following the `latestRequestIdRef` pattern in `use-project-statistics.ts`. An `ok:false` response becomes `error`.

- [ ] **Step 1: Write the failing tests** (mock `@/runtime/trpc-client`)
  - `it("loads the history of the selected card")` → `history.prompt` matches the mock, and `isLoading` goes from true to false.
  - `it("keeps only the latest card's history when the selection changes quickly")`: the first query resolves after the second, and the final `history.taskId` is the second's.
  - `it("reports the runtime's error")`: `{ok:false, history:null, error:"Task not found."}` → `error` "Task not found.".
- [ ] **Step 2: Run and see it fail.** `cd web-ui && npx vitest run src/hooks/use-task-history.test.tsx`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and see it pass.**

---

### Task 5: Done card history panel, wired into the detail view

**Files:**
- Create: `web-ui/src/components/detail-panels/done-card-history-panel.tsx`: the panel. It holds the Request block, the outcome block, and the two collapsibles.
- Create: `web-ui/src/components/detail-panels/done-card-history-facts.tsx`: the facts grid.
- Create: `web-ui/src/components/detail-panels/done-card-history-format.ts`: `formatHistoryDuration(ms: number): string` (for example "50 min", "2 h 5 min", "< 1 min"), and `formatColumnName(id: RuntimeBoardColumnId): string` ("Backlog", "In progress", "Review", "Done").
- Modify: `web-ui/src/components/card-detail-view.tsx:685`: when `selection.column.id === "trash"`, `agentChatPanel` is `<DoneCardHistoryPanel projectId={currentProjectId} card={selection.card} />` for every agent, so the Cline panel and its composer no longer render there.
- Test: `web-ui/src/components/detail-panels/done-card-history-panel.test.tsx`, `web-ui/src/components/detail-panels/done-card-history-format.test.ts`, and a case in `web-ui/src/components/card-detail-view.test.tsx`.

**Interfaces:**
- Consumes: Task 4 `useTaskHistory`; `ClineChatMessageItem` (`cline-chat-message-item.tsx`) for each run message; `ClineMarkdownContent` for the outcome; `TaskImageStrip` for request images; `@radix-ui/react-collapsible`; `Spinner`.
- Produces: `export function DoneCardHistoryPanel(props: { projectId: string | null; card: BoardCard }): ReactElement`.

Layout, top to bottom, scrollable, `bg-surface-0`:
- **Request**: the card title if set, then the prompt (pre-wrap) and images.
- **Result** or **Last reply** (by `outcome.kind`): markdown. Leave the block out when `outcome` is null.
- **Facts**: agent, duration, questions, finished, messages. A null fact is left out entirely, never shown as "unknown".
- **Conversation (N messages)**: collapsed by default. With several runs, each run is preceded by a divider, "Run k · <start time>". With no runs, the section shows "No conversation was saved for this card." Tool calls render through `ClineChatMessageItem`, which already folds them into one line.
- **Card moves (N)**: collapsed by default. One line per move, "Review → Done · 2 Nov, 10:02". A card created with `from: null` reads "Created in Backlog".
- Loading shows `Spinner`. An error shows the message in `text-text-secondary`.

- [ ] **Step 1: Write the failing tests**
  - Format: `formatHistoryDuration(50*60_000)` → "50 min"; `(125*60_000)` → "2 h 5 min"; `(20_000)` → "< 1 min".
  - Panel (mock `useTaskHistory`):
    - `it("shows request, result and facts, with conversation and moves collapsed")`: the text "Result" and the outcome are present, message contents are absent until the "Conversation" trigger is clicked, and then they are present.
    - `it("labels a card that skipped review as last reply")`.
    - `it("explains when no conversation was saved")`: `runs:[]`, expand Conversation → "No conversation was saved for this card.".
    - `it("leaves out facts it does not know")`: `durationMs:null` → no "Duration" label.
    - `it("separates several runs")`: 2 runs → "Run 1" and "Run 2".
  - Detail view, in `card-detail-view.test.tsx`, following its existing trash fixture (~line 112): `it("shows the history panel and no chat composer for a Cline card in Done")`. Use a Cline card in the trash column: the history panel renders and the Cline composer does not. The same card in `review` still renders the Cline panel.
- [ ] **Step 2: Run and see them fail.** `cd web-ui && npx vitest run src/components/detail-panels/done-card-history src/components/card-detail-view.test.tsx`
- [ ] **Step 3: Implement the three files and the `card-detail-view.tsx` switch**
- [ ] **Step 4: Verify the whole thing**
  Run: `cd web-ui && npx vitest run && npm run typecheck && npm run lint`, then at the root `npm run typecheck && npm run test:fast`. Expected: all green.
- [ ] **Step 5: See it working**: use the `run` skill to start Kanban, open a Done Claude Code card and a Done Cline card, and check the view against the spec. Report what was seen.
