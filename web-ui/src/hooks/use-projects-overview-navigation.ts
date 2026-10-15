import { useCallback, useEffect, useState } from "react";

import { notifyError } from "@/components/app-toaster";
import { findCardSelection } from "@/state/board-state";
import type { BoardData } from "@/types";

/**
 * How long to wait for the target project's board before giving up on opening a card. Only
 * reached when the card vanished between the click and the load -- deleted elsewhere, say.
 */
export const OVERVIEW_CARD_OPEN_TIMEOUT_MS = 10_000;

interface PendingCardOpen {
	projectId: string;
	taskId: string;
}

interface UseProjectsOverviewNavigationInput {
	currentProjectId: string | null;
	board: BoardData;
	/** True while the board in hand is not yet the current project's. */
	isBoardPending: boolean;
	selectProject: (projectId: string) => void;
	openTask: (taskId: string) => void;
}

export interface UseProjectsOverviewNavigationResult {
	isOverviewOpen: boolean;
	openOverview: () => void;
	closeOverview: () => void;
	/** Leave the overview for this card: switch to its project if needed, then open it. */
	openOverviewCard: (projectId: string, taskId: string) => void;
}

/**
 * Opening a card of another project takes two steps that cannot happen together: switching
 * projects drops whatever card was open, and the card can only open once the new board has
 * loaded. The request is kept until then.
 */
export function useProjectsOverviewNavigation({
	currentProjectId,
	board,
	isBoardPending,
	selectProject,
	openTask,
}: UseProjectsOverviewNavigationInput): UseProjectsOverviewNavigationResult {
	const [isOverviewOpen, setIsOverviewOpen] = useState(false);
	const [pendingCardOpen, setPendingCardOpen] = useState<PendingCardOpen | null>(null);

	const openOverview = useCallback(() => {
		setIsOverviewOpen(true);
	}, []);

	const closeOverview = useCallback(() => {
		setIsOverviewOpen(false);
	}, []);

	const openOverviewCard = useCallback(
		(projectId: string, taskId: string) => {
			setIsOverviewOpen(false);
			setPendingCardOpen({ projectId, taskId });
			if (projectId !== currentProjectId) {
				selectProject(projectId);
			}
		},
		[currentProjectId, selectProject],
	);

	useEffect(() => {
		if (!pendingCardOpen || pendingCardOpen.projectId !== currentProjectId || isBoardPending) {
			return;
		}
		if (!findCardSelection(board, pendingCardOpen.taskId)) {
			return;
		}
		setPendingCardOpen(null);
		openTask(pendingCardOpen.taskId);
	}, [board, currentProjectId, isBoardPending, openTask, pendingCardOpen]);

	useEffect(() => {
		if (!pendingCardOpen) {
			return;
		}
		const timer = window.setTimeout(() => {
			setPendingCardOpen(null);
			notifyError("That card is no longer on its board.");
		}, OVERVIEW_CARD_OPEN_TIMEOUT_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [pendingCardOpen]);

	return { isOverviewOpen, openOverview, closeOverview, openOverviewCard };
}
