# Card Closing Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A card that finishes offers, from Telegram, the next missing step to close it (Integrar na `<base>` → Push), plus Concluir. The step is derived from git.

**Architecture:** Kanban works out the closing state when a non-question review notification goes out, and publishes `actions` on `ui.notify`. Its CLI gains `task integrate` and `task push`; `task done` already exists. The Cline Telegram connector renders `actions` as buttons under a new `kba:` id prefix and routes a tap to the matching `kanban task …` command.

**Tech Stack:** TypeScript, vitest, tRPC (Kanban runtime), commander (Kanban CLI), `chat` lib + Telegram Bot API (Cline connector), git.

**Spec:** `docs/superpowers/specs/2026-10-12-card-closing-actions-design.md`

## Global Constraints

- Two repositories. Kanban: `/Users/fsrezende/Documents/algorithm/kanban` (branch `feat/hub-notify-on-review`). Cline: `/Users/fsrezende/Documents/algorithm/cline` (branch `feat/kanban-chat-loop`).
- **Never commit.** Kanban's AGENTS.md says "NEVER commit unless user asks". Leave changes in the working tree; there are no commit steps.
- No `any`. No inline or dynamic imports. Use top-level imports only.
- Notifications are an accessory. Nothing on the notify path may throw, block a card transition, or fail the notification. A git failure degrades to "only Concluir".
- Action ids: `kba:<taskId>:<integrate|push|done|done!|cancel>`. The existing `kbq:` stays unchanged. Telegram `callback_data` is capped at 64 bytes.
- Button labels, verbatim: `Integrar na <baseRef>`, `Push`, `Concluir`, `Concluir mesmo assim`, `Cancelar`.
- Confirm text, verbatim: `N commits não integrados serão descartados.` Use `1 commit não integrado será descartado.` when N = 1.
- Push is never chained after Integrar. It is always its own tap.
- Kanban tests: `npx vitest run <path>` from the Kanban root. Typecheck: `npm run typecheck`, plus `npm run web:typecheck` for web-ui. Lint: `npx biome check <files>`.
- Cline tests: `cd apps/cli && npx vitest run --config vitest.config.ts <path>`. Typecheck: `cd apps/cli && npx tsc --noEmit -p .`.

## Review Focus

- **Commit cherry-picked onto base (new hash).** It must count as integrated, so the next step is Push and Integrar is not offered again. Tested in Task 2 with `git cherry`.
- **Base branch not checked out in the repo** (the user switched branches). No Push is offered, and `task push` refuses. Tested in Tasks 2 and 4.
- **Worktree already deleted, or the path is not a repository.** The notification still goes out, with only Concluir. Tested in Task 2 (git failure → `next: null`).
- **A question asked in a follow-up turn.** It is announced as awaiting, with its own text, not the previous conclusion. Tested in Task 1.
- **A closing button tapped after the connector restarted.** The card is resolved from the on-disk `cardMessages`. The action still runs; only the strike-through is lost. Tested in Task 8 (routing uses `findRememberedCard`).

---

## File map

**Kanban**
- `src/terminal/session-state-machine.ts`: clear `finalMessage` when a hook starts a new turn (Task 1).
- `src/server/card-closing-state.ts` (new): `resolveCardClosingState`, `buildCardClosingActions` (Task 2).
- `src/core/task-git-action-prompt.ts` (new): the prompt builder, moved from web-ui (Task 3).
- `web-ui/src/git-actions/build-task-git-action-prompt.ts`: deleted. Importers switch to the `@runtime-task-git-action-prompt` alias (Task 3).
- `src/commands/task.ts`: `task integrate`, `task push`, shared `deliverTaskInput` (Task 4).
- `src/cline-sdk/cline-hub-notifier.ts`, `src/server/runtime-state-hub.ts`: `actions` on review (Task 5).

**Cline**
- `sdk/packages/shared/src/hub.ts`: `HubUINotifyAction`, plus `actions`, `column`, `updateOnly` on the payload (Task 6).
- `apps/cli/src/connectors/ui-notify-subscription.ts`: parse `actions` into `NotifyDeliveryOptions` (Task 6).
- `apps/cli/src/connectors/card-closing-actions.ts` (new): ids, buttons, commands (Task 7).
- `apps/cli/src/connectors/telegram-card-reply.ts`, `card-question-message.ts`: generic `buttons` (Task 7).
- `apps/cli/src/connectors/kanban-card-reply.ts`: export the runner and failure text; persist `actions` (Task 7).
- `apps/cli/src/connectors/adapters/telegram.ts`: render actions and route `kba:` (Task 8).

---

### Task 1: A new turn starts without the previous conclusion

**Files:**
- Modify: `src/terminal/session-state-machine.ts:44-56`
- Test: `test/runtime/terminal/session-state-machine.test.ts` (create it if it does not exist; check with `ls test/runtime/terminal/`)

**Interfaces:**
- Produces: `reduceSessionTransition` for `hook.to_in_progress` and `agent.prompt-ready`. When the summary had activity, the patch also sets `latestHookActivity: { ...previous, finalMessage: null }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../../src/core/api-contract";
import { reduceSessionTransition } from "../../../src/terminal/session-state-machine";

function reviewed(finalMessage: string | null): RuntimeTaskSessionSummary {
	return {
		taskId: "52609",
		state: "awaiting_review",
		agentId: "claude",
		workspacePath: "/tmp/worktree",
		pid: 1,
		startedAt: 1,
		updatedAt: 1,
		lastOutputAt: 1,
		reviewReason: "hook",
		exitCode: null,
		lastHookAt: 1,
		latestHookActivity: {
			activityText: "Final: O merge está feito.",
			toolName: "Bash",
			toolInputSummary: null,
			finalMessage,
			hookEventName: "Stop",
			notificationType: null,
			source: "claude",
		},
	} as RuntimeTaskSessionSummary;
}

describe("reduceSessionTransition", () => {
	// The defect: a finished turn's conclusion survived into the next turn, so a question asked
	// there read as "the agent has said its final word" and went out as Ready for review with
	// the previous turn's text.
	it("starts a new turn without the previous turn's conclusion", () => {
		const result = reduceSessionTransition(reviewed("O merge está feito."), { type: "hook.to_in_progress" });
		expect(result.changed).toBe(true);
		expect(result.patch.state).toBe("running");
		expect(result.patch.latestHookActivity?.finalMessage).toBeNull();
		expect(result.patch.latestHookActivity?.toolName).toBe("Bash");
	});

	it("leaves a summary with no activity without one", () => {
		const summary = { ...reviewed(null), latestHookActivity: null };
		const result = reduceSessionTransition(summary, { type: "agent.prompt-ready" });
		expect(result.patch.latestHookActivity).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run test/runtime/terminal/session-state-machine.test.ts`
Expected: FAIL. `latestHookActivity` is undefined in the patch.

- [ ] **Step 3: Implement**

In `src/terminal/session-state-machine.ts`, replace the `hook.to_in_progress` / `agent.prompt-ready` return:

```ts
		case "hook.to_in_progress":
		case "agent.prompt-ready": {
			if (summary.state !== "awaiting_review" || !canReturnToRunning(summary.reviewReason)) {
				return { changed: false, patch: {}, clearAttentionBuffer: false };
			}
			return {
				changed: true,
				patch: {
					state: "running",
					reviewReason: null,
					// A new turn has not concluded anything yet. Kept, the previous conclusion is
					// read as this turn's final word, and a question asked now is announced as
					// finished, carrying the old text.
					...(summary.latestHookActivity
						? { latestHookActivity: { ...summary.latestHookActivity, finalMessage: null } }
						: {}),
				},
				clearAttentionBuffer: true,
			};
		}
```

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npx vitest run test/runtime/terminal test/runtime/trpc test/runtime/review-request-detail.test.ts test/runtime/runtime-state-hub-notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Add an end-to-end test of the second-turn question to `test/runtime/review-request-detail.test.ts`**

