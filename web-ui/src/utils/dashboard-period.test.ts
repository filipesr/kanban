import { describe, expect, it } from "vitest";

import { toDashboardChartRows } from "@/utils/dashboard-chart-rows";
import {
	coarsestUsefulGranularity,
	formatDuration,
	formatPercent,
	resolveDashboardRange,
} from "@/utils/dashboard-period";

const DAY = 86_400_000;

describe("resolveDashboardRange", () => {
	it("covers whole days ending with today, so a later change still falls inside", () => {
		const now = new Date(2026, 9, 15, 14, 30).getTime();
		const { from, to } = resolveDashboardRange("7d", now);
		expect(new Date(from)).toEqual(new Date(2026, 9, 9));
		expect(to).toBe(new Date(2026, 9, 16).getTime() - 1);
		expect(resolveDashboardRange("all", now).from).toBe(0);
	});
});

describe("coarsestUsefulGranularity", () => {
	it("groups long ranges coarser and keeps short ones as asked", () => {
		expect(coarsestUsefulGranularity("12m", "day")).toBe("week");
		expect(coarsestUsefulGranularity("all", "week")).toBe("month");
		expect(coarsestUsefulGranularity("30d", "day")).toBe("day");
	});
});

describe("formatDuration", () => {
	it("picks the unit that reads best", () => {
		expect(formatDuration(null)).toBe("—");
		expect(formatDuration(20_000)).toBe("<1m");
		expect(formatDuration(45 * 60_000)).toBe("45m");
		expect(formatDuration(90 * 60_000)).toBe("1h 30m");
		expect(formatDuration(3 * DAY + 2 * 3_600_000)).toBe("3d 2h");
	});
});

describe("formatPercent", () => {
	it("rounds, and shows a dash when there is nothing to divide", () => {
		expect(formatPercent(0.756)).toBe("76%");
		expect(formatPercent(null)).toBe("—");
	});
});

describe("toDashboardChartRows", () => {
	const empty = {
		created: 0,
		started: 0,
		reviewed: 0,
		completed: 0,
		commits: 0,
		filesChanged: 0,
		filesCreated: 0,
		additions: 0,
		deletions: 0,
		agentWorkMs: 0,
	};
	const buckets = [
		{ key: "1970-01-01", ...empty },
		{ key: "2026-09-01", ...empty, commits: 2 },
		{ key: "2026-10-01", ...empty },
	];

	it("drops the empty periods before the first activity only when asked", () => {
		expect(toDashboardChartRows(buckets, "month", { trimLeadingEmpty: true }).map((row) => row.key)).toEqual([
			"2026-09-01",
			"2026-10-01",
		]);
		expect(toDashboardChartRows(buckets, "month")).toHaveLength(3);
	});
});
