import { useMemo, useState } from "react";

import type { RuntimeBoardColumnId, RuntimeProjectsOverviewCard } from "@/runtime/types";
import {
	cardNeedsAttention,
	collectOverviewFacets,
	EMPTY_PROJECTS_OVERVIEW_FILTERS,
	filterOverviewCards,
	groupOverviewCardsByColumn,
	type ProjectsOverviewData,
	type ProjectsOverviewFacets,
	type ProjectsOverviewFilters,
	type ProjectsOverviewSort,
	sortOverviewCards,
} from "@/utils/projects-overview";

export interface UseProjectsOverviewBoardResult {
	filters: ProjectsOverviewFilters;
	setFilter: <K extends keyof ProjectsOverviewFilters>(key: K, value: ProjectsOverviewFilters[K]) => void;
	clearFilters: () => void;
	hasActiveFilters: boolean;
	sort: ProjectsOverviewSort;
	setSort: (sort: ProjectsOverviewSort) => void;
	facets: ProjectsOverviewFacets;
	cardsByColumn: Record<RuntimeBoardColumnId, RuntimeProjectsOverviewCard[]>;
	/** Across all projects and ignoring filters: the number the person is here to bring to zero. */
	needsAttentionCount: number;
}

export function useProjectsOverviewBoard(data: ProjectsOverviewData | null): UseProjectsOverviewBoardResult {
	const [filters, setFilters] = useState<ProjectsOverviewFilters>(EMPTY_PROJECTS_OVERVIEW_FILTERS);
	const [sort, setSort] = useState<ProjectsOverviewSort>("priority");
	const cards = data?.cards;

	const facets = useMemo(() => collectOverviewFacets(cards ?? []), [cards]);

	const cardsByColumn = useMemo(() => {
		const grouped = groupOverviewCardsByColumn(sortOverviewCards(filterOverviewCards(cards ?? [], filters), sort));
		// Done is a record, not a queue: what finished last is what someone comes back to check.
		grouped.trash = sortOverviewCards(grouped.trash, "updated");
		return grouped;
	}, [cards, filters, sort]);

	const needsAttentionCount = useMemo(() => (cards ?? []).filter(cardNeedsAttention).length, [cards]);

	const hasActiveFilters =
		filters.projectId !== null ||
		filters.priority !== null ||
		filters.tag !== null ||
		filters.category !== null ||
		filters.onlyNeedsMe;

	return {
		filters,
		setFilter: (key, value) => {
			setFilters((current) => ({ ...current, [key]: value }));
		},
		clearFilters: () => {
			setFilters(EMPTY_PROJECTS_OVERVIEW_FILTERS);
		},
		hasActiveFilters,
		sort,
		setSort,
		facets,
		cardsByColumn,
		needsAttentionCount,
	};
}
