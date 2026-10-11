import { describe, expect, it } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import { describeReviewRequest } from "../../src/server/review-request-detail";

function activity(patch: Record<string, unknown> = {}) {
	return {
		activityText: null,
		toolName: null,
		toolInputSummary: null,
		finalMessage: null,
		hookEventName: null,
		notificationType: null,
		source: null,
		...patch,
	};
}

function summary(patch: Partial<RuntimeTaskSessionSummary> = {}): RuntimeTaskSessionSummary {
	return {
		taskId: "49084",
		state: "awaiting_review",
		agentId: "claude",
		workspacePath: "/code/app",
		pid: null,
		startedAt: 0,
		updatedAt: 0,
		lastOutputAt: null,
		reviewReason: "hook",
		exitCode: null,
		lastHookAt: 0,
		latestHookActivity: null,
		warningMessage: null,
		latestTurnCheckpoint: null,
		previousTurnCheckpoint: null,
		...patch,
	};
}

describe("describeReviewRequest", () => {
	it("carries what the agent said", () => {
		const detail = describeReviewRequest(
			summary({ latestHookActivity: activity({ finalMessage: "Terminei, falta o push." }) }),
		);
		expect(detail).toBe("Terminei, falta o push.");
	});

	it("names the tool on a permission prompt", () => {
		// "may I run Bash" and "may I leave plan mode" are different enough decisions that the
		// answer depends on which one is being asked.
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({
					notificationType: "permission_prompt",
					toolName: "ExitPlanMode",
					finalMessage: "Plano pronto, posso seguir?",
				}),
			}),
		);
		expect(detail).toBe("ExitPlanMode: Plano pronto, posso seguir?");
	});

	it("prefers the recorded warning when the card died", () => {
		// Nothing the agent said beats "it died and here is what was launched".
		const detail = describeReviewRequest(
			summary({
				warningMessage: "Agent session 49084 exited with code 1 without producing any output.",
				latestHookActivity: activity({ finalMessage: "oi" }),
			}),
		);
		expect(detail).toContain("exited with code 1");
	});

	it("collapses the newlines a terminal agent leaves behind", () => {
		const detail = describeReviewRequest(
			summary({ latestHookActivity: activity({ finalMessage: "linha um\n\n  linha dois" }) }),
		);
		expect(detail).toBe("linha um linha dois");
	});

	it("clips a long answer at a word boundary", () => {
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({ finalMessage: `${"palavra ".repeat(200)}fim` }),
			}),
		);
		expect(detail?.endsWith("…")).toBe(true);
		expect((detail ?? "").length).toBeLessThanOrEqual(601);
		expect(detail).not.toMatch(/\s…$/);
	});

	it("says nothing when the card said nothing", () => {
		expect(describeReviewRequest(summary())).toBeUndefined();
		expect(describeReviewRequest(summary({ latestHookActivity: activity({ finalMessage: "   " }) }))).toBeUndefined();
	});
});
