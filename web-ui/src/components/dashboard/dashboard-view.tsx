import { useMemo } from "react";

import { CommitsChart, LinesChangedChart } from "@/components/dashboard/code-activity-charts";
import { DashboardKpiTiles } from "@/components/dashboard/dashboard-kpi-tiles";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { DashboardToolbar } from "@/components/dashboard/dashboard-toolbar";
import { DurationsTable } from "@/components/dashboard/durations-table";
import { FlowChart } from "@/components/dashboard/flow-chart";
import { ProjectBreakdownTable } from "@/components/dashboard/project-breakdown-table";
import { WipByProjectChart } from "@/components/dashboard/wip-by-project-chart";
import { Spinner } from "@/components/ui/spinner";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useProjectStatistics } from "@/hooks/use-project-statistics";
import { toDashboardChartRows } from "@/utils/dashboard-chart-rows";

const SINCE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function DashboardView({
	projects,
	invalidationVersions,
}: {
	projects: ReadonlyArray<{ id: string; name: string }>;
	invalidationVersions: Record<string, number>;
}): React.ReactElement {
	const dashboardFilters = useDashboardFilters();
	const statistics = useProjectStatistics({ request: dashboardFilters.request, invalidationVersions });
	const data = statistics.data;
	const isAllTime = dashboardFilters.filters.range === "all";
	const rows = useMemo(
		() => (data ? toDashboardChartRows(data.buckets, data.granularity, { trimLeadingEmpty: isAllTime }) : []),
		[data, isAllTime],
	);

	return (
		<div className="flex flex-1 min-h-0 min-w-0 flex-col bg-surface-0">
			<DashboardToolbar
				projects={projects}
				filters={dashboardFilters}
				isLoading={statistics.isLoading}
				onReload={statistics.reload}
			/>
			{statistics.error ? <p className="px-3 pb-2 text-xs text-status-red">{statistics.error}</p> : null}
			{data ? (
				<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
					<p className="mb-2 text-xs text-text-tertiary">
						{data.flowDataSince === null
							? "Card flow is recorded from now on; creation, completion and git history come from what the boards and repositories already hold."
							: `Card flow (column changes, time in each stage, agent work) is recorded since ${SINCE_FORMAT.format(data.flowDataSince)}. Earlier periods show only creation, completion and git history.`}
					</p>
					<DashboardKpiTiles statistics={data} />
					<div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
						<DashboardPanel
							title="Card flow"
							description="Cards created, started, sent to review and completed per period"
							className="lg:col-span-2"
						>
							<FlowChart rows={rows} />
						</DashboardPanel>
						<DashboardPanel title="Commits" description="Non-merge commits on each project's checked-out branch">
							<CommitsChart rows={rows} />
						</DashboardPanel>
						<DashboardPanel title="Lines changed" description="Added above the line, removed below">
							<LinesChangedChart rows={rows} />
						</DashboardPanel>
						<DashboardPanel title="Cards by column" description="Where each project's cards are right now">
							<WipByProjectChart projects={data.projects} />
						</DashboardPanel>
						<DashboardPanel title="Time per stage" description="For stays and runs that ended in the period">
							<DurationsTable durations={data.durations} />
						</DashboardPanel>
						<DashboardPanel title="By project" description="Totals for the period" className="lg:col-span-2">
							<ProjectBreakdownTable projects={data.projects} />
						</DashboardPanel>
					</div>
				</div>
			) : (
				<div className="flex flex-1 min-h-0 items-center justify-center">
					{statistics.error ? null : <Spinner size={30} />}
				</div>
			)}
		</div>
	);
}
