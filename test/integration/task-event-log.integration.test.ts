import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RuntimeBoardCard, RuntimeBoardData } from "../../src/core/api-contract";
import { deleteTasksFromBoard, moveTaskToColumn } from "../../src/core/task-board-mutations";
import { appendTaskEvents, getTaskEventLogPath, readTaskEvents } from "../../src/state/task-event-log";
import {
	getWorkspaceDirectoryPath,
	loadWorkspaceContext,
	loadWorkspaceState,
	mutateWorkspaceState,
	saveWorkspaceState,
} from "../../src/state/workspace-state";
import { createGitTestEnv } from "../utilities/git-env";
import { createTempDir } from "../utilities/temp-dir";

function card(id: string): RuntimeBoardCard {
	return {
		id,
		title: `Card ${id}`,
		prompt: `Card ${id}`,
		startInPlanMode: false,
		baseRef: "main",
		createdAt: 10,
		updatedAt: 10,
	};
}

function boardWith(
	columns: Partial<Record<"backlog" | "in_progress" | "review" | "trash", string[]>>,
): RuntimeBoardData {
	return {
		columns: (["backlog", "in_progress", "review", "trash"] as const).map((id) => ({
			id,
			title: id,
			cards: (columns[id] ?? []).map(card),
		})),
		dependencies: [],
	};
}

async function withProject<T>(run: (projectPath: string) => Promise<T>): Promise<T> {
	const home = createTempDir("kanban-home-");
	const sandbox = createTempDir("kanban-events-");
	const previousHome = process.env.HOME;
	const previousUserProfile = process.env.USERPROFILE;
	process.env.HOME = home.path;
	process.env.USERPROFILE = home.path;
	try {
		const projectPath = join(sandbox.path, "project");
		mkdirSync(projectPath, { recursive: true });
		spawnSync("git", ["init"], { cwd: projectPath, stdio: "ignore", env: createGitTestEnv() });
		return await run(projectPath);
	} finally {
		process.env.HOME = previousHome;
		process.env.USERPROFILE = previousUserProfile;
		home.cleanup();
		sandbox.cleanup();
	}
}

async function eventsOf(projectPath: string) {
	const context = await loadWorkspaceContext(projectPath);
	return await readTaskEvents(getWorkspaceDirectoryPath(context.workspaceId));
}

function withoutTimestamps<T extends { at: number }>(events: T[]): Array<Omit<T, "at">> {
	return events.map(({ at: _at, ...rest }) => rest);
}

describe.sequential("task event log", () => {
	it("logs the same move whether the UI saves the board or the CLI mutates it", async () => {
		const viaUi = await withProject(async (projectPath) => {
			const initial = await loadWorkspaceState(projectPath);
			const created = await saveWorkspaceState(projectPath, {
				board: boardWith({ backlog: ["a"] }),
				sessions: {},
				expectedRevision: initial.revision,
			});
			await saveWorkspaceState(projectPath, {
				board: boardWith({ in_progress: ["a"] }),
				sessions: {},
				expectedRevision: created.revision,
			});
			return await eventsOf(projectPath);
		});

		const viaCli = await withProject(async (projectPath) => {
			const initial = await loadWorkspaceState(projectPath);
			await saveWorkspaceState(projectPath, {
				board: boardWith({ backlog: ["a"] }),
				sessions: {},
				expectedRevision: initial.revision,
			});
			await mutateWorkspaceState(projectPath, (state) => ({
				board: moveTaskToColumn(state.board, "a", "in_progress").board,
				value: null,
			}));
			return await eventsOf(projectPath);
		});

		expect(viaUi.map((event) => event.type)).toEqual(["card_created", "card_moved"]);
		expect(withoutTimestamps(viaCli)).toEqual(withoutTimestamps(viaUi));
		expect(viaCli[1]).toMatchObject({ type: "card_moved", taskId: "a", from: "backlog", to: "in_progress" });
	});

	it("keeps a card's history after the trash is cleared", async () => {
		const events = await withProject(async (projectPath) => {
			const initial = await loadWorkspaceState(projectPath);
			await saveWorkspaceState(projectPath, {
				board: boardWith({ trash: ["a"] }),
				sessions: {},
				expectedRevision: initial.revision,
			});
			await mutateWorkspaceState(projectPath, (state) => ({
				board: deleteTasksFromBoard(state.board, ["a"]).board,
				value: null,
			}));
			return await eventsOf(projectPath);
		});

		expect(events.map((event) => event.type)).toEqual(["card_created", "card_deleted"]);
		expect(events[1]).toMatchObject({ from: "trash", card: { title: "Card a", createdAt: 10 } });
	});

	it("skips a torn line instead of losing the whole log", async () => {
		const dir = createTempDir("kanban-log-");
		try {
			await appendTaskEvents(dir.path, [
				{
					type: "card_created",
					taskId: "a",
					at: 2,
					column: "backlog",
					card: { title: "A", createdAt: 1, agentId: null, priority: null, tags: [] },
				},
			]);
			appendFileSync(getTaskEventLogPath(dir.path), '{"type":"card_moved","taskId":"a","at":3,"fr');
			expect((await readTaskEvents(dir.path)).map((event) => event.taskId)).toEqual(["a"]);
		} finally {
			dir.cleanup();
		}
	});
});
