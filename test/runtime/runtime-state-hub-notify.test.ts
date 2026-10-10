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
		}) => Promise<void>
	>(async () => undefined);
	let emit: (summary: RuntimeTaskSessionSummary) => void = () => undefined;
	const hub = createRuntimeStateHub({
		hubNotifier: { notifyReadyForReview },
		workspaceRegistry: {
			getWorkspacePathById: () => REPO,
			buildWorkspaceStateSnapshot: async () => ({
				board: { columns: [{ id: "review", cards: [{ id: "461e5", title: "Cartão de teste" }] }] },
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
	return { notifyReadyForReview, emit: (s: RuntimeTaskSessionSummary) => emit(s) };
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