```ts
import { reduceSessionTransition } from "../../src/terminal/session-state-machine";
// (add to the existing imports of describeReviewRequest / isAwaitingAnswer)

it("announces a question asked in the turn after a conclusion as a question", () => {
	const concluded = {
		taskId: "52609", state: "awaiting_review", agentId: "claude", workspacePath: "/w", pid: 1,
		startedAt: 1, updatedAt: 1, lastOutputAt: 1, reviewReason: "hook", exitCode: null, lastHookAt: 1,
		latestHookActivity: {
			activityText: "Final: O merge está feito.", toolName: null, toolInputSummary: null,
			finalMessage: "O merge está feito.", hookEventName: "Stop", notificationType: null, source: "claude",
		},
	} as RuntimeTaskSessionSummary;
	const nextTurn = { ...concluded, ...reduceSessionTransition(concluded, { type: "hook.to_in_progress" }).patch };
	const asking = {
		...nextTurn,
		state: "awaiting_review",
		latestHookActivity: {
			...nextTurn.latestHookActivity!,
			activityText: "Waiting for approval: Faço o push? 1) Sim 2) Não",
			hookEventName: "PermissionRequest",
		},
	} as RuntimeTaskSessionSummary;
	expect(isAwaitingAnswer(asking)).toBe(true);
	expect(describeReviewRequest(asking)).toContain("Faço o push?");
	expect(describeReviewRequest(asking)).not.toContain("O merge está feito");
});
```

Run: `npx vitest run test/runtime/review-request-detail.test.ts`. Expected: PASS. If `RuntimeTaskSessionSummary` is not imported in that file yet, add `import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";`. Replace the non-null assertion with a local variable if biome flags it.

---

### Task 2: Closing state from git

**Files:**
- Create: `src/server/card-closing-state.ts`
- Test: `test/runtime/card-closing-state.test.ts`

**Interfaces:**
- Consumes: `probeGitWorkspaceState(cwd)` (`src/workspace/git-sync.ts:113`), which returns `{ currentBranch, upstreamBranch, aheadCount, changedFiles, … }`; `runGit(cwd, args)` (`src/workspace/git-utils.ts:35`), which returns `{ ok, stdout, … }`.
- Produces:
  ```ts
  export type CardClosingStep = "integrate" | "push";
  export interface CardClosingState { next: CardClosingStep | null; unintegratedCommits: number }
  export async function resolveCardClosingState(input: { worktreePath: string | null; repoPath: string; baseRef: string }): Promise<CardClosingState>
  export interface CardClosingAction { id: "integrate" | "push" | "done"; label: string; confirm?: string }
  export function buildCardClosingActions(state: CardClosingState, baseRef: string): CardClosingAction[]
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildCardClosingActions, resolveCardClosingState } from "../../src/server/card-closing-state";
import { createGitTestEnv } from "../utilities/git-env";
import { createTempDir } from "../utilities/temp-dir";

function git(cwd: string, args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", env: createGitTestEnv() });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	}
	return result.stdout.trim();
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A repo on `main` with an upstream, plus a detached task worktree, as Kanban creates them. */
function setup() {
	const remoteDir = createTempDir("closing-remote-");
	const repoDir = createTempDir("closing-repo-");
	const worktreeDir = createTempDir("closing-wt-");
	cleanups.push(remoteDir.cleanup, repoDir.cleanup, worktreeDir.cleanup);
	git(remoteDir.path, ["init", "--bare", "-b", "main"]);
	git(repoDir.path, ["init", "-b", "main"]);
	writeFileSync(join(repoDir.path, "a.txt"), "a\n");
	git(repoDir.path, ["add", "."]);
	git(repoDir.path, ["commit", "-m", "base"]);
	git(repoDir.path, ["remote", "add", "origin", remoteDir.path]);
	git(repoDir.path, ["push", "-u", "origin", "main"]);
	const worktree = join(worktreeDir.path, "wt");
	git(repoDir.path, ["worktree", "add", "--detach", worktree, "main"]);
	return { repo: repoDir.path, worktree };
}

describe("resolveCardClosingState", () => {
	it("offers integrate for uncommitted changes in the worktree", async () => {
		const { repo, worktree } = setup();
		writeFileSync(join(worktree, "b.txt"), "b\n");
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: "integrate",
			unintegratedCommits: 0,
		});
	});

	it("offers integrate for a commit not yet in base, and counts it", async () => {
		const { repo, worktree } = setup();
		writeFileSync(join(worktree, "b.txt"), "b\n");
		git(worktree, ["add", "."]);
		git(worktree, ["commit", "-m", "task"]);
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: "integrate",
			unintegratedCommits: 1,
		});
	});

	// The default commit template cherry-picks, which gives the commit a new hash on base.
	it("treats a cherry-picked commit as integrated and offers push", async () => {
		const { repo, worktree } = setup();
		writeFileSync(join(worktree, "b.txt"), "b\n");
		git(worktree, ["add", "."]);
		git(worktree, ["commit", "-m", "task"]);
		const taskCommit = git(worktree, ["rev-parse", "HEAD"]);
		git(repo, ["cherry-pick", taskCommit]);
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: "push",
			unintegratedCommits: 0,
		});
	});

	it("offers nothing once base is pushed", async () => {
		const { repo, worktree } = setup();
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: null,
			unintegratedCommits: 0,
		});
	});

	it("offers no push when base is not the branch checked out in the repo", async () => {
		const { repo, worktree } = setup();
		writeFileSync(join(repo, "c.txt"), "c\n");
		git(repo, ["add", "."]);
		git(repo, ["commit", "-m", "local"]);
		git(repo, ["checkout", "-b", "other"]);
		expect((await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).next).toBeNull();
	});

	it("degrades to nothing when the worktree is gone", async () => {
		const { repo } = setup();
		expect(await resolveCardClosingState({ worktreePath: "/nonexistent/wt", repoPath: repo, baseRef: "main" })).toEqual({
			next: null,
			unintegratedCommits: 0,
		});
	});
});

describe("buildCardClosingActions", () => {
	it("names the card's base on integrate and always offers Concluir", () => {
		expect(buildCardClosingActions({ next: "integrate", unintegratedCommits: 0 }, "develop")).toEqual([
			{ id: "integrate", label: "Integrar na develop" },
			{ id: "done", label: "Concluir" },
		]);
	});

	it("asks before discarding commits", () => {
		expect(buildCardClosingActions({ next: "integrate", unintegratedCommits: 2 }, "main")[1]).toEqual({
			id: "done",
			label: "Concluir",
			confirm: "2 commits não integrados serão descartados.",
		});
		expect(buildCardClosingActions({ next: "integrate", unintegratedCommits: 1 }, "main")[1]?.confirm).toBe(
			"1 commit não integrado será descartado.",
		);
	});

	it("offers push, then only Concluir", () => {
		expect(buildCardClosingActions({ next: "push", unintegratedCommits: 0 }, "main").map((a) => a.id)).toEqual([
			"push",
			"done",
		]);
		expect(buildCardClosingActions({ next: null, unintegratedCommits: 0 }, "main")).toEqual([
			{ id: "done", label: "Concluir" },
		]);
	});
});
```

