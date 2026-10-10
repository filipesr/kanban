/**
 * Normalization for the card attributes a person types: tags, category, priority.
 *
 * These exist as data only -- nothing on the board behaves differently because of them. That is
 * deliberate: a priority field changes nothing while nothing picks work automatically, and the
 * ordering within a column already carries that meaning. What they buy is finding things, and
 * finding things only works if "Infra", "infra " and "infra" are one tag rather than three.
 */

export const TASK_PRIORITIES = ["high", "medium", "low"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const TAG_MAX_LENGTH = 32;
const CATEGORY_MAX_LENGTH = 32;

/**
 * Tags, trimmed and deduplicated, with case folded for comparison but the first spelling kept.
 * Someone who types `Infra` first and `infra` later means one tag, and seeing their own
 * capitalization come back is friendlier than having it flattened.
 */
export function normalizeTaskTags(input: readonly string[] | undefined): string[] | undefined {
	if (!input) {
		return undefined;
	}
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const raw of input) {
		const trimmed = raw.trim().slice(0, TAG_MAX_LENGTH).trim();
		if (!trimmed) {
			continue;
		}
		const key = trimmed.toLocaleLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		tags.push(trimmed);
	}
	return tags.length > 0 ? tags : undefined;
}

/** Splits what a CLI flag carries: `--tags infra,docs` or `--tags "infra, docs"`. */
export function parseTaskTagList(input: string | undefined): string[] | undefined {
	if (input === undefined) {
		return undefined;
	}
	return normalizeTaskTags(input.split(","));
}

export function normalizeTaskCategory(input: string | undefined): string | undefined {
	const trimmed = input?.trim().slice(0, CATEGORY_MAX_LENGTH).trim();
	return trimmed ? trimmed : undefined;
}

/**
 * A priority outside the three levels is dropped rather than coerced. Guessing that "urgent"
 * means `high` would be a reasonable guess that is still a guess, and a card silently filed at
 * the wrong priority is worse than one filed at none.
 */
export function normalizeTaskPriority(input: string | undefined): TaskPriority | undefined {
	const trimmed = input?.trim().toLocaleLowerCase();
	return TASK_PRIORITIES.find((priority) => priority === trimmed);
}

/**
 * A priority as a CLI flag carries three distinct intentions: absent means leave it alone, empty
 * means clear it, and a value means set it. A value that is not one of the three levels is none
 * of those -- it is a typo -- and must be refused rather than dropped: dropping it would clear
 * the priority the card already had, so asking for "urgent" would lose "high".
 */
export function parseTaskPriorityOption(input: string | undefined): TaskPriority | null | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (!input.trim()) {
		return null;
	}
	const priority = normalizeTaskPriority(input);
	if (!priority) {
		throw new Error(`--priority must be one of ${TASK_PRIORITIES.join(" | ")}, got "${input}".`);
	}
	return priority;
}
