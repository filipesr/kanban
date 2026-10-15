import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
	AXIS_LINE,
	AXIS_TICK,
	CURSOR_FILL,
	GRID_STROKE,
	MARK_GAP_STROKE,
	WIP_SERIES,
} from "@/components/dashboard/chart-theme";
import { ChartLegend, ChartTooltip, datumAt } from "@/components/dashboard/chart-tooltip";
import type { RuntimeStatisticsProject } from "@/runtime/types";
import { formatCount } from "@/utils/dashboard-period";

const WIP_KEYS = ["backlog", "in_progress", "review", "trash"] as const;
const ROW_HEIGHT = 32;

/** Where each project's cards sit right now, one stacked bar per project. */
export function WipByProjectChart({ projects }: { projects: RuntimeStatisticsProject[] }): React.ReactElement {
	const rows = projects.map((project) => ({ name: project.name, ...project.wip }));
	return (
		<div>
			<ResponsiveContainer width="100%" height={Math.max(120, rows.length * ROW_HEIGHT + 40)}>
				<BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
					<CartesianGrid horizontal={false} stroke={GRID_STROKE} />
					<XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
					<YAxis type="category" dataKey="name" width={110} tick={AXIS_TICK} axisLine={false} tickLine={false} />
					<Tooltip
						cursor={{ fill: CURSOR_FILL }}
						content={({ active, activeIndex }) => {
							const row = active ? datumAt(rows, activeIndex) : null;
							return row ? (
								<ChartTooltip
									title={row.name}
									rows={WIP_KEYS.map((key) => ({ ...WIP_SERIES[key], value: formatCount(row[key]) }))}
								/>
							) : null;
						}}
					/>
					{WIP_KEYS.map((key, index) => (
						<Bar
							key={key}
							dataKey={key}
							stackId="wip"
							fill={WIP_SERIES[key].color}
							stroke={MARK_GAP_STROKE}
							strokeWidth={2}
							radius={index === WIP_KEYS.length - 1 ? [0, 4, 4, 0] : 0}
							barSize={18}
							isAnimationActive={false}
						/>
					))}
				</BarChart>
			</ResponsiveContainer>
			<ChartLegend items={WIP_KEYS.map((key) => WIP_SERIES[key])} />
		</div>
	);
}