- [ ] **Step 2: Run them and check that they fail**

Run: `npx vitest run test/runtime/card-closing-state.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement `src/server/card-closing-state.ts`**

```ts
import { existsSync } from "node:fs";

import { runGit } from "../workspace/git-utils";
import { probeGitWorkspaceState } from "../workspace/git-sync";

/**
 * What is still missing for a finished card's work to reach its base branch, worked out from git.
 *
 * A task worktree is a detached HEAD: no branch belongs to the task, so a commit made there is
 * reachable only from that worktree, and moving the card to Done deletes it. Offering the next
 * step from the phone is what keeps that work from being lost on the way.
 *
 * Derived, never remembered. A step done any other way -- a typed "faz o merge", the board's
 * Commit button -- still counts, and nothing is stored that could fall out of step with the
 * repository.
 */

export type CardClosingStep = "integrate" | "push";

export interface CardClosingState {
	next: CardClosingStep | null;
	/** Commits in the worktree whose change is not in base, which Concluir would discard. */
	unintegratedCommits: number;
}

export interface CardClosingAction {
	id: "integrate" | "push" | "done";
	label: string;
	confirm?: string;
}

const NOTHING_PENDING: CardClosingState = { next: null, unintegratedCommits: 0 };

/** `git cherry` compares by patch, so a cherry-picked commit counts as integrated. */
async function countUnintegratedCommits(worktreePath: string, baseRef: string): Promise<number> {
	const result = await runGit(worktreePath, ["cherry", baseRef, "HEAD"]);
	if (!result.ok) {
		throw new Error(result.error ?? "git cherry failed");
	}
	return result.stdout.split("\n").filter((line) => line.startsWith("+")).length;
}

async function isBasePushPending(repoPath: string, baseRef: string): Promise<boolean> {
	const probe = await probeGitWorkspaceState(repoPath);
	// Only the branch someone is on: pushing a base nobody has checked out is not this button.
	return probe.currentBranch === baseRef && probe.upstreamBranch !== null && probe.aheadCount > 0;
}

export async function resolveCardClosingState(input: {
	worktreePath: string | null;
	repoPath: string;
	baseRef: string;
}): Promise<CardClosingState> {
	try {
		if (!input.worktreePath || !existsSync(input.worktreePath) || !input.baseRef) {
			return NOTHING_PENDING;
		}
		const worktree = await probeGitWorkspaceState(input.worktreePath);
		const unintegratedCommits = await countUnintegratedCommits(input.worktreePath, input.baseRef);
		if (worktree.changedFiles > 0 || unintegratedCommits > 0) {
			return { next: "integrate", unintegratedCommits };
		}
		return { next: (await isBasePushPending(input.repoPath, input.baseRef)) ? "push" : null, unintegratedCommits: 0 };
	} catch {
		// An accessory: a notification never fails over this, it just offers less.
		return NOTHING_PENDING;
	}
}

function describeDiscard(count: number): string {
	return count === 1
		? "1 commit não integrado será descartado."
		: `${count} commits não integrados serão descartados.`;
}

export function buildCardClosingActions(state: CardClosingState, baseRef: string): CardClosingAction[] {
	const actions: CardClosingAction[] = [];
	if (state.next === "integrate") {
		actions.push({ id: "integrate", label: `Integrar na ${baseRef}` });
	} else if (state.next === "push") {
		actions.push({ id: "push", label: "Push" });
	}
	actions.push(
		state.unintegratedCommits > 0
			? { id: "done", label: "Concluir", confirm: describeDiscard(state.unintegratedCommits) }
			: { id: "done", label: "Concluir" },
	);
	return actions;
}
```

Note: `runGit` returns `{ ok, stdout, error? }`. Check its exact `GitCommandResult` shape in `src/workspace/git-utils.ts` and adapt the field names if they differ.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npx vitest run test/runtime/card-closing-state.test.ts`
Expected: PASS (9 tests).

---

### Task 3: One commit prompt for the board and the CLI

**Files:**
- Create: `src/core/task-git-action-prompt.ts` (contents of `web-ui/src/git-actions/build-task-git-action-prompt.ts`, with the input changed from `workspaceInfo` to `baseRef`)
- Move test: `web-ui/src/git-actions/build-task-git-action-prompt.test.ts` → `test/runtime/task-git-action-prompt.test.ts`
- Delete: `web-ui/src/git-actions/build-task-git-action-prompt.ts`
- Modify: `web-ui/tsconfig.json` (`paths`), `web-ui/vite.config.ts` and `web-ui/vitest.config.ts` (`alias`), and the importers `web-ui/src/components/runtime-settings-dialog.tsx:40`, `web-ui/src/hooks/use-board-interactions.ts:6`, `web-ui/src/hooks/use-git-actions.ts:4`, `web-ui/src/hooks/use-review-auto-actions.ts:3`, `web-ui/src/hooks/use-review-auto-actions.test.tsx:4`

**Interfaces:**
- Produces: `export type TaskGitAction = "commit" | "pr"`, `TASK_GIT_BASE_REF_PROMPT_VARIABLE`, `TaskGitPromptTemplates`, and `export function buildTaskGitActionPrompt(input: { action: TaskGitAction; baseRef: string; templates?: TaskGitPromptTemplates | null }): string`.

- [ ] **Step 1: Move the test first and point it at the new module**

Run: `git mv web-ui/src/git-actions/build-task-git-action-prompt.test.ts test/runtime/task-git-action-prompt.test.ts`

Change its import to `from "../../src/core/task-git-action-prompt"`. Replace every `workspaceInfo: { …baseRef: "X"… }` argument with `baseRef: "X"`.

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run test/runtime/task-git-action-prompt.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Create the module**

Run `git mv web-ui/src/git-actions/build-task-git-action-prompt.ts src/core/task-git-action-prompt.ts`. Then, in the moved file:
- Replace `import type { RuntimeTaskAutoReviewMode, RuntimeTaskWorkspaceInfoResponse } from "@/runtime/types";` with `import type { RuntimeTaskAutoReviewMode } from "./api-contract";`.
- Change `BuildTaskGitActionPromptInput` to `{ action: TaskGitAction; baseRef: string; templates?: TaskGitPromptTemplates | null }`.
- In `buildTaskGitActionPrompt`, use `input.baseRef` in place of `input.workspaceInfo.baseRef`.

- [ ] **Step 4: Add the alias, following the existing `@runtime-task-title` entries**

- `web-ui/tsconfig.json` `paths`: `"@runtime-task-git-action-prompt": ["../src/core/task-git-action-prompt.ts"]`
- `web-ui/vite.config.ts` and `web-ui/vitest.config.ts` `alias`: `"@runtime-task-git-action-prompt": resolve(__dirname, "../src/core/task-git-action-prompt.ts")`

- [ ] **Step 5: Repoint the importers**

In the five files listed above, replace `"@/git-actions/build-task-git-action-prompt"` with `"@runtime-task-git-action-prompt"`. In `web-ui/src/hooks/use-git-actions.ts`, change the call to pass `baseRef: workspaceInfo.baseRef` in place of `workspaceInfo`.

- [ ] **Step 6: Verify**

Run: `npx vitest run test/runtime/task-git-action-prompt.test.ts && npm run typecheck && npm run web:typecheck && npm --prefix web-ui run test -- --run src/hooks`
Expected: all PASS. `rg "build-task-git-action-prompt" web-ui/src` returns nothing.

