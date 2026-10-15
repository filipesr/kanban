import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { UseDashboardFiltersResult } from "@/hooks/use-dashboard-filters";
import {
	coarsestUsefulGranularity,
	DASHBOARD_GRANULARITY_OPTIONS,
	DASHBOARD_RANGE_OPTIONS,
	isDashboardRangePreset,
} from "@/utils/dashboard-period";

export function DashboardToolbar({
	projects,
	filters: { filters, setFilter },
	isLoading,
	onReload,
}: {
	projects: ReadonlyArray<{ id: string; name: string }>;
	filters: UseDashboardFiltersResult;
	isLoading: boolean;
	onReload: () => void;
}): React.ReactElement {
	const effectiveGranularity = coarsestUsefulGranularity(filters.range, filters.granularity);
	return (
		<div className="flex flex-wrap items-center gap-2 px-3 py-2">
			<h2 className="mr-1 text-sm font-semibold text-text-primary">Dashboard</h2>
			<NativeSelect
				size="sm"
				aria-label="Project"
				value={filters.projectId ?? ""}
				onChange={(event) => setFilter("projectId", event.target.value || null)}
			>
				<option value="">All projects</option>
				{projects.map((project) => (
					<option key={project.id} value={project.id}>
						{project.name}
					</option>
				))}
			</NativeSelect>
			<NativeSelect
				size="sm"
				aria-label="Range"
				value={filters.range}
				onChange={(event) => {
					if (isDashboardRangePreset(event.target.value)) {
						setFilter("range", event.target.value);
					}
				}}
			>
				{DASHBOARD_RANGE_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</NativeSelect>
			<div role="group" aria-label="Group by" className="inline-flex rounded-md border border-border-bright p-0.5">
				{DASHBOARD_GRANULARITY_OPTIONS.map((option) => {
					const isSelected = effectiveGranularity === option.value;
					// A range too long for a finer period is shown coarser; say so by disabling it.
					const isAvailable = coarsestUsefulGranularity(filters.range, option.value) === option.value;
					return (
						<button
							key={option.value}
							type="button"
							aria-pressed={isSelected}
							disabled={!isAvailable}
							onClick={() => setFilter("granularity", option.value)}
							className={cn(
								"h-6 cursor-pointer rounded-sm border-0 px-2 text-xs font-medium disabled:cursor-default disabled:opacity-40",
								isSelected
									? "bg-surface-3 text-text-primary"
									: "bg-transparent text-text-secondary hover:text-text-primary",
							)}
						>
							{option.label}
						</button>
					);
				})}
			</div>
			<div className="ml-auto">
				<Button
					variant="ghost"
					size="sm"
					aria-label="Reload"
					title="Reload"
					icon={isLoading ? <Spinner size={14} /> : <RefreshCw size={14} />}
					onClick={onReload}
					disabled={isLoading}
				/>
			</div>
		</div>
	);
}
