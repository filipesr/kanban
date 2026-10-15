import { describe, expect, it } from "vitest";

import type { RuntimeBoardCard, RuntimeBoardData, RuntimeTaskSessionSummary } from "../../../src/core/api-contract";
import { createHomeAgentSessionId } from "../../../src/core/home-agent-session";
import { deriveSessionEvent, diffBoardEvents } from "../../../src/core/task-events";

function card(id: string, patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id,
		title: `Card ${id}`,
		prompt: `Prompt ${id}`,
		startInPlanMode: false,
		baseRef: "main",
		createdAt: 100,
		updatedAt: 100,
		...patch,
	};
}

function board(columns: Partial<Record<"backlog" | "in_progress" | "review" | "trash", RuntimeBoardCard[]>>) {
	return {
		columns: (["backlog", "in_progress", "review", "trash"] as const).map((id) => ({
			id,
			title: id,
			cards: columns[id] ?? [],
		})),
		dependencies: [],
	} satisfies RuntimeBoardData;
}

function summary(patch: Partial<RuntimeTaskSessionSummary>): RuntimeTaskSessionSummary {
	return {
		taskId: "a",
		state: "idle",
		agentId: "claude",
		workspacePath: null,
		pid: null,
		startedAt: null,
		updatedAt: 500,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		...patch,
	};
}

describe("diffBoardEvents", () => {
	it("reports a new card with its column and a snapshot of it", () => {
		const events = diffBoardEvents(
			board({}),
			board({ backlog: [card("a", { priority: "high", tags: ["ui"] })] }),
			1_000,
		);
		expect(events).toEqual([
			{
				type: "card_created",
				taskId: "a",
				at: 1_000,
				column: "backlog",
				card: { title: "Card a", createdAt: 100, agentId: null, priority: "high", tags: ["ui"] },
			},
		]);
	});

	it("reports a move with both columns and a deletion with the column it left", () => {
		const events = diffBoardEvents(
			board({ backlog: [card("a")], trash: [card("b")] }),
			board({ in_progress: [card("a")] }),
			2_000,
		);
		expect(events.map((event) => [event.type, event.taskId])).toEqual([
			["card_moved", "a"],
			["card_deleted", "b"],
		]);
		expect(events[0]).toMatchObject({ from: "backlog", to: "in_progress" });
		expect(events[1]).toMatchObject({ from: "trash", card: { title: "Card b" } });
	});

	it("reports nothing when only a card's content changed", () => {
		expect(
			diffBoardEvents(board({ review: [card("a")] }), board({ review: [card("a", { title: "Renamed" })] }), 1),
		).toEqual([]);
	});
});

describe("deriveSessionEvent", () => {
	it("reports a change of state, with the state it left", () => {
		expect(
			deriveSessionEvent(summary({ state: "running" }), summary({ state: "awaiting_review", reviewReason: "hook" })),
		).toEqual({
			type: "session_state_changed",
			taskId: "a",
			at: 500,
			from: "running",
			to: "awaiting_review",
			reviewReason: "hook",
			agentId: "claude",
		});
	});

	it("reports the first summary the runtime sees, from nothing", () => {
		expect(deriveSessionEvent(undefined, summary({ state: "running" }))).toMatchObject({ from: null, to: "running" });
	});

	it("ignores updates within the same state and the home agent's sessions", () => {
		expect(
			deriveSessionEvent(summary({ state: "running" }), summary({ state: "running", updatedAt: 900 })),
		).toBeNull();
		expect(
			deriveSessionEvent(undefined, summary({ taskId: createHomeAgentSessionId("ws", "claude"), state: "running" })),
		).toBeNull();
	});
});
