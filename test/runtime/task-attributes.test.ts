import { describe, expect, it } from "vitest";

import {
	normalizeTaskCategory,
	normalizeTaskPriority,
	normalizeTaskTags,
	parseTaskPriorityOption,
	parseTaskTagList,
} from "../../src/core/task-attributes";

describe("normalizeTaskTags", () => {
	it("trims and drops the empties people leave behind", () => {
		expect(normalizeTaskTags([" infra ", "", "   ", "docs"])).toEqual(["infra", "docs"]);
	});

	it("treats different capitalizations as one tag, keeping the first spelling", () => {
		// Finding things only works if Infra and infra are one tag; showing someone their own
		// capitalization back is friendlier than flattening it.
		expect(normalizeTaskTags(["Infra", "infra", "INFRA"])).toEqual(["Infra"]);
	});

	it("returns nothing when there is nothing left after trimming", () => {
		expect(normalizeTaskTags(["  ", ""])).toBeUndefined();
		expect(normalizeTaskTags([])).toBeUndefined();
		expect(normalizeTaskTags(undefined)).toBeUndefined();
	});

	it("clips a tag long enough to be a sentence", () => {
		const tags = normalizeTaskTags(["x".repeat(200)]);
		expect(tags?.[0]).toHaveLength(32);
	});
});

describe("parseTaskTagList", () => {
	it("splits a comma list, with or without spaces", () => {
		expect(parseTaskTagList("infra,docs")).toEqual(["infra", "docs"]);
		expect(parseTaskTagList("infra, docs")).toEqual(["infra", "docs"]);
	});

	it("distinguishes an absent flag from an empty one", () => {
		// Absent means "leave it alone"; empty means "nothing to set".
		expect(parseTaskTagList(undefined)).toBeUndefined();
		expect(parseTaskTagList("")).toBeUndefined();
	});
});

describe("normalizeTaskCategory", () => {
	it("trims, and treats blank as absent", () => {
		expect(normalizeTaskCategory("  bug ")).toBe("bug");
		expect(normalizeTaskCategory("   ")).toBeUndefined();
		expect(normalizeTaskCategory(undefined)).toBeUndefined();
	});
});

describe("normalizeTaskPriority", () => {
	it("accepts the three levels, however they were typed", () => {
		expect(normalizeTaskPriority("HIGH")).toBe("high");
		expect(normalizeTaskPriority(" medium ")).toBe("medium");
		expect(normalizeTaskPriority("low")).toBe("low");
	});

	it("drops anything else instead of guessing", () => {
		// "urgent" probably means high, and probably is not good enough: a card silently filed
		// at the wrong priority is worse than one filed at none.
		expect(normalizeTaskPriority("urgent")).toBeUndefined();
		expect(normalizeTaskPriority("1")).toBeUndefined();
		expect(normalizeTaskPriority("")).toBeUndefined();
		expect(normalizeTaskPriority(undefined)).toBeUndefined();
	});
});

describe("parseTaskPriorityOption", () => {
	it("distinguishes leave alone, clear, and set", () => {
		expect(parseTaskPriorityOption(undefined)).toBeUndefined();
		expect(parseTaskPriorityOption("")).toBeNull();
		expect(parseTaskPriorityOption("  ")).toBeNull();
		expect(parseTaskPriorityOption("HIGH")).toBe("high");
	});

	it("refuses a typo instead of clearing what the card already had", () => {
		// Dropping "urgent" at this boundary would clear an existing "high": the person asked
		// for something, got nothing, and lost what was there. Live testing found exactly that.
		expect(() => parseTaskPriorityOption("urgent")).toThrow(/high \| medium \| low/);
	});
});
