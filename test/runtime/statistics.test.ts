import { describe, expect, it } from "vitest";

import type { RuntimeBoardCard, RuntimeBoardData, RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import type { RuntimeTaskEvent, RuntimeTaskEventCardSnapshot } from "../../src/core/task-events";
import { buildStatistics, type StatisticsDependencies } from "../../src/server/statistics";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 2026-10-12 00:00 UTC. */
const MONDAY = Date.UTC(2026, 9, 12);

function card(id: string, patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id,
		title: id,
		prompt: id,
		startInPlanMode: false,
		baseRef: "main",
		createdAt: MONDAY,
		updatedAt: MONDAY,
		...patch,
	};
}

function board(columns: Partial<Record<"backlog" | "in_progress" | "review" | "trash", RuntimeBoardCard[]>>) {
	return {
		columns: (["backlog", "in_progress", "review", "trash"] as const).map((id) => ({
			id,
			title: id,
			cards: columns[id] ?? [],
		})),
		dependencies: [],
	} satisfies RuntimeBoardData;
}

function snapshot(createdAt = MONDAY): RuntimeTaskEventCardSnapshot {
	return { title: "x", createdAt, agentId: null, priority: null, tags: [] };
}

function moved(taskId: string, from: "backlog" | "in_progress" | "review" | "trash", to: typeof from, at: number) {
	return { type: "card_moved", taskId, at, from, to, card: snapshot() } satisfies RuntimeTaskEvent;
}

function session(
	taskId: string,
	from: RuntimeTaskSessionSummary["state"] | null,
	to: RuntimeTaskSessionSummary["state"],
	at: number,
) {
	return {
		type: "session_state_changed",
		taskId,
		at,
		from,
		to,
		reviewReason: null,
		agentId: "claude",
	} satisfies RuntimeTaskEvent;
}

function deps(
	projects: Record<
		string,
		{
			board: RuntimeBoardData;
			events?: RuntimeTaskEvent[];
			commits?: number[];
			sessions?: Record<string, RuntimeTaskSessionSummary["state"]>;
		}
	>,
): StatisticsDependencies {
	return {
		listProjects: async () => Object.keys(projects).map((id) => ({ workspaceId: id, repoPath: `/code/${id}` })),
		loadBoard: async (id) => projects[id]?.board ?? board({}),
		loadPersistedSessions: async () => ({}),
		listLiveSessions: (id) =>
			Object.entries(projects[id]?.sessions ?? {}).map(
				([taskId, state]) => ({ taskId, state, updatedAt: 0 }) as RuntimeTaskSessionSummary,
			),
		loadEvents: async (id) => projects[id]?.events ?? [],
		loadCommits: async (project) =>
			(projects[project.workspaceId]?.commits ?? []).map((at) => ({
				at,
				filesChanged: 2,
				filesCreated: 1,
				additions: 10,
				deletions: 3,
			})),
		now: () => MONDAY + 6 * DAY,
	};
}

const WEEK_BY_DAY = { granularity: "day" as const, from: MONDAY, to: MONDAY + 7 * DAY - 1, timeZone: "UTC" };

