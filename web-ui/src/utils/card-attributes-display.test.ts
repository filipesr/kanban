import { describe, expect, it } from "vitest";

import { hasCardAttributes, resolvePriorityTone, resolveVisibleTags } from "@/utils/card-attributes-display";

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
