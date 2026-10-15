import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
	AXIS_LINE,
	AXIS_TICK,
	CHART_HEIGHT,
	CODE_SERIES,
	CURSOR_FILL,
	GRID_STROKE,
	MARK_GAP_STROKE,
} from "@/components/dashboard/chart-theme";
import { ChartLegend, ChartTooltip, datumAt } from "@/components/dashboard/chart-tooltip";
import type { DashboardChartRow } from "@/utils/dashboard-chart-rows";
import { formatCount } from "@/utils/dashboard-period";

/** Commits landed on each project's branch per period. One series: its title names it. */
export function CommitsChart({ rows }: { rows: DashboardChartRow[] }): React.ReactElement {
	return (
		<ResponsiveContainer width="100%" height={CHART_HEIGHT}>
			<BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
				<CartesianGrid vertical={false} stroke={GRID_STROKE} />
				<XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={16} />
				<YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
				<Tooltip
					cursor={{ fill: CURSOR_FILL }}
					content={({ active, activeIndex }) => {
						const row = active ? datumAt(rows, activeIndex) : null;
						return row ? (
							<ChartTooltip
								title={row.label}
								rows={[
									{ ...CODE_SERIES.commits, value: formatCount(row.commits) },
									{ label: "Files changed", value: formatCount(row.filesChanged) },
									{ label: "Files created", value: formatCount(row.filesCreated) },
								]}
							/>
						) : null;
					}}
				/>
				<Bar
					dataKey="commits"
					fill={CODE_SERIES.commits.color}
					radius={[4, 4, 0, 0]}
					maxBarSize={28}
					isAnimationActive={false}
				/>
			</BarChart>
		</ResponsiveContainer>
	);
}

/**
 * Lines added above the baseline and removed below it, on one axis: the two are the same unit,
 * and a period that mostly deletes reads as such at a glance.
 */
export function LinesChangedChart({ rows }: { rows: DashboardChartRow[] }): React.ReactElement {
	const data = rows.map((row) => ({ ...row, removed: -row.deletions }));
	return (
		<div>
			<ResponsiveContainer width="100%" height={CHART_HEIGHT}>
				<BarChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
					<CartesianGrid vertical={false} stroke={GRID_STROKE} />
					<XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={16} />
					<YAxis
						tick={AXIS_TICK}
						axisLine={false}
						tickLine={false}
						tickFormatter={(value: number) => formatCount(Math.abs(value))}
					/>
					<ReferenceLine y={0} stroke="var(--color-border-bright)" />
					<Tooltip
						cursor={{ fill: CURSOR_FILL }}
						content={({ active, activeIndex }) => {
							const row = active ? datumAt(rows, activeIndex) : null;
							return row ? (
								<ChartTooltip
									title={row.label}
									rows={[
										{ ...CODE_SERIES.additions, value: `+${formatCount(row.additions)}` },
										{ ...CODE_SERIES.deletions, value: `−${formatCount(row.deletions)}` },
									]}
								/>
							) : null;
						}}
					/>
					<Bar
						dataKey="additions"
						stackId="lines"
						fill={CODE_SERIES.additions.color}
						stroke={MARK_GAP_STROKE}
						strokeWidth={1}
						radius={[4, 4, 0, 0]}
						maxBarSize={28}
						isAnimationActive={false}
					/>
					<Bar
						dataKey="removed"
						stackId="lines"
						fill={CODE_SERIES.deletions.color}
						stroke={MARK_GAP_STROKE}
						strokeWidth={1}
						radius={[0, 0, 4, 4]}
						maxBarSize={28}
						isAnimationActive={false}
					/>
				</BarChart>
			</ResponsiveContainer>
			<ChartLegend items={[CODE_SERIES.additions, CODE_SERIES.deletions]} />
		</div>
	);
}
