import { z } from "zod";
import {
	type RuntimeBoardCard,
	type RuntimeBoardColumnId,
	type RuntimeBoardData,
	type RuntimeTaskSessionSummary,
	runtimeAgentIdSchema,
	runtimeTaskPrioritySchema,
	runtimeTaskSessionReviewReasonSchema,
	runtimeTaskSessionStateSchema,
} from "./api-contract";
import { diffCardColumns } from "./card-column-moves";
import { isHomeAgentSessionId } from "./home-agent-session";

/**
 * What happened to a card, kept as a log because the board only says where a card is now.
 *
 * Statistics need the history the board throws away: when a card entered progress, how long it
 * sat in review, when it was finished -- and a finished card is eventually deleted with the
 * trash, taking even its creation date along. Each event therefore carries a small snapshot of
 * the card, so the log alone still describes cards that no longer exist.
 */

const columnIdSchema = z.enum(["backlog", "in_progress", "review", "trash"]);

export const runtimeTaskEventCardSnapshotSchema = z.object({
	title: z.string(),
	createdAt: z.number(),
	agentId: runtimeAgentIdSchema.nullable(),
	priority: runtimeTaskPrioritySchema.nullable(),
	tags: z.array(z.string()),
});
export type RuntimeTaskEventCardSnapshot = z.infer<typeof runtimeTaskEventCardSnapshotSchema>;

const eventBaseSchema = z.object({
	taskId: z.string(),
	at: z.number(),
});

export const runtimeTaskEventSchema = z.discriminatedUnion("type", [
	eventBaseSchema.extend({
		type: z.literal("card_created"),
		column: columnIdSchema,
		card: runtimeTaskEventCardSnapshotSchema,
	}),
	eventBaseSchema.extend({
		type: z.literal("card_moved"),
		from: columnIdSchema,
		to: columnIdSchema,
		card: runtimeTaskEventCardSnapshotSchema,
	}),
	eventBaseSchema.extend({
		type: z.literal("card_deleted"),
		from: columnIdSchema,
		card: runtimeTaskEventCardSnapshotSchema,
	}),
	eventBaseSchema.extend({
		type: z.literal("session_state_changed"),
		/** Null when the runtime had never seen a session for this card. */
		from: runtimeTaskSessionStateSchema.nullable(),
		to: runtimeTaskSessionStateSchema,
		reviewReason: runtimeTaskSessionReviewReasonSchema,
		agentId: runtimeAgentIdSchema.nullable(),
	}),
]);
export type RuntimeTaskEvent = z.infer<typeof runtimeTaskEventSchema>;
export type RuntimeTaskCardEvent = Exclude<RuntimeTaskEvent, { type: "session_state_changed" }>;

export function snapshotCard(card: RuntimeBoardCard): RuntimeTaskEventCardSnapshot {
	return {
		title: card.title ?? card.prompt,
		createdAt: card.createdAt,
		agentId: card.agentId ?? null,
		priority: card.priority ?? null,
		tags: card.tags ?? [],
	};
}

function indexCards(board: RuntimeBoardData): Map<string, { card: RuntimeBoardCard; column: RuntimeBoardColumnId }> {
	const index = new Map<string, { card: RuntimeBoardCard; column: RuntimeBoardColumnId }>();
	for (const column of board.columns) {
		for (const card of column.cards) {
			index.set(card.id, { card, column: column.id });
		}
	}
	return index;
}

/**
 * The card events between two versions of a board. Both board writers -- the UI's save and the
 * CLI's atomic mutation -- run this on the board before and after, so a card moved by hand and
 * one moved by `kanban task` leave the same trace.
 */
export function diffBoardEvents(
	previous: RuntimeBoardData,
	next: RuntimeBoardData,
	at: number,
): RuntimeTaskCardEvent[] {
	const before = indexCards(previous);
	const after = indexCards(next);
	const events: RuntimeTaskCardEvent[] = [];
	for (const [taskId, { card, column }] of after) {
		if (!before.has(taskId)) {
			events.push({ type: "card_created", taskId, at, column, card: snapshotCard(card) });
		}
	}
	for (const move of diffCardColumns(previous, next)) {
		const entry = after.get(move.taskId);
		if (entry) {
			events.push({
				type: "card_moved",
				taskId: move.taskId,
				at,
				from: move.from,
				to: move.to,
				card: snapshotCard(entry.card),
			});
		}
	}
	for (const [taskId, { card, column }] of before) {
		if (!after.has(taskId)) {
			events.push({ type: "card_deleted", taskId, at, from: column, card: snapshotCard(card) });
		}
	}
	return events;
}

/**
 * A session event when a card's session changed state, null otherwise. Most summary updates are
 * output or hook activity within the same state; only the state changes make a timeline.
 */
export function deriveSessionEvent(
	previous: RuntimeTaskSessionSummary | undefined,
	summary: RuntimeTaskSessionSummary,
): RuntimeTaskEvent | null {
	if (isHomeAgentSessionId(summary.taskId) || previous?.state === summary.state) {
		return null;
	}
	return {
		type: "session_state_changed",
		taskId: summary.taskId,
		at: summary.updatedAt,
		from: previous?.state ?? null,
		to: summary.state,
		reviewReason: summary.reviewReason,
		agentId: summary.agentId,
	};
}
