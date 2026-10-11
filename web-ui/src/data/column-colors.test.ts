import { describe, expect, it } from "vitest";

import { columnIndicatorColors } from "@/data/column-colors";

describe("columnIndicatorColors", () => {
	it("reads as a progression: waiting, working, needing you, finished", () => {
		expect(columnIndicatorColors).toEqual({
			backlog: "var(--color-text-tertiary)",
			in_progress: "var(--color-status-blue)",
			review: "var(--color-status-orange)",
			trash: "var(--color-status-green)",
		});
	});

	it("does not paint done as a failure", () => {
		// It was red, which is the colour this board uses for things that went wrong -- on the
		// one column that means the opposite.
		expect(columnIndicatorColors.trash).not.toContain("red");
	});

	it("covers every column the board has", () => {
		for (const column of ["backlog", "in_progress", "review", "trash"]) {
			expect(columnIndicatorColors[column]).toBeTruthy();
		}
	});
});