describe("buildStatistics", () => {
	it("counts the flow of a card through the columns, with the time it spent in each", async () => {
		const statistics = await buildStatistics(
			deps({
				a: {
					board: board({ trash: [card("t1")] }),
					events: [
						{ type: "card_created", taskId: "t1", at: MONDAY, column: "backlog", card: snapshot() },
						moved("t1", "backlog", "in_progress", MONDAY + DAY),
						moved("t1", "in_progress", "review", MONDAY + DAY + 3 * HOUR),
						moved("t1", "review", "in_progress", MONDAY + DAY + 4 * HOUR),
						moved("t1", "in_progress", "review", MONDAY + DAY + 5 * HOUR),
						moved("t1", "review", "trash", MONDAY + 2 * DAY),
					],
				},
			}),
			WEEK_BY_DAY,
		);

		expect(statistics.buckets.map((bucket) => bucket.key)).toHaveLength(7);
		expect(statistics.buckets[0]).toMatchObject({ key: "2026-10-12", created: 1 });
		// Back to In Progress and to Review again on the same day: still one card started, one reviewed.
		expect(statistics.buckets[1]).toMatchObject({ key: "2026-10-13", started: 1, reviewed: 1 });
		expect(statistics.buckets[2]).toMatchObject({ key: "2026-10-14", completed: 1 });
		expect(statistics.durations.leadTime).toEqual({ count: 1, meanMs: 2 * DAY, medianMs: 2 * DAY });
		expect(statistics.durations.inProgress).toEqual({ count: 2, meanMs: 2 * HOUR, medianMs: 2 * HOUR });
		expect(statistics.durations.inReview.count).toBe(2);
		expect(statistics.rates.completionRate).toBe(1);
		expect(statistics.flowDataSince).toBe(MONDAY);
	});

	it("leaves out stays that began before the log, and dates old finished cards by their last update", async () => {
		const statistics = await buildStatistics(
			deps({
				a: {
					board: board({
						review: [card("old", { createdAt: MONDAY - 30 * DAY })],
						trash: [card("done-before-log", { createdAt: MONDAY - 30 * DAY, updatedAt: MONDAY + 3 * DAY })],
					}),
					events: [moved("old", "in_progress", "review", MONDAY + DAY)],
				},
			}),
			WEEK_BY_DAY,
		);

		expect(statistics.durations.inProgress.count).toBe(0);
		expect(statistics.totals.created).toBe(0);
		expect(statistics.buckets[3]).toMatchObject({ key: "2026-10-15", completed: 1 });
		expect(statistics.durations.leadTime.count).toBe(0);
	});

	it("keeps the history of a card deleted with the trash", async () => {
		const statistics = await buildStatistics(
			deps({
				a: {
					board: board({}),
					events: [
						{ type: "card_created", taskId: "gone", at: MONDAY, column: "backlog", card: snapshot() },
						moved("gone", "backlog", "trash", MONDAY + DAY),
						{ type: "card_deleted", taskId: "gone", at: MONDAY + 2 * DAY, from: "trash", card: snapshot() },
					],
				},
			}),
			WEEK_BY_DAY,
		);
		expect(statistics.totals).toMatchObject({ created: 1, completed: 1 });
	});

	it("sums agent runs, counting a run still going up to now only if the session still runs", async () => {
		const statistics = await buildStatistics(
			deps({
				a: {
					board: board({ in_progress: [card("t1"), card("t2"), card("t3")] }),
					sessions: { t1: "awaiting_review", t2: "running" },
					events: [
						session("t1", "idle", "running", MONDAY),
						session("t1", "running", "awaiting_review", MONDAY + HOUR),
						session("t2", "idle", "running", MONDAY + 6 * DAY - 2 * HOUR),
						// Never ended in the log, and not running now: no known length.
						session("t3", "idle", "running", MONDAY + DAY),
					],
				},
			}),
			WEEK_BY_DAY,
		);
		expect(statistics.totals.agentWorkMs).toBe(3 * HOUR);
		expect(statistics.durations.agentRun).toEqual({ count: 1, meanMs: HOUR, medianMs: HOUR });
		// t1 waits for review: its live column is Review, not In Progress.
		expect(statistics.wip).toEqual({ backlog: 0, in_progress: 2, review: 1, trash: 0 });
	});

	it("adds git stats and splits totals per project, or keeps to one project", async () => {
		const projects = {
			a: { board: board({ backlog: [card("x")] }), commits: [MONDAY + HOUR, MONDAY + 8 * DAY] },
			b: { board: board({ review: [card("y")] }), commits: [MONDAY + 2 * DAY] },
		};
		const all = await buildStatistics(deps(projects), { ...WEEK_BY_DAY, granularity: "week" });
		expect(all.buckets).toHaveLength(1);
		expect(all.totals).toMatchObject({ commits: 2, filesChanged: 4, filesCreated: 2, additions: 20, deletions: 6 });
		expect(all.projects.map((project) => [project.name, project.totals.commits])).toEqual([
			["a", 1],
			["b", 1],
		]);
		expect(all.rates.reviewShare).toBe(0.5);

		const one = await buildStatistics(deps(projects), { ...WEEK_BY_DAY, projectId: "b" });
		expect(one.projects.map((project) => project.id)).toEqual(["b"]);
		expect(one.totals.commits).toBe(1);
	});

	it("still reports a project whose git history cannot be read", async () => {
		const dependencies = deps({ a: { board: board({ backlog: [card("x")] }) } });
		dependencies.loadCommits = async () => {
			throw new Error("not a git repository");
		};
		const statistics = await buildStatistics(dependencies, WEEK_BY_DAY);
		expect(statistics.projects[0]).toMatchObject({ gitError: "not a git repository", wip: { backlog: 1 } });
		expect(statistics.totals.created).toBe(1);
	});
});
