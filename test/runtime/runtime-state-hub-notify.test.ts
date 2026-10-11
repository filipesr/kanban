import { describe, expect, it, vi } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import { createRuntimeStateHub } from "../../src/server/runtime-state-hub";

/**
 * The wiring between "a card entered review" and "the hub was told" had no coverage: the
 * decision function and the notifier were each tested alone, and two defects lived in the gap
 * between them. Both are pinned here.
 */

const REPO = "/code/partyshare";
const WORKTREE = "/home/me/.cline/worktrees/461e5/partyshare";

function summary(patch: Partial<RuntimeTaskSessionSummary>): RuntimeTaskSessionSummary {
	return {
		taskId: "461e5",
		state: "idle",
		agentId: "claude",
		workspacePath: WORKTREE,
		pid: null,
		startedAt: null,
		updatedAt: 0,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		warningMessage: null,
		latestTurnCheckpoint: null,
		previousTurnCheckpoint: null,
		...patch,
	};
}

function harness() {
	const notifyReadyForReview = vi.fn<
		(notification: {
			taskId: string;
			taskTitle: string;
			workspaceName: string;
			workspacePath?: string;
			detail?: string;
			priority?: string;
			awaitingAnswer?: boolean;
		}) => Promise<void>
	>(async () => undefined);
	const notifyCardProgress = vi.fn<
		(notification: {
			taskId: string;
			taskTitle: string;
			workspaceName: string;
			workspacePath?: string;
			activity: string;
		}) => Promise<void>
	>(async () => undefined);
	let emit: (summary: RuntimeTaskSessionSummary) => void = () => undefined;
	const hub = createRuntimeStateHub({
		hubNotifier: { notifyReadyForReview, notifyCardProgress },
		workspaceRegistry: {
			getWorkspacePathById: () => REPO,
			buildWorkspaceStateSnapshot: async () => ({
				board: {
					columns: [
						{
							id: "review",
							cards: [{ id: "461e5", title: "Cartão de teste", priority: "high" }],
						},
					],
				},
			}),
			resolveWorkspaceForStream: async () => null,
			buildProjectsPayload: async () => ({ currentProjectId: null, projects: [] }),
		} as never,
	});
	const manager = {
		listSummaries: () => [],
		onSummary: (listener: (s: RuntimeTaskSessionSummary) => void) => {
			emit = listener;
			return () => undefined;
		},
	} as never;
	hub.trackTerminalManager("partyshare", manager);
	return {
		notifyReadyForReview,
		notifyCardProgress,
		emit: (s: RuntimeTaskSessionSummary) => emit(s),
	};
}

describe("ready-for-review notification from a terminal agent", () => {
	it("notifies the hub when a terminal-agent card enters review", async () => {
		// The notification block used to exist only on the Cline SDK path. Cards running a
		// terminal agent -- the default for `agentId: "claude"` -- went to review in silence,
		// so the feature could never fire for anyone using that agent.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
	});

	it("announces the repository path, not the throwaway worktree", async () => {
		// A card runs in a worktree under ~/.cline/worktrees. No browser tab and no chat
		// conversation is bound to a worktree, so a notification carrying that path is
		// addressed to nowhere and silently reaches no one.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		const sent = h.notifyReadyForReview.mock.calls[0]?.[0];
		expect(sent?.workspacePath).toBe(REPO);
		expect(sent?.workspacePath).not.toBe(WORKTREE);
	});

	it("stays silent when the card was merely interrupted", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "interrupted", exitCode: 143 }));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(h.notifyReadyForReview).not.toHaveBeenCalled();
	});

	it("does not re-notify while the card stays in review", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1);
	});
});

describe("a running card saying what it is doing", () => {
	it("reports the tool, carrying the repository path like the review notice does", async () => {
		const h = harness();
		h.emit(summary({ state: "idle" }));
		h.emit(
			summary({
				state: "running",
				latestHookActivity: {
					activityText: null,
					toolName: "Bash",
					toolInputSummary: null,
					finalMessage: null,
					hookEventName: null,
					notificationType: null,
					source: null,
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyCardProgress).toHaveBeenCalledTimes(1));
		const sent = h.notifyCardProgress.mock.calls[0]?.[0];
		expect(sent?.activity).toBe("Running · Bash");
		expect(sent?.workspacePath).toBe(REPO);
	});

	it("does not report progress for a card entering review", async () => {
		// That notification asks the person for something, so it must not be folded into a
		// status line that quietly replaces itself.
		const h = harness();
		h.emit(summary({ state: "running" }));
		// Wait for the running line to land before clearing: the publish is fired and not
		// awaited, so clearing too early would count it against the next emit.
		await vi.waitFor(() => expect(h.notifyCardProgress).toHaveBeenCalledTimes(1));
		h.notifyCardProgress.mockClear();

		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		expect(h.notifyCardProgress).not.toHaveBeenCalled();
	});
});

describe("what the review notice tells someone away from the board", () => {
	it("carries the question the card is asking", async () => {
		// Without it the notice can only send them to the board, which is where they were not.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(
			summary({
				state: "awaiting_review",
				reviewReason: "hook",
				latestHookActivity: {
					activityText: "Plano pronto, posso seguir?",
					toolName: "ExitPlanMode",
					toolInputSummary: null,
					finalMessage: null,
					hookEventName: "Notification",
					notificationType: "permission_prompt",
					source: "claude",
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.detail).toBe("ExitPlanMode: Plano pronto, posso seguir?");
	});

	it("still notifies when the card said nothing", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.detail).toBeUndefined();
	});
});

describe("what the hub actually hands the notifier", () => {
	it("carries the card's priority and whether it is waiting", async () => {
		// These travelled as far as the function signature and no further: the call site was
		// never updated, so both were accepted and dropped. A test on the notifier alone could
		// not see it, because it called the notifier directly and skipped the hub.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(
			summary({
				state: "awaiting_review",
				reviewReason: "hook",
				latestHookActivity: {
					activityText: "Waiting for approval",
					toolName: "AskUserQuestion",
					toolInputSummary: null,
					finalMessage: null,
					hookEventName: "Notification",
					notificationType: "permission_prompt",
					source: "claude",
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());

		const sent = h.notifyReadyForReview.mock.calls[0]?.[0];
		expect(sent?.priority).toBe("high");
		expect(sent?.awaitingAnswer).toBe(true);
	});

	it("says it is not waiting once the tool completed", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(
			summary({
				state: "awaiting_review",
				reviewReason: "hook",
				latestHookActivity: {
					activityText: "Completed AskUserQuestion: Devo gravar? — 1) Gravar 2) Descartar",
					toolName: "AskUserQuestion",
					toolInputSummary: null,
					finalMessage: "descartado",
					hookEventName: "SubagentStop",
					notificationType: "permission_prompt",
					source: "claude",
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());

		const sent = h.notifyReadyForReview.mock.calls[0]?.[0];
		expect(sent?.awaitingAnswer).toBe(false);
		expect(sent?.detail).toBe("descartado");
	});
});
