import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	type UseProjectsOverviewNavigationResult,
	useProjectsOverviewNavigation,
} from "@/hooks/use-projects-overview-navigation";
import type { BoardData } from "@/types";

vi.mock("@/components/app-toaster", () => ({
	notifyError: vi.fn(),
}));

function boardWith(taskIds: string[]): BoardData {
	return {
		columns: [
			{
				id: "backlog",
				title: "Backlog",
				cards: taskIds.map((id) => ({
					id,
					title: id,
					prompt: id,
					startInPlanMode: false,
					baseRef: "main",
					createdAt: 0,
					updatedAt: 0,
				})),
			},
		],
		dependencies: [],
	} as BoardData;
}

interface HarnessProps {
	currentProjectId: string | null;
	board: BoardData;
	isBoardPending: boolean;
}

describe("useProjectsOverviewNavigation", () => {
	let container: HTMLDivElement;
	let root: Root;
	let result: UseProjectsOverviewNavigationResult | null;
	const selectProject = vi.fn();
	const openTask = vi.fn();

	function Harness(props: HarnessProps): null {
		result = useProjectsOverviewNavigation({ ...props, selectProject, openTask });
		return null;
	}

	function render(props: HarnessProps) {
		act(() => {
			root.render(<Harness {...props} />);
		});
	}

	beforeEach(() => {
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		root = createRoot(container);
		result = null;
		selectProject.mockReset();
		openTask.mockReset();
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	});

	it("switches project, then opens the card once that project's board has it", () => {
		render({ currentProjectId: "web", board: boardWith(["w1"]), isBoardPending: false });
		act(() => {
			result?.openOverview();
		});
		expect(result?.isOverviewOpen).toBe(true);

		act(() => {
			result?.openOverviewCard("api", "a1");
		});
		expect(result?.isOverviewOpen).toBe(false);
		expect(selectProject).toHaveBeenCalledWith("api");
		expect(openTask).not.toHaveBeenCalled();

		render({ currentProjectId: "api", board: boardWith(["w1"]), isBoardPending: true });
		expect(openTask).not.toHaveBeenCalled();

		render({ currentProjectId: "api", board: boardWith(["a1"]), isBoardPending: false });
		expect(openTask).toHaveBeenCalledWith("a1");
	});

	it("opens a card of the current project without switching", () => {
		render({ currentProjectId: "web", board: boardWith(["w1"]), isBoardPending: false });

		act(() => {
			result?.openOverviewCard("web", "w1");
		});

		expect(selectProject).not.toHaveBeenCalled();
		expect(openTask).toHaveBeenCalledWith("w1");
	});
});
