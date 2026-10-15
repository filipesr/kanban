import { MessageCircleQuestion, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { UseProjectsOverviewBoardResult } from "@/hooks/use-projects-overview-board";
import type { RuntimeProjectsOverviewProject } from "@/runtime/types";
import type { ProjectsOverviewPriorityFilter } from "@/utils/projects-overview";

const PRIORITY_OPTIONS: Array<{ value: ProjectsOverviewPriorityFilter; label: string }> = [
	{ value: "high", label: "High" },
	{ value: "medium", label: "Medium" },
	{ value: "low", label: "Low" },
	{ value: "none", label: "No priority" },
];

function isPriorityFilter(value: string): value is ProjectsOverviewPriorityFilter {
	return PRIORITY_OPTIONS.some((option) => option.value === value);
}

function FilterSelect({
	label,
	value,
	onChange,
	children,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<NativeSelect size="sm" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
			{children}
		</NativeSelect>
	);
}

export function ProjectsOverviewToolbar({
	board,
	projects,
	isLoading,
	onReload,
}: {
	board: UseProjectsOverviewBoardResult;
	projects: RuntimeProjectsOverviewProject[];
	isLoading: boolean;
	onReload: () => void;
}): React.ReactElement {
	const { filters, setFilter, facets } = board;

	return (
		<div className="flex flex-wrap items-center gap-2 px-3 py-2">
			<h2 className="mr-1 text-sm font-semibold text-text-primary">All projects</h2>
			<button
				type="button"
				aria-pressed={filters.onlyNeedsMe}
				onClick={() => setFilter("onlyNeedsMe", !filters.onlyNeedsMe)}
				className={cn(
					"inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
					filters.onlyNeedsMe
						? "border-status-orange/60 bg-status-orange/15 text-status-orange"
						: "border-border-bright bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary",
				)}
			>
				<MessageCircleQuestion size={14} />
				Needs me
				<span
					className={cn(
						"rounded-full px-1.5 text-[11px]",
						board.needsAttentionCount > 0 ? "bg-status-orange/20 text-status-orange" : "bg-surface-3",
					)}
				>
					{board.needsAttentionCount}
				</span>
			</button>
			<FilterSelect
				label="Project"
				value={filters.projectId ?? ""}
				onChange={(value) => setFilter("projectId", value || null)}
			>
				<option value="">All projects</option>
				{projects.map((project) => (
					<option key={project.id} value={project.id}>
						{project.name}
					</option>
				))}
			</FilterSelect>
			<FilterSelect
				label="Priority"
				value={filters.priority ?? ""}
				onChange={(value) => setFilter("priority", isPriorityFilter(value) ? value : null)}
			>
				<option value="">Any priority</option>
				{PRIORITY_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</FilterSelect>
			{facets.tags.length > 0 ? (
				<FilterSelect label="Tag" value={filters.tag ?? ""} onChange={(value) => setFilter("tag", value || null)}>
					<option value="">Any tag</option>
					{facets.tags.map((tag) => (
						<option key={tag} value={tag}>
							{tag}
						</option>
					))}
				</FilterSelect>
			) : null}
			{facets.categories.length > 0 ? (
				<FilterSelect
					label="Category"
					value={filters.category ?? ""}
					onChange={(value) => setFilter("category", value || null)}
				>
					<option value="">Any category</option>
					{facets.categories.map((category) => (
						<option key={category} value={category}>
							{category}
						</option>
					))}
				</FilterSelect>
			) : null}
			{board.hasActiveFilters ? (
				<Button variant="ghost" size="sm" icon={<X size={14} />} onClick={board.clearFilters}>
					Clear
				</Button>
			) : null}
			<div className="ml-auto flex items-center gap-2">
				<FilterSelect
					label="Sort by"
					value={board.sort}
					onChange={(value) => board.setSort(value === "updated" ? "updated" : "priority")}
				>
					<option value="priority">Sort: priority</option>
					<option value="updated">Sort: recently updated</option>
				</FilterSelect>
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
