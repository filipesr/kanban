import type { RuntimeTaskPriority } from "@/runtime/types";

/**
 * What a card shows of its tags, category and priority.
 *
 * A card already carries a title, a prompt, its agent and its session state. These three are
 * there to help find things, not to be read every time, so the rule is: never let them crowd
 * out what the card is actually about. Tags past a handful become a count.
 */

const MAX_VISIBLE_TAGS = 3;

export interface VisibleTags {
	shown: string[];
	/** How many were left out, so the card can say "+2" rather than wrap into a wall. */
	overflow: number;
}

export function resolveVisibleTags(tags: readonly string[] | undefined, max = MAX_VISIBLE_TAGS): VisibleTags {
	const all = (tags ?? []).filter((tag) => tag.trim().length > 0);
	return {
		shown: all.slice(0, max),
		overflow: Math.max(0, all.length - max),
	};
}

/**
 * Only `high` gets a colour. Medium and low are the ordinary cases, and colouring every card
 * would make the colour mean nothing -- the point is that an urgent card stands out from the
 * ones around it.
 */
export function resolvePriorityTone(priority: RuntimeTaskPriority | undefined): "urgent" | "muted" | undefined {
	if (priority === "high") {
		return "urgent";
	}
	return priority ? "muted" : undefined;
}

export function hasCardAttributes(card: {
	tags?: readonly string[];
	category?: string;
	priority?: RuntimeTaskPriority;
}): boolean {
	return (card.tags?.length ?? 0) > 0 || Boolean(card.category?.trim()) || Boolean(card.priority);
}
