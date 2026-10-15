import type { RuntimeBoardColumnId, RuntimeTaskSessionSummary } from "./api-contract";

/**
 * The column a card is effectively in once its live session is taken into account.
 *
 * The board on disk lags its sessions: a card whose agent stopped to wait is still saved in
 * "in progress" until the board that shows it moves it. Anything that summarizes boards without
 * rendering them -- the project counts, the cross-project overview -- applies the same rule here
 * so the numbers and the cards never disagree.
 */
export function resolveLiveTaskColumn(
	columnId: RuntimeBoardColumnId,
	summary: Pick<RuntimeTaskSessionSummary, "state"> | null | undefined,
): RuntimeBoardColumnId {
	if (!summary) {
		return columnId;
	}
	if (summary.state === "awaiting_review" && columnId === "in_progress") {
		return "review";
	}
	if (summary.state === "interrupted" && columnId !== "trash") {
		return "trash";
	}
	return columnId;
}

/** A project's display name: the last segment of its repository path. */
export function resolveProjectName(repoPath: string): string {
	const normalized = repoPath.replaceAll("\\", "/").replace(/\/+$/g, "");
	const segments = normalized.split("/").filter((segment) => segment.length > 0);
	return segments[segments.length - 1] ?? normalized;
}
