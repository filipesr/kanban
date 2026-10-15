import type { RuntimeStatisticsDuration, RuntimeStatisticsResponse } from "@/runtime/types";
import { formatDuration } from "@/utils/dashboard-period";

const ROWS: Array<{ key: keyof RuntimeStatisticsResponse["durations"]; label: string; hint: string }> = [
	{ key: "leadTime", label: "Lead time", hint: "created → done" },
	{ key: "inProgress", label: "In progress", hint: "each stay" },
	{ key: "inReview", label: "In review", hint: "each stay" },
	{ key: "agentRun", label: "Agent run", hint: "each run" },
];

/**
 * Typical and average times side by side, with a bar scaled to the longest mean: a mean far above
 * its median means a few long outliers rather than everything being slow.
 */
export function DurationsTable({
	durations,
}: {
	durations: RuntimeStatisticsResponse["durations"];
}): React.ReactElement {
	const longest = Math.max(1, ...ROWS.map((row) => durations[row.key].meanMs ?? 0));
	return (
		<table className="w-full text-xs">
			<thead>
				<tr className="text-left text-text-tertiary">
					<th className="pb-1.5 font-normal">Stage</th>
					<th className="pb-1.5 text-right font-normal">Median</th>
					<th className="pb-1.5 text-right font-normal">Mean</th>
					<th className="pb-1.5 text-right font-normal">Count</th>
				</tr>
			</thead>
			<tbody>
				{ROWS.map((row) => (
					<DurationRow
						key={row.key}
						label={row.label}
						hint={row.hint}
						value={durations[row.key]}
						longest={longest}
					/>
				))}
			</tbody>
		</table>
	);
}

function DurationRow({
	label,
	hint,
	value,
	longest,
}: {
	label: string;
	hint: string;
	value: RuntimeStatisticsDuration;
	longest: number;
}): React.ReactElement {
	return (
		<tr className="border-t border-border">
			<td className="py-1.5 pr-2">
				<div className="text-text-primary">{label}</div>
				<div className="text-[11px] text-text-tertiary">{hint}</div>
				<div className="mt-1 h-1 rounded-full bg-surface-3">
					<div
						className="h-1 rounded-full bg-[var(--color-chart-1)]"
						style={{ width: `${((value.meanMs ?? 0) / longest) * 100}%` }}
					/>
				</div>
			</td>
			<td className="py-1.5 text-right tabular-nums text-text-primary">{formatDuration(value.medianMs)}</td>
			<td className="py-1.5 text-right tabular-nums text-text-secondary">{formatDuration(value.meanMs)}</td>
			<td className="py-1.5 text-right tabular-nums text-text-secondary">{value.count}</td>
		</tr>
	);
}
