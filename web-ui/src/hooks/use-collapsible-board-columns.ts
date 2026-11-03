import { useCallback } from "react";

import { LocalStorageKey } from "@/storage/local-storage-store";
import type { BoardColumnId } from "@/types";
import { useBooleanLocalStorageValue } from "@/utils/react-use";

export interface CollapsibleBoardColumns {
	/** Whether the column can fold into a narrow strip; only the board's two edge columns can. */
	isCollapsible: (columnId: BoardColumnId) => boolean;
	isCollapsed: (columnId: BoardColumnId) => boolean;
	setCollapsed: (columnId: BoardColumnId, collapsed: boolean) => void;
}

/** Remembers, across reloads, which of the Backlog and Done columns the user folded away. */
export function useCollapsibleBoardColumns(): CollapsibleBoardColumns {
	const [isBacklogCollapsed, setBacklogCollapsed] = useBooleanLocalStorageValue(
		LocalStorageKey.BoardBacklogColumnCollapsed,
		false,
	);
	const [isDoneCollapsed, setDoneCollapsed] = useBooleanLocalStorageValue(
		LocalStorageKey.BoardDoneColumnCollapsed,
		false,
	);

	const isCollapsible = useCallback((columnId: BoardColumnId) => columnId === "backlog" || columnId === "trash", []);

	const isCollapsed = useCallback(
		(columnId: BoardColumnId) =>
			(columnId === "backlog" && isBacklogCollapsed) || (columnId === "trash" && isDoneCollapsed),
		[isBacklogCollapsed, isDoneCollapsed],
	);

	const setCollapsed = useCallback(
		(columnId: BoardColumnId, collapsed: boolean) => {
			if (columnId === "backlog") {
				setBacklogCollapsed(collapsed);
			} else if (columnId === "trash") {
				setDoneCollapsed(collapsed);
			}
		},
		[setBacklogCollapsed, setDoneCollapsed],
	);

	return { isCollapsible, isCollapsed, setCollapsed };
}
