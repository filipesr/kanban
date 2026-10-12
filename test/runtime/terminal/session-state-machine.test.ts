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
