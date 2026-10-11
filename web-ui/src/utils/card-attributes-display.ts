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

/**
 * A tag's colour, derived from its own name.
 *
 * Derived rather than configured: a tag typed in a chat has nowhere to carry a colour, and
 * asking someone to pick one before they can file a demand defeats the point. The same name
 * always lands on the same colour, which is what makes a column scannable -- you find things by
 * colour instead of reading every card.
 *
 * The palette is curated rather than generated so two tags never land on a clashing pair.
 */
const TAG_PALETTE = ["violet", "sky", "emerald", "amber", "rose", "cyan"] as const;

export type TagTone = (typeof TAG_PALETTE)[number];

export function resolveTagTone(tag: string): TagTone {
	let hash = 0;
	for (const char of tag.trim().toLocaleLowerCase()) {
		// Small, stable, and order-dependent: "infra" and "rfina" are different tags.
		hash = (hash * 31 + char.codePointAt(0)!) % 100_000;
	}
	return TAG_PALETTE[hash % TAG_PALETTE.length] as TagTone;
}

/**
 * Which known origin a card came from. An unrecognized one returns nothing: a board that
 * invents an icon for a transport it does not know is worse than one that shows none.
 */
export function resolveSourceKind(source: string | undefined): "telegram" | "chat" | "cli" | "board" | undefined {
	const normalized = source?.trim().toLocaleLowerCase();
	if (!normalized) {
		return undefined;
	}
	if (normalized === "telegram") {
		return "telegram";
	}
	if (normalized === "slack" || normalized === "discord" || normalized === "gchat") {
		return "chat";
	}
	if (normalized === "cli") {
		return "cli";
	}
	if (normalized === "kanban" || normalized === "board") {
		return "board";
	}
	return undefined;
}

/** `createdAt` as a short label: how long a card has been waiting is what matters on a board. */
export function formatCardDate(createdAt: number, now = Date.now()): string {
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	const sameYear = date.getFullYear() === new Date(now).getFullYear();
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		...(sameYear ? {} : { year: "numeric" }),
	});
}