---

### Task 4: `kanban task integrate` and `kanban task push`

**Files:**
- Modify: `src/commands/task.ts` (`sendTaskInput` at ~713; the registrations after `input` at ~1494)
- Test: `test/runtime/task-input-writes.test.ts` (extend it), and `test/runtime/task-closing-commands.test.ts` (new)

**Interfaces:**
- Consumes: `buildTaskGitActionPrompt` (Task 3); `buildTaskInputWrites` (exists); `probeGitWorkspaceState` (`src/workspace/git-sync.ts`); `runtimeClient.runtime.getConfig.query()`, which returns `{ commitPromptTemplate, commitPromptTemplateDefault, … }`; `runtimeClient.workspace.runGitSyncAction.mutate({ action: "push" })`, which returns `RuntimeGitSyncResponse { ok, output, error? }`.
- Produces: the CLI commands `task integrate --task-id <id> [--project-path]` and `task push --task-id <id> [--project-path]`, both printing JSON `{ ok, taskId, workspacePath, … }` and exiting 1 on failure. Also `export function assertPushableBase(currentBranch: string | null, baseRef: string): void`, which throws when they differ.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { assertPushableBase } from "../../src/commands/task";

describe("assertPushableBase", () => {
	it("allows pushing the card's base when it is checked out", () => {
		expect(() => assertPushableBase("main", "main")).not.toThrow();
	});

	// Pushing whatever happens to be checked out would ship a branch the card never touched.
	it("refuses when the repository is on another branch", () => {
		expect(() => assertPushableBase("other", "main")).toThrow(/main/);
		expect(() => assertPushableBase(null, "main")).toThrow(/main/);
	});
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run test/runtime/task-closing-commands.test.ts`
Expected: FAIL, because `assertPushableBase` is not exported.

- [ ] **Step 3: Extract the delivery loop and add the commands**

In `src/commands/task.ts`, pull the loop out of `sendTaskInput` into a function the new command shares:

```ts
type RuntimeTrpcClient = ReturnType<typeof createRuntimeTrpcClient>;

/** Types text into a running session so that it is submitted, not just typed. */
async function deliverTaskInput(input: {
	runtimeClient: RuntimeTrpcClient;
	workspaceRepoPath: string;
	taskId: string;
	text: string;
}): Promise<void> {
	const runtimeState = await input.runtimeClient.workspace.getState.query();
	const session = runtimeState.sessions[input.taskId] ?? null;
	// Refused rather than queued: typing into a session that is not there would look like it
	// worked, and the answer would be lost somewhere between the board and the agent.
	if (!session || session.pid === null) {
		throw new Error(`Task "${input.taskId}" has no running session in workspace ${input.workspaceRepoPath}.`);
	}
	const writes = buildTaskInputWrites(session.agentId, input.text);
	for (const [index, write] of writes.entries()) {
		if (index > 0) {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, TASK_INPUT_SUBMIT_DELAY_MS);
			});
		}
		const result = await input.runtimeClient.runtime.sendTaskSessionInput.mutate({ taskId: input.taskId, ...write });
		if (!result.ok) {
			throw new Error(result.error ?? `Task "${input.taskId}" did not accept the input.`);
		}
	}
}
```

`sendTaskInput` then becomes resolve-workspace + `deliverTaskInput(...)` + return `{ ok: true, taskId, workspacePath }`. Move the `TASK_INPUT_SUBMIT_DELAY_MS` constant above `deliverTaskInput`.

Add the two commands next to it:

```ts
/**
 * Sends the project's commit prompt into the card, the same one the board's Commit button sends:
 * commit in the worktree, then bring it onto the card's base. The agent works it out, conflicts
 * included, and its conclusion comes back as the next review notification.
 */
async function integrateTask(input: { cwd: string; taskId: string; projectPath?: string }): Promise<JsonRecord> {
	const workspaceRepoPath = await resolveWorkspaceRepoPath(input.projectPath, input.cwd);
	const workspaceId = await ensureRuntimeWorkspace(workspaceRepoPath);
	const runtimeClient = createRuntimeTrpcClient(workspaceId);
	const state = await runtimeClient.workspace.getState.query();
	const record = findTaskRecord(state, input.taskId);
	if (!record) {
		throw new Error(`Task "${input.taskId}" was not found in workspace ${workspaceRepoPath}.`);
	}
	const config = await runtimeClient.runtime.getConfig.query();
	const prompt = buildTaskGitActionPrompt({
		action: "commit",
		baseRef: record.task.baseRef,
		templates: {
			commitPromptTemplate: config.commitPromptTemplate,
			commitPromptTemplateDefault: config.commitPromptTemplateDefault,
		},
	});
	await deliverTaskInput({ runtimeClient, workspaceRepoPath, taskId: input.taskId, text: prompt });
	return { ok: true, taskId: input.taskId, workspacePath: workspaceRepoPath, baseRef: record.task.baseRef };
}

export function assertPushableBase(currentBranch: string | null, baseRef: string): void {
	if (currentBranch !== baseRef) {
		throw new Error(
			`The repository is on ${currentBranch ?? "a detached HEAD"}, not ${baseRef}. Check out ${baseRef} to push it.`,
		);
	}
}

/** Pushes the card's base from the repository, as the board's push button does. No agent turn. */
async function pushTask(input: { cwd: string; taskId: string; projectPath?: string }): Promise<JsonRecord> {
	const workspaceRepoPath = await resolveWorkspaceRepoPath(input.projectPath, input.cwd);
	const workspaceId = await ensureRuntimeWorkspace(workspaceRepoPath);
	const runtimeClient = createRuntimeTrpcClient(workspaceId);
	const state = await runtimeClient.workspace.getState.query();
	const record = findTaskRecord(state, input.taskId);
	if (!record) {
		throw new Error(`Task "${input.taskId}" was not found in workspace ${workspaceRepoPath}.`);
	}
	const probe = await probeGitWorkspaceState(workspaceRepoPath);
	assertPushableBase(probe.currentBranch, record.task.baseRef);
	const result = await runtimeClient.workspace.runGitSyncAction.mutate({ action: "push" });
	if (!result.ok) {
		throw new Error(result.error ?? "Push failed.");
	}
	return { ok: true, taskId: input.taskId, workspacePath: workspaceRepoPath, output: result.output.trim() };
}
```

Add top-level imports: `import { buildTaskGitActionPrompt } from "../core/task-git-action-prompt";` and `import { probeGitWorkspaceState } from "../workspace/git-sync";`.

Register both after `task input`, with the same shape as `input`:

```ts
	task
		.command("integrate")
		.description("Send the project's commit prompt into a running task, to bring its work onto its base branch.")
		.requiredOption("--task-id <id>", "Task ID.")
		.option("--project-path <path>", "Workspace path. Defaults to current directory workspace.")
		.action(async (options: { taskId: string; projectPath?: string }) => {
			await runTaskCommand(
				async () => await integrateTask({ cwd: process.cwd(), taskId: options.taskId, projectPath: options.projectPath }),
			);
		});

	task
		.command("push")
		.description("Push the task's base branch from the repository.")
		.requiredOption("--task-id <id>", "Task ID.")
		.option("--project-path <path>", "Workspace path. Defaults to current directory workspace.")
		.action(async (options: { taskId: string; projectPath?: string }) => {
			await runTaskCommand(
				async () => await pushTask({ cwd: process.cwd(), taskId: options.taskId, projectPath: options.projectPath }),
			);
		});
