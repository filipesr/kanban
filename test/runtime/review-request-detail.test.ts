import { describe, expect, it } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import {
	describeReviewRequest,
	isAwaitingAnswer,
	resolveReadyForReviewTitle,
} from "../../src/server/review-request-detail";
import { reduceSessionTransition } from "../../src/terminal/session-state-machine";

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

	// The conclusion is the agent's own markdown: its lists and paragraphs are what make it
	// readable on a phone. Flattened, "- **Hash:** … - **Mensagem:** …" became one run-on line.
	it("keeps the lines and lists of a conclusion", () => {
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({
					finalMessage:
						"O commit está feito.\n\n\n\n- **Hash:**   `189af67`\n  - **Conflitos:** nenhum  \n\nPronto.",
				}),
			}),
		);
		expect(detail).toBe("O commit está feito.\n\n- **Hash:** `189af67`\n  - **Conflitos:** nenhum\n\nPronto.");
	});

	// A question's text comes from the terminal, wrapped and padded by the TUI; there the line
	// breaks are noise.
	it("still collapses the newlines of a question read off the terminal", () => {
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({
					hookEventName: "PermissionRequest",
					activityText: "Waiting for approval:\n   Faço o push?",
				}),
			}),
		);
		expect(detail).toBe("Waiting for approval: Faço o push?");
	});

	it("clips a long answer at a word boundary", () => {
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({ finalMessage: `${"palavra ".repeat(400)}fim` }),
			}),
		);
		expect(detail?.endsWith("…")).toBe(true);
		expect((detail ?? "").length).toBeLessThanOrEqual(1501);
		expect(detail).not.toMatch(/\s…$/);
	});

	it("carries a conclusion of a usual length whole", () => {
		const conclusion = `${"Uma frase do agente. ".repeat(50)}Fim.`;
		const detail = describeReviewRequest(summary({ latestHookActivity: activity({ finalMessage: conclusion }) }));
		expect(detail).toBe(conclusion);
	});

	// Was `undefined`, and that is what hid the worst failure of this path: a card whose agent
	// stopped having done nothing announced "Ready for review" with an empty body, which reads
	// exactly like a finished card with a terse agent. Observed live -- no file, no transcript,
	// no session, and nothing in the notification to tell the difference.
	it("reports the silence of a card that recorded nothing", () => {
		expect(describeReviewRequest(summary())).toBe("Stopped without reporting anything.");
		// A finished agent whose last word was blank is the same silence.
		expect(
			describeReviewRequest(
				summary({ latestHookActivity: activity({ finalMessage: "   ", hookEventName: "Stop" }) }),
			),
		).toBe("Stopped without reporting anything.");
	});

	it("names the exit code when the runtime reported one", () => {
		expect(describeReviewRequest(summary({ exitCode: 1 }))).toBe("Stopped with exit 1 and reported nothing.");
	});

	// Exit zero is what a clean stop reports, so it adds nothing a reader can act on.
	it("does not dress up a clean exit as a failure", () => {
		expect(describeReviewRequest(summary({ exitCode: 0 }))).toBe("Stopped without reporting anything.");
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

describe("a card that is neither asking nor finished", () => {
	it("says nothing rather than replaying its last tool call", () => {
		// Seen in use: the second notice read "Completed AskUserQuestion: Deve gravar? — 1)
		// Gravar 2) Descartar", which is a question the person had already answered.
		expect(
			describeReviewRequest(
				summary({
					latestHookActivity: activity({
						hookEventName: "PostToolUse",
						toolName: "AskUserQuestion",
						activityText: "Completed AskUserQuestion: Deve gravar? — 1) Gravar 2) Descartar",
						finalMessage: null,
					}),
				}),
			),
		).toBeUndefined();
	});

	it("still says what it concluded when it concluded something", () => {
		expect(
			describeReviewRequest(
				summary({
					latestHookActivity: activity({
						hookEventName: "SubagentStop",
						activityText: "Final: feito",
						finalMessage: "feito",
					}),
				}),
			),
		).toBe("feito");
	});
});

describe("resolveReadyForReviewTitle", () => {
	it("says the card is waiting when it stopped to ask", () => {
		expect(resolveReadyForReviewTitle(true)).toBe("Waiting on your answer");
	});

	// A card that finished is genuinely ready for review; only the asking case was wrong.
	it("keeps the review headline for work that finished", () => {
		expect(resolveReadyForReviewTitle(false)).toBe("Ready for review");
		expect(resolveReadyForReviewTitle(undefined)).toBe("Ready for review");
	});
});

describe("the tool is named once", () => {
	// Reached a phone as "AskUserQuestion: Using AskUserQuestion: Gravar? — 1) Gravar 2)
	// Descartar": the tool named twice before the question it was asking.
	it("does not prefix a tool the text already names", () => {
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({
					toolName: "AskUserQuestion",
					activityText: "Using AskUserQuestion: Gravar? — 1) Gravar 2) Descartar",
					hookEventName: "Notification",
					notificationType: "permission_prompt",
				}),
			}),
		);
		expect(detail).toBe("Using AskUserQuestion: Gravar? — 1) Gravar 2) Descartar");
	});

	// Still named when the text does not: "may I run Bash" and "may I leave plan mode" are
	// different enough decisions that the answer depends on which one is being asked.
	it("still names a tool the text leaves out", () => {
		const detail = describeReviewRequest(
			summary({
				latestHookActivity: activity({
					toolName: "ExitPlanMode",
					activityText: "Plano pronto, posso seguir?",
					hookEventName: "Notification",
					notificationType: "permission_prompt",
				}),
			}),
		);
		expect(detail).toBe("ExitPlanMode: Plano pronto, posso seguir?");
	});
});

describe("a question asked in the turn after a conclusion", () => {
	// Both halves together: the state machine starting the turn, and the notice reading it.
	it("is announced as a question, with its own text", () => {
		const concluded = summary({
			latestHookActivity: activity({
				activityText: "Final: O merge está feito.",
				finalMessage: "O merge está feito.",
				hookEventName: "Stop",
			}),
		});
		const nextTurn = { ...concluded, ...reduceSessionTransition(concluded, { type: "hook.to_in_progress" }).patch };
		const asking = summary({
			latestHookActivity: activity({
				...nextTurn.latestHookActivity,
				activityText: "Waiting for approval: Faço o push? 1) Sim 2) Não",
				hookEventName: "PermissionRequest",
			}),
		});
		expect(isAwaitingAnswer(asking)).toBe(true);
		expect(describeReviewRequest(asking)).toContain("Faço o push?");
		expect(describeReviewRequest(asking)).not.toContain("O merge está feito");
	});
});
