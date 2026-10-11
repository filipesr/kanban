import { describe, expect, it } from "vitest";

import { EMPTY_CARD_ATTRIBUTES, fromCardAttributesDraft, toCardAttributesDraft } from "@/utils/card-attributes-draft";

describe("toCardAttributesDraft", () => {
	it("shows tags as the comma list a person would type", () => {
		expect(toCardAttributesDraft({ tags: ["infra", "docs"], category: "bug", priority: "high" })).toEqual({
			tags: "infra, docs",
			category: "bug",
			priority: "high",
		});
	});

	it("starts empty for a card that carries none", () => {
		expect(toCardAttributesDraft({})).toEqual(EMPTY_CARD_ATTRIBUTES);
	});
});

describe("fromCardAttributesDraft", () => {
	it("splits the typed list and drops the gaps", () => {
		expect(fromCardAttributesDraft({ tags: " infra , , docs ", category: " bug ", priority: "low" })).toEqual({
			tags: ["infra", "docs"],
			category: "bug",
			priority: "low",
		});
	});

	it("leaves the fields out entirely when nothing was typed", () => {
		// A card with no tags must look like every card written before tags existed; `tags: []`
		// would read as "deliberately none".
		const value = fromCardAttributesDraft(EMPTY_CARD_ATTRIBUTES);
		expect("tags" in value).toBe(false);
		expect("category" in value).toBe(false);
		expect("priority" in value).toBe(false);
	});

	it("treats whitespace as nothing typed", () => {
		expect(fromCardAttributesDraft({ tags: " , , ", category: "   ", priority: undefined })).toEqual({});
	});

	it("survives a round trip", () => {
		const card = { tags: ["infra", "docs"], category: "bug", priority: "medium" as const };
		expect(fromCardAttributesDraft(toCardAttributesDraft(card))).toEqual(card);
	});
});
