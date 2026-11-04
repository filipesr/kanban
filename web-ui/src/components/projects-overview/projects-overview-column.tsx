import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { ProjectsOverviewCard } from "@/components/projects-overview/projects-overview-card";
import { Button } from "@/components/ui/button";
import { ColumnIndicator } from "@/components/ui/column-indicator";
import type { RuntimeBoardColumnId, RuntimeProjectsOverviewCard } from "@/runtime/types";

export function ProjectsOverviewColumn({
	columnId,
	title,
	cards,
	projectNameById,
	onOpenCard,
	isCollapsed = false,
	onCollapsedChange,
}: {
	columnId: RuntimeBoardColumnId;
	title: string;
	cards: RuntimeProjectsOverviewCard[];
	projectNameById: ReadonlyMap<string, string>;
	onOpenCard: (card: RuntimeProjectsOverviewCard) => void;
	isCollapsed?: boolean;
	/** Makes the column collapsible: it folds into a narrow strip showing its title and count. */
	onCollapsedChange?: (collapsed: boolean) => void;
}): React.ReactElement {
	if (onCollapsedChange && isCollapsed) {
		return (
			<section
				data-overview-column={columnId}
				data-collapsed="true"
				aria-label={title}
				className="flex min-h-0 w-10 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
			>
				<button
					type="button"
					onClick={() => onCollapsedChange(false)}
					aria-label={`Expand ${title}`}
					title={`Expand ${title}`}
					className="flex flex-1 min-h-0 cursor-pointer flex-col items-center gap-2 border-none bg-transparent py-3 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
				>
					<PanelLeftOpen size={14} />
					<ColumnIndicator columnId={columnId} />
					<span className="text-xs">{cards.length}</span>
					<span className="text-sm font-semibold text-text-primary [writing-mode:vertical-rl]">{title}</span>
				</button>
			</section>
		);
	}

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
				{onCollapsedChange ? (
					<Button
						icon={<PanelLeftClose size={14} />}
						variant="ghost"
						size="sm"
						className="ml-auto"
						onClick={() => onCollapsedChange(true)}
						aria-label={`Collapse ${title}`}
						title={`Collapse ${title}`}
					/>
				) : null}
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2 pb-2">
				{cards.length === 0 ? (
					<div className="px-1 py-6 text-center text-xs text-text-tertiary">Nothing here</div>
				) : (
					cards.map((card) => (
						<ProjectsOverviewCard
							key={`${card.projectId}:${card.taskId}`}
							card={card}
							projectName={projectNameById.get(card.projectId) ?? card.projectId}
							onOpen={onOpenCard}
						/>
					))
				)}
			</div>
		</section>
	);
}
