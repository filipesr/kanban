import { useState } from "react";

import { ProjectsOverviewCard } from "@/components/projects-overview/projects-overview-card";
import { Button } from "@/components/ui/button";
import { ColumnIndicator } from "@/components/ui/column-indicator";
import type { RuntimeBoardColumnId, RuntimeProjectsOverviewCard } from "@/runtime/types";

/** Done keeps growing forever; the overview shows what finished lately and folds the rest. */
export const OVERVIEW_DONE_VISIBLE_LIMIT = 10;

export function ProjectsOverviewColumn({
	columnId,
	title,
	cards,
	projectNameById,
	onOpenCard,
}: {
	columnId: RuntimeBoardColumnId;
	title: string;
	cards: RuntimeProjectsOverviewCard[];
	projectNameById: ReadonlyMap<string, string>;
	onOpenCard: (card: RuntimeProjectsOverviewCard) => void;
}): React.ReactElement {
	const [isExpanded, setIsExpanded] = useState(false);
	const isLimited = columnId === "trash" && !isExpanded && cards.length > OVERVIEW_DONE_VISIBLE_LIMIT;
	const visibleCards = isLimited ? cards.slice(0, OVERVIEW_DONE_VISIBLE_LIMIT) : cards;

	return (
		<section
			data-overview-column={columnId}
			aria-label={title}
			className="flex min-h-0 min-w-[260px] flex-1 basis-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
		>
			<div className="flex h-10 shrink-0 items-center gap-2 px-3">
				<ColumnIndicator columnId={columnId} />
				<span className="text-sm font-semibold">{title}</span>
				<span className="text-xs text-text-secondary">{cards.length}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2 pb-2">
				{visibleCards.length === 0 ? (
					<div className="px-1 py-6 text-center text-xs text-text-tertiary">Nothing here</div>
				) : (
					visibleCards.map((card) => (
						<ProjectsOverviewCard
							key={`${card.projectId}:${card.taskId}`}
							card={card}
							projectName={projectNameById.get(card.projectId) ?? card.projectId}
							onOpen={onOpenCard}
						/>
					))
				)}
				{columnId === "trash" && cards.length > OVERVIEW_DONE_VISIBLE_LIMIT ? (
					<Button variant="ghost" size="sm" fill onClick={() => setIsExpanded((current) => !current)}>
						{isExpanded ? "Show recent only" : `Show all ${cards.length}`}
					</Button>
				) : null}
			</div>
		</section>
	);
}
