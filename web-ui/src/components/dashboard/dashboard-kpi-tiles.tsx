import type { RuntimeStatisticsResponse } from "@/runtime/types";
import { formatCount, formatDuration, formatPercent } from "@/utils/dashboard-period";

interface KpiTile {
	label: string;
	value: string;
	detail?: string;
}

function buildTiles(statistics: RuntimeStatisticsResponse): KpiTile[] {
	const { totals, wip, rates, durations } = statistics;
	const openCards = wip.backlog + wip.in_progress + wip.review;
	return [
		{ label: "Created", value: formatCount(totals.created) },
		{
			label: "Completed",
			value: formatCount(totals.completed),
			detail: `${formatPercent(rates.completionRate)} of created`,
		},
		{ label: "Open now", value: formatCount(openCards), detail: `${formatCount(wip.in_progress)} in progress` },
		{ label: "In review now", value: formatCount(wip.review), detail: `${formatPercent(rates.reviewShare)} of open` },
		{
			label: "Lead time",
			value: formatDuration(durations.leadTime.medianMs),
			detail: durations.leadTime.count > 0 ? `median of ${durations.leadTime.count}` : "no card finished",
		},
		{ label: "Agent work", value: formatDuration(totals.agentWorkMs), detail: `${durations.agentRun.count} runs` },
		{ label: "Commits", value: formatCount(totals.commits), detail: `${formatCount(totals.filesChanged)} files` },
		{
			label: "Lines",
			value: `+${formatCount(totals.additions)}`,
			detail: `−${formatCount(totals.deletions)} · ${formatCount(totals.filesCreated)} new files`,
		},
	];
}

export function DashboardKpiTiles({ statistics }: { statistics: RuntimeStatisticsResponse }): React.ReactElement {
	return (
		<dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
			{buildTiles(statistics).map((tile) => (
				<div key={tile.label} className="min-w-0 rounded-lg border border-border bg-surface-1 px-3 py-2.5">
					<dt className="truncate text-xs text-text-secondary">{tile.label}</dt>
					<dd className="mt-1 truncate text-xl font-semibold tabular-nums text-text-primary">{tile.value}</dd>
					{tile.detail ? <dd className="truncate text-[11px] text-text-tertiary">{tile.detail}</dd> : null}
				</div>
			))}
		</dl>
	);
}