```

Also add `"integrate"` and `"push"` wherever `src/cli.ts` or the man page (`man/kanban.1`) lists task subcommands. Find them with `rg -n '"input"' src/cli.ts man/kanban.1`.

- [ ] **Step 4: Verify**

Run: `npx vitest run test/runtime/task-closing-commands.test.ts test/runtime/task-input-writes.test.ts test/runtime/format-task-record.test.ts && npm run typecheck && npx biome check src/commands/task.ts`
Expected: PASS.

---

### Task 5: Review notifications carry closing actions

**Files:**
- Modify: `src/cline-sdk/cline-hub-notifier.ts`: `actions` on `ClineHubNotifyClient.sendNotify`, on `ReadyForReviewNotification`, and in `publish`
- Modify: `src/server/runtime-state-hub.ts`: `resolveCardIdentity` also returns `baseRef`. `notifyHubTaskReadyForReview` computes actions when the card is not awaiting. A new optional dep `resolveCardClosingState`.
- Test: `test/runtime/cline-sdk/cline-hub-notifier.test.ts`, `test/runtime/runtime-state-hub-notify.test.ts`

**Interfaces:**
- Consumes: `resolveCardClosingState`, `buildCardClosingActions`, `CardClosingAction` (Task 2).
- Produces: `ui.notify` payload field `actions?: CardClosingAction[]`, present only on a non-awaiting ready-for-review.

- [ ] **Step 1: Write the failing notifier test** (in `cline-hub-notifier.test.ts`, using the file's existing `createClineHubNotifier` setup pattern)

```ts
it("carries the closing actions so the card can be closed from the conversation", async () => {
	const sendNotify = vi.fn(async (_payload: Record<string, unknown>) => undefined);
	const notifier = createClineHubNotifier({
		isEnabled: async () => true,
		readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub", authToken: "tok" }),
		createClient: () => ({ connect: async () => undefined, sendNotify, dispose: async () => undefined }),
	});
	await notifier.notifyReadyForReview({
		taskId: "52609",
		taskTitle: "Ajuste os links",
		workspaceName: "work-os",
		actions: [{ id: "integrate", label: "Integrar na main" }, { id: "done", label: "Concluir" }],
	});
	expect(sendNotify.mock.calls[0]?.[0]).toMatchObject({
		actions: [{ id: "integrate", label: "Integrar na main" }, { id: "done", label: "Concluir" }],
	});
});
```

- [ ] **Step 2: Write the failing wiring test** (in `runtime-state-hub-notify.test.ts`)

Extend `harness()` so `createRuntimeStateHub` receives `resolveCardClosingState: async () => ({ next: "integrate", unintegratedCommits: 0 })`, and add `baseRef: "main"` to the snapshot card. Then add:

```ts
it("offers closing actions on a finished card, and none on a question", async () => {
	// Follow the existing tests: emit running, then awaiting_review with a final message.
	// Assert notifyReadyForReview got actions [{id:"integrate",label:"Integrar na main"},{id:"done",label:"Concluir"}].
	// Then emit a card awaiting an answer (no finalMessage, hookEventName "PermissionRequest")
	// and assert its notification has no `actions` (undefined).
});
```

Write it out fully with the file's existing `emit(summary({...}))` and `await vi.waitFor(...)` pattern. Read the neighbouring tests and copy their sequence.

- [ ] **Step 3: Run both and check that they fail**

Run: `npx vitest run test/runtime/cline-sdk/cline-hub-notifier.test.ts test/runtime/runtime-state-hub-notify.test.ts`
Expected: FAIL. `actions` is missing, and `resolveCardClosingState` is not a known dep (a type error at runtime is fine).

- [ ] **Step 4: Implement**

`cline-hub-notifier.ts`:
- Import `type { CardClosingAction } from "../server/card-closing-state"`.
- Add `actions?: CardClosingAction[];` to the `sendNotify` payload type, to the `publish` payload type, and to `ReadyForReviewNotification`. Document it as: "What the person can do to close the card from where they read this. Only on a card that is not asking."
- In `publish`, spread `...(payload.actions && payload.actions.length > 0 ? { actions: payload.actions } : {})`.
- In `notifyReadyForReview`, pass `actions: notification.actions`.

`runtime-state-hub.ts`:
- Add `resolveCardClosingState?: typeof resolveCardClosingState` to the deps type of `createRuntimeStateHub`, defaulting to the real one: `const resolveClosing = deps.resolveCardClosingState ?? resolveCardClosingState;`.
- `resolveCardIdentity` also returns `baseRef: card?.baseRef`.
- Give `notifyHubTaskReadyForReview` a `worktreePath: string | null` parameter. When `!awaitingAnswer && workspacePath && baseRef`, compute `const actions = buildCardClosingActions(await resolveClosing({ worktreePath, repoPath: workspacePath, baseRef }), baseRef)` and pass `actions`. The existing try/catch already keeps this silent.
- In `handleTaskSessionSummaryTransition`, pass `summary.workspacePath` as the worktree.

- [ ] **Step 5: Verify**

Run: `npx vitest run test/runtime && npm run typecheck && npx biome check src/server src/cline-sdk`
Expected: PASS.

---

### Task 6: The hub payload and the connector carry actions

**Repository:** `/Users/fsrezende/Documents/algorithm/cline`

**Files:**
- Modify: `sdk/packages/shared/src/hub.ts:1003-1036`
- Modify: `apps/cli/src/connectors/ui-notify-subscription.ts`: `NotifyDeliveryOptions` (55-72), `readNotification` (80-116), and the `deliver(...)` call (~150)
- Test: `apps/cli/src/connectors/ui-notify-subscription.test.ts`

**Interfaces:**
- Produces: `export interface HubUINotifyAction { id: "integrate" | "push" | "done"; label: string; confirm?: string }`; `HubUINotifyPayload.actions?: HubUINotifyAction[]`; `HubUINotifyPayload.column?: string`; `HubUINotifyPayload.updateOnly?: boolean`; `NotifyDeliveryOptions.actions?: HubUINotifyAction[]`.

- [ ] **Step 1: Write the failing test.** Follow the pattern of an existing test in `ui-notify-subscription.test.ts` that triggers `onNotify` and inspects `deliver`'s options.

```ts
it("passes closing actions through, and drops malformed ones", async () => {
	// trigger onNotify with:
	// { title: "Ready for review", body: "x", source: { workspacePath: "/repo", itemId: "52609" },
	//   actions: [{ id: "integrate", label: "Integrar na main" }, { id: "rm -rf", label: "x" }, { id: "done", label: "Concluir", confirm: "1 commit não integrado será descartado." }] }
	// expect deliver options.actions toEqual
	//   [{ id: "integrate", label: "Integrar na main" }, { id: "done", label: "Concluir", confirm: "1 commit não integrado será descartado." }]
});
```

Write it out fully using that file's harness. Read it first.

- [ ] **Step 2: Run it and check that it fails**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors/ui-notify-subscription.test.ts`
Expected: FAIL, because `actions` is undefined.

- [ ] **Step 3: Implement**

`hub.ts`, before `HubUINotifyPayload`:

```ts
/**
 * Something the person can do about the item from where they read the notification. The
 * subscriber renders it however its surface allows (Telegram: a button) and routes the choice
 * back to the publisher's own tooling. `confirm`, when present, is asked before acting.
 */
export interface HubUINotifyAction {
	id: "integrate" | "push" | "done";
	label: string;
	confirm?: string;
}
```

