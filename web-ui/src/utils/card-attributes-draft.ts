import type { RuntimeTaskPriority } from "@/runtime/types";
import type { BoardCard } from "@/types";

/**
 * The three attribute fields while someone is typing them.
 *
 * Tags live as the raw comma string here rather than as an array: a person typing "infra, do"
 * is mid-word, and splitting on every keystroke would make the field fight them. The split
 * happens once, on save.
 *
 * They travel as one object rather than as six separate states because the dialog that renders
 * them already takes ninety props, and three more fields are not worth six more.
 */

export interface CardAttributesDraft {
	tags: string;
	category: string;
	priority: RuntimeTaskPriority | undefined;
}

export const EMPTY_CARD_ATTRIBUTES: CardAttributesDraft = {
	tags: "",
	category: "",
	priority: undefined,
};

export function toCardAttributesDraft(card: Pick<BoardCard, "tags" | "category" | "priority">): CardAttributesDraft {
	return {
		tags: (card.tags ?? []).join(", "),
		category: card.category ?? "",
		priority: card.priority,
	};
}

export interface CardAttributesValue {
	tags?: string[];
	category?: string;
	priority?: RuntimeTaskPriority;
}

/**
 * What gets saved. Empty means absent, not empty: a card with no tags must look like every card
 * written before tags existed, and `tags: []` would read as "deliberately none".
 */
export function fromCardAttributesDraft(draft: CardAttributesDraft): CardAttributesValue {
	const tags = draft.tags
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
	const category = draft.category.trim();
	return {
		...(tags.length > 0 ? { tags } : {}),
		...(category ? { category } : {}),
		...(draft.priority ? { priority: draft.priority } : {}),
	};
}
