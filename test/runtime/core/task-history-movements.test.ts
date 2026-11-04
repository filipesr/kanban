import { describe, expect, it } from "vitest";

import type { RuntimeBoardCard, RuntimeBoardColumnId } from "../../../src/core/api-contract";
import type { RuntimeTaskEvent, RuntimeTaskEventCardSnapshot } from "../../../src/core/task-events";
import { buildTaskHistoryTimeline } from "../../../src/core/task-history-movements";

const SNAPSHOT: RuntimeTaskEventCardSnapshot = {
	title: "Card",
	createdAt: 1,
	agentId: "claude",
	priority: null,
	tags: [],
};

function card(patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id: "task-1",
		prompt: "Do the thing",
		startInPlanMode: false,
		baseRef: "main",
		createdAt: 10,
		updatedAt: 20,
		...patch,
	} as RuntimeBoardCard;
}

function created(at: number, column: RuntimeBoardColumnId = "backlog", taskId = "task-1"): RuntimeTaskEvent {
	return { type: "card_created", taskId, at, column, card: SNAPSHOT };
}

function moved(at: number, from: RuntimeBoardColumnId, to: RuntimeBoardColumnId, taskId = "task-1"): RuntimeTaskEvent {
	return { type: "card_moved", taskId, at, from, to, card: SNAPSHOT };
}

describe("buildTaskHistoryTimeline", () => {
	it("lists a card's creation and moves oldest first, ignoring other cards", () => {
		const timeline = buildTaskHistoryTimeline(
			[
				created(1),
				moved(2, "backlog", "in_progress"),
				moved(3, "backlog", "in_progress", "task-2"),
				moved(4, "in_progress", "review"),
				{
					type: "session_state_changed",
					taskId: "task-1",
					at: 4,
					from: "running",
					to: "awaiting_review",
					reviewReason: "hook",
					agentId: "claude",
				},
				moved(5, "review", "trash"),
			],
			card(),
		);

		expect(timeline).toEqual({
			movements: [
				{ at: 1, from: null, to: "backlog" },
				{ at: 2, from: "backlog", to: "in_progress" },
				{ at: 4, from: "in_progress", to: "review" },
				{ at: 5, from: "review", to: "trash" },
			],
			startedAt: 2,
			finishedAt: 5,
			reachedReview: true,
			fromEventLog: true,
		});
	});

	it("times a card resumed from done from its first start to its last finish", () => {
		const timeline = buildTaskHistoryTimeline(
			[
				moved(2, "backlog", "in_progress"),
				moved(4, "in_progress", "review"),
				moved(5, "review", "trash"),
				moved(6, "trash", "review"),
				moved(9, "review", "trash"),
			],
			card(),
		);

		expect(timeline.startedAt).toBe(2);
		expect(timeline.finishedAt).toBe(9);
	});

	it("marks a card that went to done without review", () => {
		const timeline = buildTaskHistoryTimeline(
			[moved(2, "backlog", "in_progress"), moved(3, "in_progress", "trash")],
			card(),
		);

		expect(timeline.reachedReview).toBe(false);
	});

	it("falls back to the card's own dates when the log has nothing", () => {
		const timeline = buildTaskHistoryTimeline(
			[
				{ type: "card_deleted", taskId: "task-1", at: 30, from: "trash", card: SNAPSHOT },
				moved(3, "backlog", "in_progress", "task-2"),
			],
			card({ createdAt: 10, updatedAt: 20 }),
		);

		expect(timeline).toEqual({
			movements: [
				{ at: 10, from: null, to: "backlog" },
				{ at: 20, from: null, to: "trash" },
			],
			startedAt: null,
			finishedAt: 20,
			reachedReview: false,
			fromEventLog: false,
		});
	});
});