Add to `HubUINotifyPayload`:

```ts
	/** Column the item sits in, for a subscriber that keeps one message per item current. */
	column?: string;
	/** Update what is already shown, or do nothing. Never start a new conversation. */
	updateOnly?: boolean;
	/** What can be done about the item, offered only when it is not waiting on an answer. */
	actions?: HubUINotifyAction[];
```

`ui-notify-subscription.ts`:
- Import `type { HubUINotifyAction }` from the shared package, using the same specifier the file already imports hub types from.
- Add `actions?: HubUINotifyAction[]` to `NotifyDeliveryOptions`.
- Add a parser:

```ts
const NOTIFY_ACTION_IDS = new Set<HubUINotifyAction["id"]>(["integrate", "push", "done"]);

/** Only actions this connector knows how to route: anything else would be a button to nowhere. */
function readActions(value: unknown): HubUINotifyAction[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const actions = value.flatMap((entry): HubUINotifyAction[] => {
		if (!entry || typeof entry !== "object") {
			return [];
		}
		const { id, label, confirm } = entry as Record<string, unknown>;
		if (typeof id !== "string" || !NOTIFY_ACTION_IDS.has(id as HubUINotifyAction["id"])) {
			return [];
		}
		if (typeof label !== "string" || !label.trim()) {
			return [];
		}
		return [
			{
				id: id as HubUINotifyAction["id"],
				label: label.trim(),
				...(typeof confirm === "string" && confirm.trim() ? { confirm: confirm.trim() } : {}),
			},
		];
	});
	return actions.length > 0 ? actions : undefined;
}
```

- Add `actions: readActions(record.actions)` to `readNotification`'s return (and to its return type), and `actions: notification.actions` to the `deliver` options.

- [ ] **Step 4: Verify**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors && npx tsc --noEmit -p .`
Expected: PASS. If the shared package needs a build before `apps/cli` sees the new type, run the build the repo uses for it (check `sdk/packages/shared/package.json`).

---

### Task 7: Closing actions as buttons and commands

**Repository:** cline

**Files:**
- Create: `apps/cli/src/connectors/card-closing-actions.ts`
- Test: `apps/cli/src/connectors/card-closing-actions.test.ts`
- Modify: `apps/cli/src/connectors/telegram-card-reply.ts`. `CardReplyRequest` takes `buttons: ReadonlyArray<{ label: string; actionId: string }>` in place of `options` + `buildActionId`. `editTelegramCardMessage` gains an optional `buttons`.
- Modify: `apps/cli/src/connectors/card-question-message.ts`. `buildQuestionCard` takes `buttons` the same way. Add `buildQuestionButtons(taskId, options)`, which maps to `kbq` ids.
- Modify: `apps/cli/src/connectors/kanban-card-reply.ts`. Export a `runKanban(args)` default runner and `describeKanbanFailure`, and use them in `answerKanbanCard`. Add `actions?: HubUINotifyAction[]` to `TrackedCardMessage`.
- Update tests: `telegram-card-reply.test.ts`, `card-question-message.test.ts`, for the `buttons` shape.

**Interfaces:**
- Consumes: `HubUINotifyAction` (Task 6).
- Produces:
  ```ts
  export type ClosingActionId = "integrate" | "push" | "done" | "done!" | "cancel";
  export function buildClosingActionId(taskId: string, action: ClosingActionId): string; // "kba:<taskId>:<action>"
  export function parseClosingActionId(actionId: string | undefined): { taskId: string; action: ClosingActionId } | undefined;
  export function buildClosingButtons(taskId: string, actions: readonly HubUINotifyAction[]): Array<{ label: string; actionId: string }>;
  export function buildConfirmButtons(taskId: string): Array<{ label: string; actionId: string }>; // Concluir mesmo assim / Cancelar
  export function buildClosingCommandArgs(card: TrackedCardMessage, action: "integrate" | "push" | "done"): string[];
  export async function runClosingAction(card: TrackedCardMessage, action: "integrate" | "push" | "done", deps?: AnswerKanbanCardDependencies): Promise<CardReplyResult>;
  export function describeClosingOutcome(action: "integrate" | "push" | "done", baseLabel: string): string; // text the message is rewritten to
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";

import {
	buildClosingActionId,
	buildClosingButtons,
	buildClosingCommandArgs,
	buildConfirmButtons,
	describeClosingOutcome,
	parseClosingActionId,
	runClosingAction,
} from "./card-closing-actions";

const card = { taskId: "52609", projectPath: "/Users/me/work-os" };

describe("closing action ids", () => {
	it("round-trips every action, and stays well under Telegram's 64 bytes", () => {
		for (const action of ["integrate", "push", "done", "done!", "cancel"] as const) {
			const id = buildClosingActionId("52609", action);
			expect(parseClosingActionId(id)).toEqual({ taskId: "52609", action });
			expect(Buffer.byteLength(id)).toBeLessThan(64);
		}
	});

	it("ignores question buttons and anything malformed", () => {
		expect(parseClosingActionId("kbq:52609:1")).toBeUndefined();
		expect(parseClosingActionId("kba:52609:rm")).toBeUndefined();
		expect(parseClosingActionId("kba::done")).toBeUndefined();
		expect(parseClosingActionId(undefined)).toBeUndefined();
	});
});

describe("buildClosingButtons", () => {
	it("keeps the order and labels Kanban sent", () => {
		expect(
			buildClosingButtons("52609", [
				{ id: "integrate", label: "Integrar na main" },
				{ id: "done", label: "Concluir", confirm: "1 commit não integrado será descartado." },
			]),
		).toEqual([
			{ label: "Integrar na main", actionId: "kba:52609:integrate" },
			{ label: "Concluir", actionId: "kba:52609:done" },
		]);
	});

	it("asks with a confirmed Concluir and a Cancelar", () => {
		expect(buildConfirmButtons("52609")).toEqual([
			{ label: "Concluir mesmo assim", actionId: "kba:52609:done!" },
			{ label: "Cancelar", actionId: "kba:52609:cancel" },
		]);
	});
});

describe("buildClosingCommandArgs", () => {
	it("maps each action to its kanban command", () => {
		expect(buildClosingCommandArgs(card, "integrate")).toEqual([
			"task", "integrate", "--task-id", "52609", "--project-path", "/Users/me/work-os",
		]);
		expect(buildClosingCommandArgs(card, "push")[1]).toBe("push");
		expect(buildClosingCommandArgs(card, "done")[1]).toBe("done");
	});
});

describe("runClosingAction", () => {
	it("runs the command and reports the push output", async () => {
		const run = vi.fn(async () => ({ stdout: JSON.stringify({ ok: true, output: "main -> main" }) }));
		const result = await runClosingAction(card, "push", { run });
		expect(run).toHaveBeenCalledWith(buildClosingCommandArgs(card, "push"));
		expect(result).toEqual({ ok: true, message: "main -> main" });
	});

	it("explains a refusal in words", async () => {
		const run = vi.fn(async () => {
			throw Object.assign(new Error("exit 1"), { stderr: "The repository is on other, not main." });
		});
		const result = await runClosingAction(card, "push", { run });
		expect(result.ok).toBe(false);
		expect(result.message).toContain("not main");
	});
});

