import { describe, expect, it, type Mock, vi } from "vitest";

import {
	type RuntimeBoardCard,
	type RuntimeBoardColumnId,
	type RuntimeBoardData,
	type RuntimeTaskSessionSummary,
	runtimeBoardDataSchema,
} from "../../src/core/api-contract";
import { buildProjectsOverview, type ProjectsOverviewDependencies } from "../../src/server/projects-overview";

function card(id: string, patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id,
		title: `Card ${id}`,
		prompt: `Do ${id}`,
		startInPlanMode: false,
		baseRef: "main",
		createdAt: 1,
		updatedAt: 2,
		...patch,
	};
}

function board(columns: Partial<Record<RuntimeBoardColumnId, RuntimeBoardCard[]>>): RuntimeBoardData {
	return {
		columns: (["backlog", "in_progress", "review", "trash"] as const).map((id) => ({
			id,
			title: id,
			cards: columns[id] ?? [],
		})),
		dependencies: [],
	};
}

function session(taskId: string, patch: Partial<RuntimeTaskSessionSummary> = {}): RuntimeTaskSessionSummary {
	return {
		taskId,
		state: "idle",
		agentId: "claude",
		workspacePath: null,
		pid: null,
		startedAt: null,
		updatedAt: 10,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		warningMessage: null,
		latestTurnCheckpoint: null,
		previousTurnCheckpoint: null,
		...patch,
	};
}

function deps(input: {
	projects: Array<{ workspaceId: string; repoPath: string }>;
	boards: Record<string, RuntimeBoardData | Error>;
	persisted?: Record<string, Record<string, RuntimeTaskSessionSummary>>;
	live?: Record<string, RuntimeTaskSessionSummary[]>;
}): ProjectsOverviewDependencies & { warn: Mock<(message: string) => void> } {
	return {
		listProjects: async () => input.projects,
		loadBoard: async (workspaceId) => {
			const found = input.boards[workspaceId];
			if (found instanceof Error) {
				throw found;
			}
			// What workspace-state returns for a project that never saved a board.
			return found ?? board({});
		},
		loadPersistedSessions: async (workspaceId) => input.persisted?.[workspaceId] ?? {},
		listLiveSessions: (workspaceId) => input.live?.[workspaceId] ?? [],
		warn: vi.fn<(message: string) => void>(),
	};
}

describe("buildProjectsOverview", () => {
	it("flattens the cards of every project, tagged with their project", async () => {
		const overview = await buildProjectsOverview(
			deps({
				projects: [
					{ workspaceId: "web", repoPath: "/code/web" },
					{ workspaceId: "api", repoPath: "/code/api" },
				],
				boards: {
					web: board({ backlog: [card("w1", { tags: ["ui"], priority: "high", category: "bug" })] }),
					api: board({ in_progress: [card("a1")], review: [card("a2")] }),
				},
			}),
		);

		expect(overview.projects.map((project) => project.name)).toEqual(["api", "web"]);
		expect(overview.cards.map((entry) => [entry.projectId, entry.taskId, entry.column])).toEqual([
			["web", "w1", "backlog"],
			["api", "a1", "in_progress"],
			["api", "a2", "review"],
		]);
		expect(overview.cards[0]).toMatchObject({
			title: "Card w1",
			tags: ["ui"],
			priority: "high",
			category: "bug",
			status: null,
			pendingQuestion: null,
		});
	});

	it("lists a project with no board, and one whose board cannot be read, without cards", async () => {
		const dependencies = deps({
			projects: [
				{ workspaceId: "empty", repoPath: "/code/empty" },
				{ workspaceId: "broken", repoPath: "/code/broken" },
				{ workspaceId: "ok", repoPath: "/code/ok" },
			],
			boards: { broken: new Error("bad json"), ok: board({ backlog: [card("k1")] }) },
		});

		const overview = await buildProjectsOverview(dependencies);

		expect(overview.projects.map((project) => project.id).sort()).toEqual(["broken", "empty", "ok"]);
		expect(overview.cards.map((entry) => entry.taskId)).toEqual(["k1"]);
		expect(dependencies.warn).toHaveBeenCalledWith(expect.stringContaining("/code/broken"));
	});

	it("keeps trash cards, including ones saved under the legacy done column", async () => {
		const legacy = runtimeBoardDataSchema.parse({
			columns: [{ id: "done", title: "Done", cards: [card("old")] }],
		});
		const overview = await buildProjectsOverview(
			deps({
				projects: [{ workspaceId: "p", repoPath: "/code/p" }],
				boards: { p: legacy },
			}),
		);

		expect(overview.cards).toEqual([expect.objectContaining({ taskId: "old", column: "trash" })]);
	});

	it("surfaces the pending question of a card waiting on an answer, in the review column", async () => {
		const overview = await buildProjectsOverview(
			deps({
				projects: [{ workspaceId: "p", repoPath: "/code/p" }],
				boards: { p: board({ in_progress: [card("q")] }) },
				live: {
					p: [
						session("q", {
							state: "awaiting_review",
							reviewReason: "hook",
							latestHookActivity: {
								activityText: "Which database? 1) Postgres 2) SQLite",
								toolName: "AskUserQuestion",
								toolInputSummary: null,
								finalMessage: null,
								hookEventName: "PermissionRequest",
								notificationType: null,
								source: "claude",
							},
						}),
					],
				},
			}),
		);

		expect(overview.cards[0]).toMatchObject({
			column: "review",
			status: "awaiting_answer",
			pendingQuestion: "AskUserQuestion: Which database? 1) Postgres 2) SQLite",
			activityText: null,
		});
	});

	it("prefers the newer of the live and persisted sessions", async () => {
		const overview = await buildProjectsOverview(
			deps({
				projects: [{ workspaceId: "p", repoPath: "/code/p" }],
				boards: { p: board({ in_progress: [card("fresh"), card("stale")] }) },
				persisted: {
					p: {
						fresh: session("fresh", { state: "running", updatedAt: 5 }),
						stale: session("stale", { state: "failed", updatedAt: 50, warningMessage: "crashed" }),
					},
				},
				live: {
					p: [
						session("fresh", { state: "failed", updatedAt: 20, warningMessage: "boom" }),
						session("stale", { state: "running", updatedAt: 1 }),
					],
				},
			}),
		);

		expect(overview.cards.map((entry) => [entry.taskId, entry.status, entry.activityText])).toEqual([
			["fresh", "failed", "boom"],
			["stale", "failed", "crashed"],
		]);
	});

	it("only loads the requested projects", async () => {
		const dependencies = deps({
			projects: [
				{ workspaceId: "a", repoPath: "/code/a" },
				{ workspaceId: "b", repoPath: "/code/b" },
			],
			boards: { a: board({ backlog: [card("a1")] }), b: board({ backlog: [card("b1")] }) },
		});
		const loadBoard = vi.spyOn(dependencies, "loadBoard");

		const overview = await buildProjectsOverview(dependencies, { projectIds: ["b"] });

		expect(overview.projects.map((project) => project.id)).toEqual(["b"]);
		expect(overview.cards.map((entry) => entry.taskId)).toEqual(["b1"]);
		expect(loadBoard).toHaveBeenCalledTimes(1);
	});
});
