import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectsOverviewView } from "@/components/projects-overview/projects-overview-view";
import { PROJECTS_OVERVIEW_RELOAD_DELAY_MS } from "@/hooks/use-projects-overview";
import type { RuntimeProjectsOverviewCard, RuntimeProjectsOverviewResponse } from "@/runtime/types";

const mockOverviewQuery = vi.fn();

vi.mock("@/runtime/trpc-client", () => ({
	getRuntimeTrpcClient: () => ({
		projects: {
			overview: {
				query: mockOverviewQuery,
			},
		},
	}),
}));

function overviewCard(patch: Partial<RuntimeProjectsOverviewCard> & { taskId: string }): RuntimeProjectsOverviewCard {
	return {
		projectId: "web",
		column: "backlog",
		title: `Card ${patch.taskId}`,
		tags: [],
		category: null,
		priority: null,
		source: null,
		agentId: null,
		createdAt: 1,
		updatedAt: 1,
		status: null,
		pendingQuestion: null,
		activityText: null,
		sessionUpdatedAt: null,
		...patch,
	};
}

const PROJECTS = [
	{ id: "api", name: "api", path: "/code/api" },
	{ id: "web", name: "web", path: "/code/web" },
];

function overview(cards: RuntimeProjectsOverviewCard[]): RuntimeProjectsOverviewResponse {
	return { projects: PROJECTS, cards };
}

const BASE_CARDS = [
	overviewCard({ taskId: "w1", title: "Polish header", priority: "high", tags: ["ui"] }),
	overviewCard({
		taskId: "a1",
		projectId: "api",
		column: "review",
		title: "Pick a database",
		status: "awaiting_answer",
		pendingQuestion: "Which database? 1) Postgres 2) SQLite",
	}),
	overviewCard({ taskId: "a2", projectId: "api", column: "in_progress", title: "Add endpoint", status: "running" }),
	overviewCard({ taskId: "w2", column: "trash", title: "Old cleanup", category: "chore" }),
];

async function flush(ms = 0) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

