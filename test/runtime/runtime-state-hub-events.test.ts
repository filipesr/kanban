import { describe, expect, it, vi } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import type { RuntimeTaskEvent } from "../../src/core/task-events";
import { createRuntimeStateHub } from "../../src/server/runtime-state-hub";

function summary(patch: Partial<RuntimeTaskSessionSummary>): RuntimeTaskSessionSummary {
	return {
		taskId: "a",
		state: "idle",
		agentId: "claude",
		workspacePath: null,
		pid: null,
		startedAt: null,
		updatedAt: 0,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		...patch,
	};
}

/**
 * Hooks, terminal exits and the native Cline service all change a session by publishing a new
 * summary, and every summary goes through the hub -- which is why session events are logged there.
 */
describe("runtime state hub session events", () => {
	it("logs each change of session state once, and nothing for updates within a state", async () => {
		const recordTaskEvents = vi.fn<(workspaceId: string, events: RuntimeTaskEvent[]) => Promise<void>>(
			async () => undefined,
		);
		let emit: (summary: RuntimeTaskSessionSummary) => void = () => undefined;
		const hub = createRuntimeStateHub({
			hubNotifier: {
				notifyReadyForReview: async () => undefined,
				notifyCardProgress: async () => undefined,
				notifyCardMoved: async () => undefined,
				notifyQuestionAnswered: async () => undefined,
			},
			resolveCardClosingState: async () => ({ next: null, unintegratedCommits: 0 }),
			workspaceRegistry: {
				getWorkspacePathById: () => null,
				buildWorkspaceStateSnapshot: async () => ({ board: { columns: [] } }),
				resolveWorkspaceForStream: async () => null,
				buildProjectsPayload: async () => ({ currentProjectId: null, projects: [] }),
			} as never,
			recordTaskEvents,
		});
		hub.trackTerminalManager("project", {
			listSummaries: () => [summary({ state: "idle" })],
			onSummary: (listener: (s: RuntimeTaskSessionSummary) => void) => {
				emit = listener;
				return () => undefined;
			},
		} as never);

		emit(summary({ state: "running", updatedAt: 10 }));
		emit(summary({ state: "running", updatedAt: 20 }));
		emit(summary({ state: "awaiting_review", reviewReason: "hook", updatedAt: 30 }));

		const recorded = recordTaskEvents.mock.calls.map(([workspaceId, [event]]) =>
			event?.type === "session_state_changed" ? [workspaceId, event.from, event.to] : null,
		);
		expect(recorded).toEqual([
			["project", "idle", "running"],
			["project", "running", "awaiting_review"],
		]);
		await hub.close();
	});
});
