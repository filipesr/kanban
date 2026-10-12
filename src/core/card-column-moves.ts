import type { RuntimeBoardColumnId, RuntimeBoardData } from "./api-contract";

/**
 * Cards whose column changed between two versions of a board.
 *
 * A card moves for two different reasons, and only one of them already announces itself. A
 * session starting or reaching review emits its own notification; a person dragging the card
 * across the board emits nothing, so anything showing that card elsewhere -- a chat message
 * keeping one line per card -- goes stale the moment the board is touched by hand.
 *
 * Comparing the two boards is how a move is noticed at all: the board is saved whole, and
 * nothing in the saved state says what changed.
 */

export interface CardColumnMove {
	taskId: string;
	from: RuntimeBoardColumnId;
	to: RuntimeBoardColumnId;
}

function indexColumns(board: RuntimeBoardData): Map<string, RuntimeBoardColumnId> {
	const index = new Map<string, RuntimeBoardColumnId>();
	for (const column of board.columns) {
		for (const card of column.cards) {
			index.set(card.id, column.id);
		}
	}
	return index;
}

/**
 * Only cards present in both versions, and only where the column actually differs.
 *
 * A card that was just created has not moved -- its arrival is not a change of state, and
 * announcing one would put a message in a conversation for every card ever filed. A card that
 * was deleted has nowhere to have moved to.
 */
export function diffCardColumns(
	previous: RuntimeBoardData | undefined,
	next: RuntimeBoardData | undefined,
): CardColumnMove[] {
	if (!previous || !next) {
		return [];
	}
	const before = indexColumns(previous);
	const moves: CardColumnMove[] = [];
	for (const column of next.columns) {
		for (const card of column.cards) {
			const from = before.get(card.id);
			if (from && from !== column.id) {
				moves.push({ taskId: card.id, from, to: column.id });
			}
		}
	}
	return moves;
}
