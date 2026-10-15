import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PROJECT_STATISTICS_RELOAD_DELAY_MS } from "@/hooks/use-project-statistics";
import type { RuntimeStatisticsCounts, RuntimeStatisticsRequest, RuntimeStatisticsResponse } from "@/runtime/types";

const mockStatisticsQuery = vi.fn<(request: RuntimeStatisticsRequest) => Promise<RuntimeStatisticsResponse>>();

vi.mock("@/runtime/trpc-client", () => ({
	getRuntimeTrpcClient: () => ({
		projects: {
			statistics: {
				query: mockStatisticsQuery,
			},
		},
	}),
}));

function counts(patch: Partial<RuntimeStatisticsCounts> = {}): RuntimeStatisticsCounts {
	return {
		created: 0,
		started: 0,
		reviewed: 0,
		completed: 0,
		commits: 0,
		filesChanged: 0,
		filesCreated: 0,
		additions: 0,
		deletions: 0,
		agentWorkMs: 0,
		...patch,
	};
}

function statistics(patch: Partial<RuntimeStatisticsResponse> = {}): RuntimeStatisticsResponse {
	const totals = counts({
		created: 8,
		completed: 6,
		commits: 12,
		additions: 1_234,
		deletions: 56,
		agentWorkMs: 3 * 3_600_000,
	});
	return {
		granularity: "day",
		timeZone: "UTC",
		from: 0,
		to: 1,
		generatedAt: 1,
		flowDataSince: Date.UTC(2026, 9, 1),
		projects: [
			{
				id: "api",
				name: "api",
				path: "/code/api",
				totals,
				wip: { backlog: 2, in_progress: 1, review: 1, trash: 6 },
				flowDataSince: Date.UTC(2026, 9, 1),
				gitError: null,
			},
		],
		buckets: [
			{ key: "2026-10-14", ...counts({ created: 3 }) },
			{ key: "2026-10-15", ...counts({ created: 5, completed: 6 }) },
		],
		totals,
		wip: { backlog: 2, in_progress: 1, review: 1, trash: 6 },
		rates: { completionRate: 0.75, reviewShare: 0.25 },
		durations: {
			leadTime: { count: 6, meanMs: 2 * 86_400_000, medianMs: 5 * 3_600_000 },
			inProgress: { count: 0, meanMs: null, medianMs: null },
			inReview: { count: 0, meanMs: null, medianMs: null },
			agentRun: { count: 4, meanMs: 45 * 60_000, medianMs: 30 * 60_000 },
		},
		...patch,
	};
}

async function flush(ms = 0) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

describe("DashboardView", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mockStatisticsQuery.mockReset();
		mockStatisticsQuery.mockResolvedValue(statistics());
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	});

	function render(invalidationVersions: Record<string, number> = {}) {
		act(() => {
			root.render(
				<DashboardView
					projects={[
						{ id: "api", name: "api" },
						{ id: "web", name: "web" },
					]}
					invalidationVersions={invalidationVersions}
				/>,
			);
		});
	}

	function tileValue(label: string): string | null {
		const term = Array.from(container.querySelectorAll("dt")).find((element) => element.textContent === label);
		return term?.nextElementSibling?.textContent ?? null;
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

	it("shows totals, rates and times as KPI tiles, and says since when flow is recorded", async () => {
		render();
		await flush();

		expect(tileValue("Created")).toBe("8");
		expect(tileValue("Completed")).toBe("6");
		expect(container.textContent).toContain("75% of created");
		expect(tileValue("In review now")).toBe("1");
		expect(container.textContent).toContain("25% of open");
		expect(tileValue("Lead time")).toBe("5h");
		expect(tileValue("Agent work")).toBe("3h");
		expect(tileValue("Lines")).toBe(`+${(1_234).toLocaleString()}`);
		expect(container.textContent).toContain("recorded since");
		const tables = container.querySelectorAll("table");
		expect(tables[tables.length - 1]?.textContent).toContain("api");
	});

	it("asks for the chosen project, range and grouping in the viewer's time zone", async () => {
		render();
		await flush();
		expect(mockStatisticsQuery.mock.calls[0]?.[0]).toMatchObject({
			projectId: null,
			granularity: "day",
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		});

		selectOption("Project", "web");
		await flush();
		expect(mockStatisticsQuery.mock.lastCall?.[0]).toMatchObject({ projectId: "web" });

		act(() => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent === "Week")
				?.click();
		});
		await flush();
		expect(mockStatisticsQuery.mock.lastCall?.[0]).toMatchObject({ granularity: "week" });

		// A year by day would be 365 bars: it is grouped by week instead.
		selectOption("Range", "12m");
		await flush();
		const yearRequest = mockStatisticsQuery.mock.lastCall?.[0];
		expect(yearRequest?.granularity).toBe("week");
		expect((yearRequest?.to ?? 0) - (yearRequest?.from ?? 0)).toBeGreaterThan(360 * 86_400_000);
	});

	it("recomputes once a project in scope changes, not for each change", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			render({ api: 1 });
			await flush();
			const callsAfterOpen = mockStatisticsQuery.mock.calls.length;

			render({ api: 2 });
			render({ api: 3 });
			await act(async () => {
				await vi.advanceTimersByTimeAsync(PROJECT_STATISTICS_RELOAD_DELAY_MS + 10);
			});
			expect(mockStatisticsQuery.mock.calls.length).toBe(callsAfterOpen + 1);
		} finally {
			vi.useRealTimers();
		}
	});
});
