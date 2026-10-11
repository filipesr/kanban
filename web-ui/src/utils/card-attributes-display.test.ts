import { describe, expect, it } from "vitest";

import {
	formatCardDate,
	hasCardAttributes,
	resolvePriorityTone,
	resolveSourceKind,
	resolveTagTone,
	resolveVisibleTags,
} from "@/utils/card-attributes-display";

describe("resolveVisibleTags", () => {
	it("shows a handful and counts the rest", () => {
		// A card already carries a title, a prompt, its agent and its state. Tags past a few
		// would crowd out what the card is actually about.
		expect(resolveVisibleTags(["a", "b", "c", "d", "e"])).toEqual({
			shown: ["a", "b", "c"],
			overflow: 2,
		});
	});

	it("counts nothing when they all fit", () => {
		expect(resolveVisibleTags(["a", "b"])).toEqual({ shown: ["a", "b"], overflow: 0 });
	});

	it("ignores blanks rather than rendering an empty chip", () => {
		expect(resolveVisibleTags(["a", "   ", "b"])).toEqual({ shown: ["a", "b"], overflow: 0 });
	});

	it("handles a card with no tags at all", () => {
		expect(resolveVisibleTags(undefined)).toEqual({ shown: [], overflow: 0 });
	});
});

describe("resolvePriorityTone", () => {
	it("colours only the urgent one", () => {
		// Colouring every card would make the colour mean nothing; the point is that an urgent
		// card stands out from the ones around it.
		expect(resolvePriorityTone("high")).toBe("urgent");
		expect(resolvePriorityTone("medium")).toBe("muted");
		expect(resolvePriorityTone("low")).toBe("muted");
	});

	it("shows nothing when the card has no priority", () => {
		expect(resolvePriorityTone(undefined)).toBeUndefined();
	});
});

describe("hasCardAttributes", () => {
	it("is false for a card that carries none", () => {
		expect(hasCardAttributes({})).toBe(false);
		expect(hasCardAttributes({ tags: [], category: "  " })).toBe(false);
	});

	it("is true as soon as one is set", () => {
		expect(hasCardAttributes({ tags: ["infra"] })).toBe(true);
		expect(hasCardAttributes({ category: "bug" })).toBe(true);
		expect(hasCardAttributes({ priority: "low" })).toBe(true);
	});
});

describe("resolveTagTone", () => {
	it("gives the same tag the same colour every time", () => {
		// That stability is the whole point: a column is scannable by colour only if "infra" is
		// always the same colour.
		expect(resolveTagTone("infra")).toBe(resolveTagTone("infra"));
	});

	it("ignores case and surrounding space", () => {
		expect(resolveTagTone("  Infra ")).toBe(resolveTagTone("infra"));
	});

	it("spreads across the palette instead of favouring one colour", () => {
		// Two tags sharing a colour is inherent to a six-colour palette and is fine. What would
		// not be fine is a function that always answers the same thing, which is what a broken
		// hash looks like from the outside.
		const tones = new Set(["infra", "docs", "bug", "ui", "api", "db", "perf", "chore"].map(resolveTagTone));
		expect(tones.size).toBeGreaterThan(2);
	});

	it("always lands inside the palette", () => {
		for (const tag of ["a", "docs", "muito-longa-mesmo", "123", "ção"]) {
			expect(["violet", "sky", "emerald", "amber", "rose", "cyan"]).toContain(resolveTagTone(tag));
		}
	});
});

describe("resolveSourceKind", () => {
	it("recognizes the origins it has icons for", () => {
		expect(resolveSourceKind("telegram")).toBe("telegram");
		expect(resolveSourceKind("SLACK")).toBe("chat");
		expect(resolveSourceKind("cli")).toBe("cli");
		expect(resolveSourceKind("kanban")).toBe("board");
	});

	it("shows nothing for an origin it does not know", () => {
		// Inventing an icon for an unknown transport is worse than showing none.
		expect(resolveSourceKind("carrier-pigeon")).toBeUndefined();
		expect(resolveSourceKind("")).toBeUndefined();
		expect(resolveSourceKind(undefined)).toBeUndefined();
	});
});

describe("formatCardDate", () => {
	it("omits the year for a card from this year", () => {
		const now = new Date("2026-10-11T12:00:00Z").getTime();
		const label = formatCardDate(new Date("2026-08-26T12:00:00Z").getTime(), now);
		expect(label).not.toContain("2026");
		expect(label).toMatch(/26/);
	});

	it("includes the year for an older card", () => {
		const now = new Date("2026-10-11T12:00:00Z").getTime();
		expect(formatCardDate(new Date("2025-08-26T12:00:00Z").getTime(), now)).toContain("2025");
	});

	it("says nothing for a timestamp it cannot read", () => {
		expect(formatCardDate(Number.NaN)).toBe("");
	});
});
