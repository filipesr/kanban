import { useCallback, useState } from "react";

import { useLayoutResetEffect } from "@/resize/layout-customizations";
import { clampBetween } from "@/resize/resize-persistence";
import {
	getResizePreferenceDefaultValue,
	loadBooleanResizePreference,
	loadResizePreference,
	persistBooleanResizePreference,
	persistResizePreference,
	type ResizeBooleanPreference,
	type ResizeNumberPreference,
} from "@/resize/resize-preferences";
import { LocalStorageKey } from "@/storage/local-storage-store";

const TASK_CARDS_RATIO_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.DetailTaskCardsPanelRatio,
	defaultValue: 0.2,
	normalize: (value) => clampBetween(value, 0.14, 0.4),
};

const AGENT_RATIO_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.DetailAgentPanelRatio,
	defaultValue: 0.4,
	normalize: (value) => clampBetween(value, 0.15, 0.75),
};

const COLLAPSED_DIFF_FILE_TREE_RATIO_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.DetailDiffFileTreePanelRatio,
	defaultValue: 0.3333,
	normalize: (value) => clampBetween(value, 0.12, 0.6),
};

const EXPANDED_DIFF_FILE_TREE_RATIO_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.DetailExpandedDiffFileTreePanelRatio,
	defaultValue: 0.16,
	normalize: (value) => clampBetween(value, 0.12, 0.6),
};

const DIFF_PANEL_HIDDEN_PREFERENCE: ResizeBooleanPreference = {
	key: LocalStorageKey.DetailDiffPanelHidden,
	defaultValue: false,
};

export function useCardDetailLayout({ isDiffExpanded }: { isDiffExpanded: boolean }): {
	agentPanelRatio: number;
	detailDiffFileTreeRatio: number;
	isDiffPanelHidden: boolean;
	setAgentPanelRatio: (ratio: number) => void;
	setDetailDiffFileTreeRatio: (ratio: number) => void;
	setDiffPanelHidden: (hidden: boolean) => void;
	setTaskCardsPanelRatio: (ratio: number) => void;
	taskCardsPanelRatio: number;
} {
	const [taskCardsPanelRatio, setTaskCardsPanelRatioState] = useState(() =>
		loadResizePreference(TASK_CARDS_RATIO_PREFERENCE),
	);
	const [agentPanelRatio, setAgentPanelRatioState] = useState(() => loadResizePreference(AGENT_RATIO_PREFERENCE));
	const [collapsedDetailDiffFileTreeRatio, setCollapsedDetailDiffFileTreeRatioState] = useState(() =>
		loadResizePreference(COLLAPSED_DIFF_FILE_TREE_RATIO_PREFERENCE),
	);
	const [expandedDetailDiffFileTreeRatio, setExpandedDetailDiffFileTreeRatioState] = useState(() =>
		loadResizePreference(EXPANDED_DIFF_FILE_TREE_RATIO_PREFERENCE),
	);
	const [isDiffPanelHidden, setIsDiffPanelHiddenState] = useState(() =>
		loadBooleanResizePreference(DIFF_PANEL_HIDDEN_PREFERENCE),
	);

	const setTaskCardsPanelRatio = useCallback((ratio: number) => {
		setTaskCardsPanelRatioState(persistResizePreference(TASK_CARDS_RATIO_PREFERENCE, ratio));
	}, []);

	const setAgentPanelRatio = useCallback((ratio: number) => {
		setAgentPanelRatioState(persistResizePreference(AGENT_RATIO_PREFERENCE, ratio));
	}, []);

	const setDetailDiffFileTreeRatio = useCallback(
		(ratio: number) => {
			if (isDiffExpanded) {
				setExpandedDetailDiffFileTreeRatioState(
					persistResizePreference(EXPANDED_DIFF_FILE_TREE_RATIO_PREFERENCE, ratio),
				);
				return;
			}
			setCollapsedDetailDiffFileTreeRatioState(
				persistResizePreference(COLLAPSED_DIFF_FILE_TREE_RATIO_PREFERENCE, ratio),
			);
		},
		[isDiffExpanded],
	);

	const setDiffPanelHidden = useCallback((hidden: boolean) => {
		setIsDiffPanelHiddenState(persistBooleanResizePreference(DIFF_PANEL_HIDDEN_PREFERENCE, hidden));
	}, []);

	useLayoutResetEffect(() => {
		setTaskCardsPanelRatioState(getResizePreferenceDefaultValue(TASK_CARDS_RATIO_PREFERENCE));
		setAgentPanelRatioState(getResizePreferenceDefaultValue(AGENT_RATIO_PREFERENCE));
		setCollapsedDetailDiffFileTreeRatioState(
			getResizePreferenceDefaultValue(COLLAPSED_DIFF_FILE_TREE_RATIO_PREFERENCE),
		);
		setExpandedDetailDiffFileTreeRatioState(
			getResizePreferenceDefaultValue(EXPANDED_DIFF_FILE_TREE_RATIO_PREFERENCE),
		);
		setIsDiffPanelHiddenState(DIFF_PANEL_HIDDEN_PREFERENCE.defaultValue);
	});

	return {
		taskCardsPanelRatio,
		setTaskCardsPanelRatio,
		agentPanelRatio,
		setAgentPanelRatio,
		detailDiffFileTreeRatio: isDiffExpanded ? expandedDetailDiffFileTreeRatio : collapsedDetailDiffFileTreeRatio,
		setDetailDiffFileTreeRatio,
		isDiffPanelHidden,
		setDiffPanelHidden,
	};
}
