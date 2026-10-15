import type {
	RuntimeBoardColumnId,
	RuntimeProjectsOverviewCard,
	RuntimeProjectsOverviewCardStatus,
	RuntimeProjectsOverviewResponse,
	RuntimeTaskPriority,
} from "@/runtime/types";

export type ProjectsOverviewData = RuntimeProjectsOverviewResponse;

export type ProjectsOverviewSort = "priority" | "updated";

/** "none" selects the cards nobody gave a priority, which is most of them on a fresh board. */
export type ProjectsOverviewPriorityFilter = RuntimeTaskPriority | "none";

export interface ProjectsOverviewFilters {
	projectId: string | null;
	priority: ProjectsOverviewPriorityFilter | null;
	tag: string | null;
	category: string | null;
	onlyNeedsMe: boolean;
}

export const EMPTY_PROJECTS_OVERVIEW_FILTERS: ProjectsOverviewFilters = {
	projectId: null,
	priority: null,
	tag: null,
	category: null,
	onlyNeedsMe: false,
};

export const PROJECTS_OVERVIEW_COLUMNS: ReadonlyArray<{ id: RuntimeBoardColumnId; title: string }> = [
	{ id: "backlog", title: "Backlog" },
	{ id: "in_progress", title: "In Progress" },
	{ id: "review", title: "Review" },
	{ id: "trash", title: "Done" },
];

/**
 * Replace what a partial reload covered and keep the rest. A requested project missing from the
 * update was removed, so its cards go too.
 */
export function mergeProjectsOverview(
	current: ProjectsOverviewData | null,
	update: ProjectsOverviewData,
	requestedProjectIds: readonly string[] | null,
): ProjectsOverviewData {
	if (!current || !requestedProjectIds) {
		return update;
	}
	const replaced = new Set(requestedProjectIds);
	const projects = [...current.projects.filter((project) => !replaced.has(project.id)), ...update.projects].sort(
		(left, right) => left.name.localeCompare(right.name),
	);
	const cards = [...current.cards.filter((card) => !replaced.has(card.projectId)), ...update.cards];
	return { projects, cards };
}

/**
 * Whether the card is stuck until its owner does something: answer it, read what it did, or see
 * why it broke. A card already done is never waiting, whatever its last session said.
 */
export function cardNeedsAttention(card: Pick<RuntimeProjectsOverviewCard, "status" | "column">): boolean {
	if (card.column === "trash") {
		return false;
	}
	return card.status === "awaiting_answer" || card.status === "awaiting_review" || card.status === "failed";
}

export function filterOverviewCards(
	cards: readonly RuntimeProjectsOverviewCard[],
	filters: ProjectsOverviewFilters,
): RuntimeProjectsOverviewCard[] {
	return cards.filter((card) => {
		if (filters.projectId && card.projectId !== filters.projectId) {
			return false;
		}
		if (filters.priority && (card.priority ?? "none") !== filters.priority) {
			return false;
		}
		if (filters.tag && !card.tags.includes(filters.tag)) {
			return false;
		}
		if (filters.category && card.category !== filters.category) {
			return false;
		}
		if (filters.onlyNeedsMe && !cardNeedsAttention(card)) {
			return false;
		}
		return true;
	});
}

const PRIORITY_RANK: Record<RuntimeTaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** When the card last moved, by its own edits or by its agent. */
export function resolveOverviewCardActivityAt(card: RuntimeProjectsOverviewCard): number {
	return Math.max(card.updatedAt, card.sessionUpdatedAt ?? 0);
}

export function sortOverviewCards(
	cards: readonly RuntimeProjectsOverviewCard[],
	sort: ProjectsOverviewSort,
): RuntimeProjectsOverviewCard[] {
	const byRecency = (left: RuntimeProjectsOverviewCard, right: RuntimeProjectsOverviewCard) =>
		resolveOverviewCardActivityAt(right) - resolveOverviewCardActivityAt(left);
	if (sort === "updated") {
		return [...cards].sort(byRecency);
	}
	return [...cards].sort((left, right) => {
		const leftRank = left.priority ? PRIORITY_RANK[left.priority] : 3;
		const rightRank = right.priority ? PRIORITY_RANK[right.priority] : 3;
		return leftRank - rightRank || byRecency(left, right);
	});
}

export function groupOverviewCardsByColumn(
	cards: readonly RuntimeProjectsOverviewCard[],
): Record<RuntimeBoardColumnId, RuntimeProjectsOverviewCard[]> {
	const grouped: Record<RuntimeBoardColumnId, RuntimeProjectsOverviewCard[]> = {
		backlog: [],
		in_progress: [],
		review: [],
		trash: [],
	};
	for (const card of cards) {
		grouped[card.column].push(card);
	}
	return grouped;
}

export interface ProjectsOverviewFacets {
	tags: string[];
	categories: string[];
}

export function collectOverviewFacets(cards: readonly RuntimeProjectsOverviewCard[]): ProjectsOverviewFacets {
	const tags = new Set<string>();
	const categories = new Set<string>();
	for (const card of cards) {
		for (const tag of card.tags) {
			if (tag.trim()) {
				tags.add(tag);
			}
		}
		if (card.category) {
			categories.add(card.category);
		}
	}
	const byName = (left: string, right: string) => left.localeCompare(right);
	return { tags: [...tags].sort(byName), categories: [...categories].sort(byName) };
}

/**
 * A project's colour, derived from its id so it never changes between visits or reorders.
 * Status colours are left out on purpose: a project badge in orange would read as "needs review".
 */
const PROJECT_PALETTE = [
	"#A371F7",
	"#4C9AFF",
	"#2DD4BF",
	"#F472B6",
	"#A3E635",
	"#FB923C",
	"#38BDF8",
	"#E879F9",
] as const;

export function resolveProjectColor(projectId: string): string {
	let hash = 0;
	for (const char of projectId) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
	}
	return PROJECT_PALETTE[hash % PROJECT_PALETTE.length] ?? PROJECT_PALETTE[0];
}

export const OVERVIEW_STATUS_LABEL: Record<RuntimeProjectsOverviewCardStatus, string> = {
	idle: "Idle",
	running: "Running",
	awaiting_answer: "Waiting on your answer",
	awaiting_review: "Ready for review",
	failed: "Failed",
	interrupted: "Interrupted",
};
