import { describe, expect, it } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import { describeReviewRequest, isAwaitingAnswer } from "../../src/server/review-request-detail";

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
					hookEventName: "Notification",
					toolName: "ExitPlanMode",
					activityText: "Plano pronto, posso seguir?",
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

describe("isAwaitingAnswer", () => {
	it("is true while a permission prompt is open", () => {
		expect(
			isAwaitingAnswer(
				summary({
					latestHookActivity: activity({
						notificationType: "permission_prompt",
						hookEventName: "Notification",
					}),
				}),
			),
		).toBe(true);
	});

	it("is false once the tool completed, however stale the notification type is", () => {
		// Measured: notificationType sticks at "permission_prompt" long after the answer, while
		// the hook event moves on. Trusting it meant offering buttons for a question already
		// answered, and the person saw the same question twice.
		for (const event of ["PostToolUse", "PostToolUseFailure", "SubagentStop", "Stop"]) {
			expect(
				isAwaitingAnswer(
					summary({
						latestHookActivity: activity({
							notificationType: "permission_prompt",
							hookEventName: event,
						}),
					}),
				),
			).toBe(false);
		}
	});

	it("is false once the agent has said its final word", () => {
		// Measured across a dozen cards: every one still waiting had no final message, and
		// every one that had answered carried the text it ended with. That is the only field
		// tracking reality -- notificationType was null on a prompt that arrived through
		// PreToolUse and still "permission_prompt" long after the answer.
		expect(
			isAwaitingAnswer(
				summary({
					latestHookActivity: activity({
						notificationType: "permission_prompt",
						hookEventName: "Notification",
						activityText: "Final: descartado",
						finalMessage: "descartado",
					}),
				}),
			),
		).toBe(false);
	});

	it("is true for a prompt that arrived with no notification type at all", () => {
		// The question asked through PreToolUse carries none, and requiring one was why no
		// question was ever marked as waiting.
		expect(
			isAwaitingAnswer(
				summary({
					latestHookActivity: activity({
						hookEventName: "PreToolUse",
						toolName: "AskUserQuestion",
						activityText: "Using AskUserQuestion: Devo gravar? — 1) Sim 2) Não",
					}),
				}),
			),
		).toBe(true);
	});

	it("is false when there is no activity to judge", () => {
		expect(isAwaitingAnswer(summary())).toBe(false);
	});
});

describe("what a card says after it answered", () => {
	it("reports what it did instead of replaying the question", () => {
		// "Devo gravar? 1) Gravar 2) Descartar" after the answer reads like a second ask.
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({
					notificationType: "permission_prompt",
					hookEventName: "SubagentStop",
					toolName: "AskUserQuestion",
					activityText: "Completed AskUserQuestion: Devo gravar? — 1) Gravar 2) Descartar",
					finalMessage: "descartado",
				}),
			}),
		);
		expect(detail).toBe("descartado");
	});
});