describe("describeClosingOutcome", () => {
	it("says what happened, in the message that held the buttons", () => {
		expect(describeClosingOutcome("integrate", "Integrar na main")).toBe("⏳ Integrar na main…");
		expect(describeClosingOutcome("push", "Push")).toBe("✅ Push feito");
		expect(describeClosingOutcome("done", "Concluir")).toBe("🟢 Concluído");
	});
});
```

- [ ] **Step 2: Run them and check that they fail**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors/card-closing-actions.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement `card-closing-actions.ts`**

```ts
import type { HubUINotifyAction } from "<same specifier ui-notify-subscription.ts uses for hub types>";

import {
	type AnswerKanbanCardDependencies,
	type CardReplyResult,
	describeKanbanFailure,
	runKanban,
	type TrackedCardMessage,
} from "./kanban-card-reply";

/**
 * Closing a finished card from the conversation: the step still missing to get its work onto its
 * base, and Concluir. Kanban decides which ones apply, from git; this only renders them and runs
 * the command each one names.
 *
 * A separate prefix from the question buttons (`kbq:`), because a tap here runs a command
 * rather than typing an answer into the card's session.
 */

const PREFIX = "kba";

export type ClosingActionId = "integrate" | "push" | "done" | "done!" | "cancel";

const CLOSING_ACTION_IDS = new Set<ClosingActionId>(["integrate", "push", "done", "done!", "cancel"]);

export interface ClosingButton {
	label: string;
	actionId: string;
}

export function buildClosingActionId(taskId: string, action: ClosingActionId): string {
	return `${PREFIX}:${taskId}:${action}`;
}

export function parseClosingActionId(
	actionId: string | undefined,
): { taskId: string; action: ClosingActionId } | undefined {
	const parts = actionId?.split(":");
	if (!parts || parts.length !== 3 || parts[0] !== PREFIX) {
		return undefined;
	}
	const taskId = parts[1]?.trim();
	const action = parts[2] as ClosingActionId;
	if (!taskId || !CLOSING_ACTION_IDS.has(action)) {
		return undefined;
	}
	return { taskId, action };
}

export function buildClosingButtons(taskId: string, actions: readonly HubUINotifyAction[]): ClosingButton[] {
	return actions.map((action) => ({ label: action.label, actionId: buildClosingActionId(taskId, action.id) }));
}

export function buildConfirmButtons(taskId: string): ClosingButton[] {
	return [
		{ label: "Concluir mesmo assim", actionId: buildClosingActionId(taskId, "done!") },
		{ label: "Cancelar", actionId: buildClosingActionId(taskId, "cancel") },
	];
}

export function buildClosingCommandArgs(card: TrackedCardMessage, action: "integrate" | "push" | "done"): string[] {
	return ["task", action, "--task-id", card.taskId, "--project-path", card.projectPath];
}

function readOutput(stdout: string): string | undefined {
	try {
		const parsed = JSON.parse(stdout) as { output?: unknown };
		return typeof parsed.output === "string" && parsed.output.trim() ? parsed.output.trim() : undefined;
	} catch {
		return undefined;
	}
}

export async function runClosingAction(
	card: TrackedCardMessage,
	action: "integrate" | "push" | "done",
	deps: AnswerKanbanCardDependencies = {},
): Promise<CardReplyResult> {
	const run = deps.run ?? runKanban;
	try {
		const { stdout } = await run(buildClosingCommandArgs(card, action));
		return { ok: true, message: readOutput(stdout) ?? "" };
	} catch (error) {
		return { ok: false, message: describeKanbanFailure(error) };
	}
}

export function describeClosingOutcome(action: "integrate" | "push" | "done", label: string): string {
	if (action === "integrate") {
		// The agent is doing it now; its conclusion arrives as the next review notice.
		return `⏳ ${label}…`;
	}
	return action === "push" ? "✅ Push feito" : "🟢 Concluído";
}
```

In `kanban-card-reply.ts`:
- Rename the inline default runner to an exported `export async function runKanban(args: string[]): Promise<{ stdout: string }>`.
- Rename `describeFailure` to an exported `describeKanbanFailure`.
- Use both in `answerKanbanCard`.
- Add `actions?: HubUINotifyAction[]` to `TrackedCardMessage`, documented as: "The closing actions this notification offered, kept so a tap can be confirmed after a restart."

Generic buttons:
- In `telegram-card-reply.ts`, replace `options` + `buildActionId` with `buttons: ReadonlyArray<{ label: string; actionId: string }>`. The keyboard becomes `request.buttons.map((b) => [{ text: b.label, callback_data: b.actionId }])`.
- Give `editTelegramCardMessage` an optional `buttons`. When it is non-empty, include `reply_markup: { inline_keyboard: … }`; otherwise keep today's behaviour, where no markup clears the keyboard.
- In `card-question-message.ts`, change `buildQuestionCard({ text, buttons })`. It renders `Button({ id: b.actionId, children: b.label })` and returns undefined for empty `buttons`. Add `export function buildQuestionButtons(taskId: string, options: readonly string[]): ClosingButton[]`, which returns `options.map((label, i) => ({ label, actionId: buildCardActionId(taskId, i + 1) }))`. Import the `ClosingButton` type from `card-closing-actions`.
- Update `telegram-card-reply.test.ts` and `card-question-message.test.ts` to the new shapes. The expected Telegram bodies do not change.

- [ ] **Step 4: Verify**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors && npx tsc --noEmit -p .`
Expected: PASS. `telegram.ts` will not compile until Task 8 updates its two call sites. If you need a green typecheck at the end of this task, make those two call-site changes now: pass `buttons: buildQuestionButtons(taskId, notifiedOptions)`.

---

### Task 8: Telegram renders closing actions and routes taps

**Repository:** cline

**Files:**
- Modify: `apps/cli/src/connectors/adapters/telegram.ts`. In `deliver` (~1046-1150), pick the buttons. In `rememberCardFor` (~949), persist `actions`. In `bot.onAction` (~1394), route `kba:`.
- Test: `apps/cli/src/connectors/card-closing-actions.test.ts` (routing helper)

**Interfaces:**
- Consumes: everything from Task 7, and `NotifyDeliveryOptions.actions` (Task 6).
- Produces: a pure decision function for the tap, `export function resolveClosingTap(card: TrackedCardMessage | undefined, tap: { taskId: string; action: ClosingActionId }): { kind: "unknown" } | { kind: "confirm"; text: string } | { kind: "run"; action: "integrate" | "push" | "done"; label: string } | { kind: "cancel" }`, added to `card-closing-actions.ts`.

- [ ] **Step 1: Write the failing tests for `resolveClosingTap`**

```ts
import { resolveClosingTap } from "./card-closing-actions";

describe("resolveClosingTap", () => {
	const remembered = {
		taskId: "52609",
		projectPath: "/w",
		actions: [
			{ id: "integrate" as const, label: "Integrar na main" },
			{ id: "done" as const, label: "Concluir", confirm: "1 commit não integrado será descartado." },
		],
	};

	// After a restart the message is still known from disk, so the action still runs.
	it("runs integrate from the remembered card", () => {
		expect(resolveClosingTap(remembered, { taskId: "52609", action: "integrate" })).toEqual({
			kind: "run", action: "integrate", label: "Integrar na main",
		});
	});

	it("asks before a Concluir that discards commits", () => {
		expect(resolveClosingTap(remembered, { taskId: "52609", action: "done" })).toEqual({
			kind: "confirm", text: "1 commit não integrado será descartado.",
		});
	});

	it("runs the confirmed Concluir", () => {
		expect(resolveClosingTap(remembered, { taskId: "52609", action: "done!" })).toEqual({
			kind: "run", action: "done", label: "Concluir",
		});
	});

	it("runs Concluir directly when nothing would be lost", () => {
		const clean = { ...remembered, actions: [{ id: "done" as const, label: "Concluir" }] };
		expect(resolveClosingTap(clean, { taskId: "52609", action: "done" })).toEqual({
			kind: "run", action: "done", label: "Concluir",
		});
	});

	it("refuses a button whose card it cannot place", () => {
		expect(resolveClosingTap(undefined, { taskId: "52609", action: "push" })).toEqual({ kind: "unknown" });
		expect(resolveClosingTap(remembered, { taskId: "other", action: "push" })).toEqual({ kind: "unknown" });
	});

	it("cancels", () => {
		expect(resolveClosingTap(remembered, { taskId: "52609", action: "cancel" })).toEqual({ kind: "cancel" });
	});
});
```

