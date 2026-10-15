import { describe, expect, it } from "vitest";

import { listPeriodKeys, periodKeyOf, resolveTimeZone } from "../../../src/core/period-buckets";

describe("periodKeyOf", () => {
	it("cuts days in the viewer's zone, not UTC", () => {
		// 02:30 UTC on the 16th is still the 15th in São Paulo (UTC-3).
		const lateEvening = Date.UTC(2026, 9, 16, 2, 30);
		expect(periodKeyOf(lateEvening, "day", "America/Sao_Paulo")).toBe("2026-10-15");
		expect(periodKeyOf(lateEvening, "day", "UTC")).toBe("2026-10-16");
	});

	it("starts weeks on Monday, across a month and a year boundary", () => {
		// Sunday 2026-11-01 belongs to the week of Monday 2026-10-26.
		expect(periodKeyOf(Date.UTC(2026, 10, 1, 12), "week", "UTC")).toBe("2026-10-26");
		expect(periodKeyOf(Date.UTC(2026, 10, 2, 0), "week", "UTC")).toBe("2026-11-02");
		// Friday 2027-01-01 belongs to the week of Monday 2026-12-28.
		expect(periodKeyOf(Date.UTC(2027, 0, 1, 12), "week", "UTC")).toBe("2026-12-28");
	});

	it("names a month by its first day", () => {
		expect(periodKeyOf(Date.UTC(2026, 1, 28, 23), "month", "UTC")).toBe("2026-02-01");
	});

	it("keeps a day whole across a DST change", () => {
		// New York leaves DST on 2026-11-01; that day is 25 hours long.
		const keys = ["2026-11-01T04:30:00Z", "2026-11-02T04:30:00Z"].map((iso) =>
			periodKeyOf(Date.parse(iso), "day", "America/New_York"),
		);
		expect(keys).toEqual(["2026-11-01", "2026-11-01"]);
	});
});

describe("listPeriodKeys", () => {
	it("lists every period from the one holding `from` to the one holding `to`", () => {
		expect(listPeriodKeys(Date.UTC(2026, 9, 30), Date.UTC(2026, 10, 2), "day", "UTC")).toEqual([
			"2026-10-30",
			"2026-10-31",
			"2026-11-01",
			"2026-11-02",
		]);
		expect(listPeriodKeys(Date.UTC(2026, 10, 15), Date.UTC(2027, 1, 3), "month", "UTC")).toEqual([
			"2026-11-01",
			"2026-12-01",
			"2027-01-01",
			"2027-02-01",
		]);
		expect(listPeriodKeys(Date.UTC(2026, 9, 14), Date.UTC(2026, 9, 27), "week", "UTC")).toEqual([
			"2026-10-12",
			"2026-10-19",
			"2026-10-26",
		]);
	});
});

describe("resolveTimeZone", () => {
	it("falls back to UTC for a zone the runtime does not know", () => {
		expect(resolveTimeZone("Mars/Olympus_Mons")).toBe("UTC");
		expect(resolveTimeZone("Europe/Lisbon")).toBe("Europe/Lisbon");
	});
});
