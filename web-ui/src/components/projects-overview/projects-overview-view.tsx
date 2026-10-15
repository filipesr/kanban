import { useMemo } from "react";

import { ProjectsOverviewColumn } from "@/components/projects-overview/projects-overview-column";
import { ProjectsOverviewToolbar } from "@/components/projects-overview/projects-overview-toolbar";
import { Spinner } from "@/components/ui/spinner";
import { useProjectsOverview } from "@/hooks/use-projects-overview";
import { useProjectsOverviewBoard } from "@/hooks/use-projects-overview-board";
import type { RuntimeProjectsOverviewCard } from "@/runtime/types";
import { PROJECTS_OVERVIEW_COLUMNS } from "@/utils/projects-overview";

export function ProjectsOverviewView({
	invalidationVersions,
	projectIds,
	onOpenCard,
}: {
	invalidationVersions: Record<string, number>;
	projectIds: readonly string[];
	onOpenCard: (card: RuntimeProjectsOverviewCard) => void;
}): React.ReactElement {
	const overview = useProjectsOverview({ enabled: true, invalidationVersions, projectIds });
	const board = useProjectsOverviewBoard(overview.data);
	const projects = overview.data?.projects ?? [];
	const projectNameById = useMemo(
		() => new Map(projects.map((project) => [project.id, project.name] as const)),
		[projects],
	);

	if (!overview.data) {
		return (
			<div className="flex flex-1 min-h-0 items-center justify-center bg-surface-0">
				{overview.error ? <p className="text-[13px] text-status-red">{overview.error}</p> : <Spinner size={30} />}
			</div>
		);
	}

	return (
		<div className="flex flex-1 min-h-0 min-w-0 flex-col bg-surface-0">
			<ProjectsOverviewToolbar
				board={board}
				projects={projects}
				isLoading={overview.isLoading}
				onReload={overview.reload}
			/>
			{overview.error ? <p className="px-3 pb-2 text-xs text-status-red">{overview.error}</p> : null}
			<div className="flex flex-1 min-h-0 gap-2 overflow-x-auto px-2 pb-2">
				{PROJECTS_OVERVIEW_COLUMNS.map((column) => (
					<ProjectsOverviewColumn
						key={column.id}
						columnId={column.id}
						title={column.title}
						cards={board.cardsByColumn[column.id]}
						projectNameById={projectNameById}
						onOpenCard={onOpenCard}
					/>
				))}
			</div>
		</div>
	);
}