- [ ] **Step 2: Run them and check that they fail**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors/card-closing-actions.test.ts`
Expected: FAIL, because `resolveClosingTap` is not exported.

- [ ] **Step 3: Implement `resolveClosingTap` in `card-closing-actions.ts`**

```ts
export type ClosingTapDecision =
	| { kind: "unknown" }
	| { kind: "cancel" }
	| { kind: "confirm"; text: string }
	| { kind: "run"; action: "integrate" | "push" | "done"; label: string };

export function resolveClosingTap(
	card: TrackedCardMessage | undefined,
	tap: { taskId: string; action: ClosingActionId },
): ClosingTapDecision {
	if (!card || card.taskId !== tap.taskId) {
		return { kind: "unknown" };
	}
	if (tap.action === "cancel") {
		return { kind: "cancel" };
	}
	const action = tap.action === "done!" ? "done" : tap.action;
	const offered = card.actions?.find((entry) => entry.id === action);
	// Only a first tap on Concluir asks. The confirmed form is the answer to that question.
	if (tap.action === "done" && offered?.confirm) {
		return { kind: "confirm", text: offered.confirm };
	}
	return { kind: "run", action, label: offered?.label ?? (action === "done" ? "Concluir" : action) };
}
```

- [ ] **Step 4: Wire `deliver` in `telegram.ts`**

Where `notifiedOptions` is computed (~1052), work out the buttons once:

```ts
const closingActions = !options.awaitingAnswer && options.itemId ? (options.actions ?? []) : [];
const buttons = options.itemId
	? notifiedOptions.length > 0
		? buildQuestionButtons(options.itemId, notifiedOptions)
		: buildClosingButtons(options.itemId, closingActions)
	: [];
```

Then:
- Pass `buttons` to `postTelegramCardReply` (in place of `options`/`buildActionId`) and to `buildQuestionCard({ text: bodyText, buttons })`.
- Change both `questionMessages.set(...)` guards from `notifiedOptions.length > 0` to `buttons.length > 0`, so a closing message can be rewritten too.
- Pass `actions: closingActions` to both `rememberCardFor(...)` calls, and add `actions?: HubUINotifyAction[]` to `rememberCardFor`'s `entry` type.
- Skip the `supersedesPrevious` edit path. Closing actions only come on the review notice, which never supersedes.

- [ ] **Step 5: Route `kba:` in `bot.onAction`**

At the top of the existing handler, before `parseCardActionId`:

```ts
const closing = parseClosingActionId(event.actionId);
if (closing) {
	const thread = event.thread as Thread<TelegramThreadState> | null;
	if (!thread) {
		return;
	}
	const threadKey = resolveThreadBindingKey(thread);
	const card = findRememberedCard(
		readBindings<TelegramThreadState>(bindingsPath)[threadKey]?.cardMessages,
		event.messageId,
	);
	const decision = resolveClosingTap(card, closing);
	const shown = questionMessages.get(event.messageId);
	if (decision.kind === "unknown" || !card) {
		await thread.post({ raw: "I no longer know which card that button belongs to." });
		return;
	}
	if (decision.kind === "cancel") {
		// Back to the offer: drop the confirmation's buttons, keep the original message as it was.
		await shown?.edit(shown.text).catch(() => false);
		questionMessages.delete(event.messageId);
		return;
	}
	if (decision.kind === "confirm") {
		// Same message, now asking. The confirmed tap comes back on this message id, so the
		// remembered card still resolves it.
		const asked = `${shown?.text ?? ""}\n\n${decision.text}`.trim();
		await shown?.edit(asked, buildConfirmButtons(card.taskId)).catch(() => false);
		return;
	}
	const result = await runClosingAction(card, decision.action);
	if (result.ok) {
		await shown?.edit(`${shown.text}\n\n${describeClosingOutcome(decision.action, decision.label)}`).catch(() => false);
		questionMessages.delete(event.messageId);
		if (result.message) {
			await thread.post({ raw: result.message });
		}
	} else {
		// The buttons stay: a failed push or a refused integrate can be tried again.
		await thread.post({ raw: result.message });
	}
	loggerAdapter.core.log(result.ok ? "Telegram closing action ran" : "Telegram closing action refused", {
		...(result.ok ? {} : { severity: "warn" as const }),
		transport: "telegram",
		taskId: card.taskId,
		action: decision.action,
	});
	return;
}
```

This needs the `questionMessages` value's `edit` to accept an optional second `buttons` argument: `edit: (next: string, buttons?: ClosingButton[]) => Promise<boolean>`.
- On the raw-API path, forward it to `editTelegramCardMessage({ …, buttons })`.
- On the chat-lib path (`sent.edit`), pass `buttons` by building a card: `sent.edit(buttons?.length ? { card: buildQuestionCard({ text: next, buttons }), fallbackText: next } : { raw: next })`. Check the `SentMessage.edit` signature in the `chat` package's types under `node_modules/chat` before writing this.

Add top-level imports for `parseClosingActionId`, `resolveClosingTap`, `runClosingAction`, `buildClosingButtons`, `buildConfirmButtons`, `describeClosingOutcome`, `ClosingButton`, `buildQuestionButtons`, and `HubUINotifyAction`.

- [ ] **Step 6: Verify**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors && npx tsc --noEmit -p .`
Expected: PASS.

---

### Task 9: Live check

No code. This is how the work is shown to work.

- [ ] **Step 1: Rebuild and restart Kanban on 3484.** First confirm with the user, because a restart ends live terminal sessions:

```bash
cd /Users/fsrezende/Documents/algorithm/kanban && npm run build
kill -TERM $(lsof -tiTCP:3484 -sTCP:LISTEN)
cd ~/Documents/algorithm/partyshare && nohup kanban --no-open --port 3484 --skip-shutdown-cleanup > ~/.cline/kanban/kanban-3484.log 2>&1 & disown
```

- [ ] **Step 2: Restart the Telegram connector** so the cline source changes load. The connector runs from source through the `cline` shell function, so ask the user how they run it rather than guessing.

- [ ] **Step 3: In work-os, start a tiny card from Telegram** (e.g. `/task --start add a line to README`). Check, in order:
  - The review notice carries the agent's conclusion for *this* turn, plus [Integrar na main] · [Concluir].
  - Tapping Integrar rewrites the message to "⏳ Integrar na main…". The next notice carries the integration conclusion and [Push] · [Concluir].
  - Tapping Push posts the push output, and the message reads "✅ Push feito". **Only do this with the user's go-ahead: in work-os, Push is a Vercel deploy.**
  - Tapping Concluir rewrites to "🟢 Concluído", and the card is in Done on the board.
  - On a second card left with an unintegrated commit, Concluir asks first, and Cancelar returns to the offer.
