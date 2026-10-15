import type { RuntimeStatisticsProject } from "@/runtime/types";
import { formatCount, formatDuration } from "@/utils/dashboard-period";

/** The period's totals per project, the table view behind the charts. */
export function ProjectBreakdownTable({ projects }: { projects: RuntimeStatisticsProject[] }): React.ReactElement {
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[560px] text-xs">
				<thead>
					<tr className="text-left text-text-tertiary">
						<th className="pb-1.5 font-normal">Project</th>
						<th className="pb-1.5 text-right font-normal">Created</th>
						<th className="pb-1.5 text-right font-normal">Completed</th>
						<th className="pb-1.5 text-right font-normal">Open</th>
						<th className="pb-1.5 text-right font-normal">Agent work</th>
						<th className="pb-1.5 text-right font-normal">Commits</th>
						<th className="pb-1.5 text-right font-normal">Lines +/−</th>
					</tr>
				</thead>
				<tbody>
					{projects.map((project) => (
						<tr key={project.id} className="border-t border-border text-text-secondary">
							<td className="py-1.5 pr-2 text-text-primary" title={project.path}>
								{project.name}
								{project.gitError ? (
									<span className="ml-1.5 text-[11px] text-status-orange" title={project.gitError}>
										no git stats
									</span>
								) : null}
							</td>
							<td className="py-1.5 text-right tabular-nums">{formatCount(project.totals.created)}</td>
							<td className="py-1.5 text-right tabular-nums">{formatCount(project.totals.completed)}</td>
							<td className="py-1.5 text-right tabular-nums">
								{formatCount(project.wip.backlog + project.wip.in_progress + project.wip.review)}
							</td>
							<td className="py-1.5 text-right tabular-nums">{formatDuration(project.totals.agentWorkMs)}</td>
							<td className="py-1.5 text-right tabular-nums">{formatCount(project.totals.commits)}</td>
							<td className="py-1.5 text-right tabular-nums">
								+{formatCount(project.totals.additions)} / −{formatCount(project.totals.deletions)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
