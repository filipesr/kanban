/**
 * One colour per column, read as a progression: waiting is grey, working is blue, needing you
 * is orange, finished is green. Done was red, which read as a failure for the one state that is
 * a success.
 *
 * The project list uses the same scale, so a column and its badge never disagree.
 */
export const columnIndicatorColors: Record<string, string> = {
	backlog: "var(--color-text-tertiary)",
	in_progress: "var(--color-status-blue)",
	review: "var(--color-status-orange)",
	trash: "var(--color-status-green)",
};

export const columnBackgroundColors: Record<string, string> = {
	backlog: "var(--color-surface-0)",
	in_progress: "var(--color-surface-0)",
	review: "var(--color-surface-0)",
	trash: "var(--color-surface-0)",
};
