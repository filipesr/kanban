import { describe, expect, it } from "vitest";

import { formatColumnName, formatHistoryDuration } from "@/components/detail-panels/done-card-history-format";

describe("formatHistoryDuration", () => {
	it("speaks in minutes and hours", () => {
		expect(formatHistoryDuration(50 * 60_000)).toBe("50 min");
		expect(formatHistoryDuration(125 * 60_000)).toBe("2 h 5 min");
		expect(formatHistoryDuration(120 * 60_000)).toBe("2 h");
		expect(formatHistoryDuration(20_000)).toBe("< 1 min");
	});
});

describe("formatColumnName", () => {
	it("names Done the way the board does", () => {
		expect(formatColumnName("in_progress")).toBe("In progress");
		expect(formatColumnName("trash")).toBe("Done");
	});
});
