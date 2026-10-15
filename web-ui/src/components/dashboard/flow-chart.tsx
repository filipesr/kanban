import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_LINE, AXIS_TICK, CHART_HEIGHT, CHART_SERIES, GRID_STROKE } from "@/components/dashboard/chart-theme";
import { ChartLegend, ChartTooltip, datumAt } from "@/components/dashboard/chart-tooltip";
import type { DashboardChartRow } from "@/utils/dashboard-chart-rows";
import { formatCount } from "@/utils/dashboard-period";

const FLOW_KEYS = ["created", "started", "reviewed", "completed"] as const;

/** Cards created, started, sent to review and finished per period: is work coming in faster than it goes out? */
export function FlowChart({ rows }: { rows: DashboardChartRow[] }): React.ReactElement {
	return (
		<div>
			<ResponsiveContainer width="100%" height={CHART_HEIGHT}>
				<LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
					<CartesianGrid vertical={false} stroke={GRID_STROKE} />
					<XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={16} />
					<YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
					<Tooltip
						cursor={{ stroke: "var(--color-border-bright)" }}
						content={({ active, activeIndex }) => {
							const row = active ? datumAt(rows, activeIndex) : null;
							return row ? (
								<ChartTooltip
									title={row.label}
									rows={FLOW_KEYS.map((key) => ({
										label: CHART_SERIES[key].label,
										color: CHART_SERIES[key].color,
										value: formatCount(row[key]),
									}))}
								/>
							) : null;
						}}
					/>
					{FLOW_KEYS.map((key) => (
						<Line
							key={key}
							type="linear"
							dataKey={key}
							name={CHART_SERIES[key].label}
							stroke={CHART_SERIES[key].color}
							strokeWidth={2}
							dot={false}
							activeDot={{ r: 4, stroke: "var(--color-surface-1)", strokeWidth: 2 }}
							isAnimationActive={false}
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
			<ChartLegend items={FLOW_KEYS.map((key) => CHART_SERIES[key])} />
		</div>
	);
}
