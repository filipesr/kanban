/**
 * Shared look of the dashboard charts. Series colors are the `--color-chart-*` tokens, in their
 * fixed order; text and grid use the app's own ink and border tokens so charts follow the theme.
 */

export const CHART_SERIES = {
	created: { label: "Created", color: "var(--color-chart-1)" },
	started: { label: "Started", color: "var(--color-chart-2)" },
	reviewed: { label: "Reviewed", color: "var(--color-chart-3)" },
	completed: { label: "Completed", color: "var(--color-chart-4)" },
} as const;

export const WIP_SERIES = {
	backlog: { label: "Backlog", color: "var(--color-chart-1)" },
	in_progress: { label: "In progress", color: "var(--color-chart-2)" },
	review: { label: "Review", color: "var(--color-chart-3)" },
	trash: { label: "Done", color: "var(--color-chart-4)" },
} as const;

export const CODE_SERIES = {
	commits: { label: "Commits", color: "var(--color-chart-1)" },
	additions: { label: "Lines added", color: "var(--color-chart-1)" },
	deletions: { label: "Lines removed", color: "var(--color-chart-2)" },
} as const;

export const CHART_HEIGHT = 220;

export const AXIS_TICK = { fill: "var(--color-text-tertiary)", fontSize: 11 } as const;
export const AXIS_LINE = { stroke: "var(--color-border)" } as const;
export const GRID_STROKE = "var(--color-border)";
export const CURSOR_FILL = "var(--color-surface-3)";
/** Gap between adjacent fills, in the surface color, so touching bars stay distinguishable. */
export const MARK_GAP_STROKE = "var(--color-surface-1)";
