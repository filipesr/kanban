import type { RuntimeBoardCard, RuntimeBoardColumnId } from "./api-contract";
import type { RuntimeTaskEvent } from "./task-events";

/**
 * Where a finished card went and when, for its history view. The event log knows; a card
 * finished before the log existed only knows when it was made and last touched.
 */

export interface TaskHistoryMovement {
	at: number;
	from: RuntimeBoardColumnId | null;
	to: RuntimeBoardColumnId;
}

export interface TaskHistoryTimeline {
	/** Oldest first. */
	movements: TaskHistoryMovement[];
	/** The first move into progress. */
	startedAt: number | null;
	/** The last move into Done: a card resumed from Done finishes again. */
	finishedAt: number | null;
	/** False when the card skipped review, and when that cannot be known. */
	reachedReview: boolean;
	fromEventLog: boolean;
}

export function buildTaskHistoryTimeline(events: RuntimeTaskEvent[], card: RuntimeBoardCard): TaskHistoryTimeline {
	const movements: TaskHistoryMovement[] = [];
	for (const event of events) {
		if (event.taskId !== card.id) {
			continue;
		}
		if (event.type === "card_created") {
			movements.push({ at: event.at, from: null, to: event.column });
		} else if (event.type === "card_moved") {
			movements.push({ at: event.at, from: event.from, to: event.to });
		}
	}

	if (movements.length === 0) {
		return {
			movements: [
				{ at: card.createdAt, from: null, to: "backlog" },
				{ at: card.updatedAt, from: null, to: "trash" },
			],
			startedAt: null,
			finishedAt: card.updatedAt,
			reachedReview: false,
			fromEventLog: false,
		};
	}

	movements.sort((first, second) => first.at - second.at);
	return {
		movements,
		startedAt: movements.find((movement) => movement.to === "in_progress")?.at ?? null,
		finishedAt: movements.filter((movement) => movement.to === "trash").at(-1)?.at ?? null,
		reachedReview: movements.some((movement) => movement.to === "review"),
		fromEventLog: true,
	};
}