describe("ProjectsOverviewView", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mockOverviewQuery.mockReset();
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	});

	function render(
		props: {
			invalidationVersions?: Record<string, number>;
			onOpenCard?: (card: RuntimeProjectsOverviewCard) => void;
		} = {},
	) {
		act(() => {
			root.render(
				<ProjectsOverviewView
					invalidationVersions={props.invalidationVersions ?? {}}
					projectIds={["api", "web"]}
					onOpenCard={props.onOpenCard ?? (() => {})}
				/>,
			);
		});
	}

	function cardIdsIn(columnId: string): string[] {
		const column = container.querySelector(`[data-overview-column="${columnId}"]`);
		return Array.from(column?.querySelectorAll("[data-overview-card]") ?? []).map(
			(element) => element.getAttribute("data-overview-card") ?? "",
		);
	}

	function visibleCardIds(): string[] {
		return Array.from(container.querySelectorAll("[data-overview-card]")).map(
			(element) => element.getAttribute("data-overview-card") ?? "",
		);
	}

	function selectOption(label: string, value: string) {
		const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
		if (!select) {
			throw new Error(`No select labelled ${label}`);
		}
		act(() => {
			select.value = value;
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
	}

	function clickButton(text: string) {
		const button = Array.from(container.querySelectorAll("button")).find((element) =>
			element.textContent?.includes(text),
		);
		if (!button) {
			throw new Error(`No button with text ${text}`);
		}
		act(() => {
			button.click();
		});
	}

	it("lays out every project's cards in their columns, with project and session state", async () => {
		mockOverviewQuery.mockResolvedValue(overview(BASE_CARDS));
		render();
		await flush();

		expect(cardIdsIn("backlog")).toEqual(["w1"]);
		expect(cardIdsIn("in_progress")).toEqual(["a2"]);
		expect(cardIdsIn("review")).toEqual(["a1"]);
		expect(cardIdsIn("trash")).toEqual(["w2"]);
		const asking = container.querySelector('[data-overview-card="a1"]');
		expect(asking?.textContent).toContain("api");
		expect(asking?.textContent).toContain("Waiting on your answer");
		expect(asking?.textContent).toContain("Which database? 1) Postgres 2) SQLite");
		expect(container.querySelector('[data-overview-card="a2"]')?.textContent).toContain("Running");
	});

	it("narrows to what needs the person, and by project, priority, tag and category", async () => {
		mockOverviewQuery.mockResolvedValue(overview(BASE_CARDS));
		render();
		await flush();

		clickButton("Needs me");
		expect(visibleCardIds()).toEqual(["a1"]);
		clickButton("Needs me");

		selectOption("Project", "web");
		expect(visibleCardIds().sort()).toEqual(["w1", "w2"]);
		selectOption("Priority", "high");
		expect(visibleCardIds()).toEqual(["w1"]);
		clickButton("Clear");
		expect(visibleCardIds()).toHaveLength(4);

		selectOption("Tag", "ui");
		expect(visibleCardIds()).toEqual(["w1"]);
		clickButton("Clear");
		selectOption("Category", "chore");
		expect(visibleCardIds()).toEqual(["w2"]);
	});

	it("orders a column by priority or by latest activity", async () => {
		mockOverviewQuery.mockResolvedValue(
			overview([
				overviewCard({ taskId: "low-recent", priority: "low", updatedAt: 50 }),
				overviewCard({ taskId: "high-old", priority: "high", updatedAt: 10 }),
				overviewCard({ taskId: "none-newest", updatedAt: 20, sessionUpdatedAt: 90 }),
			]),
		);
		render();
		await flush();

		expect(cardIdsIn("backlog")).toEqual(["high-old", "low-recent", "none-newest"]);
		selectOption("Sort by", "updated");
		expect(cardIdsIn("backlog")).toEqual(["none-newest", "low-recent", "high-old"]);
	});

	it("shows only the latest done cards until asked for all of them", async () => {
		mockOverviewQuery.mockResolvedValue(
			overview(
				Array.from({ length: 12 }, (_, index) =>
					overviewCard({ taskId: `d${index}`, column: "trash", updatedAt: index }),
				),
			),
		);
		render();
		await flush();

		expect(cardIdsIn("trash")).toHaveLength(10);
		expect(cardIdsIn("trash")[0]).toBe("d11");
		clickButton("Show all 12");
		expect(cardIdsIn("trash")).toHaveLength(12);
	});

	it("opens the clicked card", async () => {
		mockOverviewQuery.mockResolvedValue(overview(BASE_CARDS));
		const onOpenCard = vi.fn();
		render({ onOpenCard });
		await flush();

		act(() => {
			container.querySelector<HTMLButtonElement>('[data-overview-card="a1"]')?.click();
		});

		expect(onOpenCard).toHaveBeenCalledWith(expect.objectContaining({ projectId: "api", taskId: "a1" }));
	});

	it("reloads only the project the runtime says changed", async () => {
		mockOverviewQuery.mockResolvedValueOnce(overview(BASE_CARDS));
		render({ invalidationVersions: { api: 1 } });
		await flush();
		expect(mockOverviewQuery).toHaveBeenCalledWith(undefined);

		mockOverviewQuery.mockResolvedValueOnce({
			projects: [PROJECTS[0]],
			cards: [overviewCard({ taskId: "a3", projectId: "api", title: "New api card" })],
		});
		render({ invalidationVersions: { api: 2 } });
		await flush(PROJECTS_OVERVIEW_RELOAD_DELAY_MS + 50);

		expect(mockOverviewQuery).toHaveBeenLastCalledWith({ projectIds: ["api"] });
		expect(visibleCardIds().sort()).toEqual(["a3", "w1", "w2"]);
	});
});
