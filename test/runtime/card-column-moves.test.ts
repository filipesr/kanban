import { describe, expect, it } from "vitest";
import type { RuntimeBoardData } from "../../src/core/api-contract";
import { diffCardColumns } from "../../src/core/card-column-moves";

function board(placement: Record<string, string[]>): RuntimeBoardData {
	const columns = ["backlog", "in_progress", "review", "done", "trash"].map((id) => ({
		id,
		title: id,
		cards: (placement[id] ?? []).map((cardId) => ({
			id: cardId,
			prompt: "p",
			baseRef: "main",
			startInPlanMode: false,
			createdAt: 1,
			updatedAt: 1,
		})),
	}));
	return { columns, dependencies: [] } as unknown as RuntimeBoardData;
}

describe("diffCardColumns", () => {
	it("notices a card dragged to another column", () => {
		expect(diffCardColumns(board({ backlog: ["a3ae5"] }), board({ review: ["a3ae5"] }))).toEqual([
			{ taskId: "a3ae5", from: "backlog", to: "review" },
		]);
	});

	it("says nothing when the board is saved unchanged", () => {
		const same = board({ backlog: ["a3ae5"], review: ["b1c2d"] });
		expect(diffCardColumns(same, same)).toEqual([]);
	});

	// A card's arrival is not a change of state. Announcing one would put a message in the
	// conversation for every card ever filed, which is the opposite of what this is for.
	it("does not treat a new card as a move", () => {
		expect(diffCardColumns(board({}), board({ backlog: ["a3ae5"] }))).toEqual([]);
	});

	it("does not treat a deleted card as a move", () => {
		expect(diffCardColumns(board({ backlog: ["a3ae5"] }), board({}))).toEqual([]);
	});

	it("reports every card that moved, not only the first", () => {
		const moves = diffCardColumns(
			board({ backlog: ["a3ae5", "b1c2d"] }),
			board({ review: ["a3ae5"], done: ["b1c2d"] }),
		);
		expect(moves).toEqual([
			{ taskId: "a3ae5", from: "backlog", to: "review" },
			{ taskId: "b1c2d", from: "backlog", to: "done" },
		]);
	});

	// A board saved for the first time has nothing to compare against.
	it("says nothing without a previous board", () => {
		expect(diffCardColumns(undefined, board({ backlog: ["a3ae5"] }))).toEqual([]);
	});
});
