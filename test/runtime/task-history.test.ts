import { describe, expect, it, vi } from "vitest";

import type {
	RuntimeBoardCard,
	RuntimeBoardColumnId,
	RuntimeBoardData,
	RuntimeTaskChatMessage,
	RuntimeTaskSessionSummary,
} from "../../src/core/api-contract";
import type { RuntimeTaskEvent } from "../../src/core/task-events";
import type { TaskHistoryRun } from "../../src/server/claude-code-transcripts";
import { buildTaskHistory, type TaskHistorySources } from "../../src/server/task-history";

function card(patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id: "task-1",
		title: "Collapsible Done",
		prompt: "Make Done collapsible",
		startInPlanMode: false,
		baseRef: "main",
		agentId: "claude",
		createdAt: 1,
		updatedAt: 8,
		...patch,
	} as RuntimeBoardCard;
}

function board(column: RuntimeBoardColumnId, boardCard: RuntimeBoardCard = card()): RuntimeBoardData {
	const ids: RuntimeBoardColumnId[] = ["backlog", "in_progress", "review", "trash"];
	return {
		columns: ids.map((id) => ({ id, title: id, cards: id === column ? [boardCard] : [] })),
		dependencies: [],
	} as RuntimeBoardData;
}

function moves(...path: Array<[number, RuntimeBoardColumnId, RuntimeBoardColumnId]>): RuntimeTaskEvent[] {
	const snapshot = { title: "Collapsible Done", createdAt: 1, agentId: "claude" as const, priority: null, tags: [] };
	return path.map(([at, from, to]) => ({ type: "card_moved", taskId: "task-1", at, from, to, card: snapshot }));
}

function message(role: RuntimeTaskChatMessage["role"], content: string, toolName?: string): RuntimeTaskChatMessage {
	return { id: `${role}-${content}`, role, content, createdAt: 0, meta: toolName ? { toolName } : null };
}

function summary(patch: Partial<RuntimeTaskSessionSummary>): RuntimeTaskSessionSummary {
	return { taskId: "task-1", agentId: "claude", latestHookActivity: null, ...patch } as RuntimeTaskSessionSummary;
}

function sources(patch: Partial<TaskHistorySources> = {}): TaskHistorySources {
	return {
		loadBoard: async () => board("trash"),
		loadSessions: async () => ({}),
		loadEvents: async () =>
			moves([2, "backlog", "in_progress"], [5, "in_progress", "review"], [8, "review", "trash"]),
		loadClineMessages: vi.fn(async () => []),
		loadClaudeCodeRuns: vi.fn(async (): Promise<TaskHistoryRun[]> => []),
		...patch,
	};
}

describe("buildTaskHistory", () => {
	it("builds a Claude Code card's history from its newest run", async () => {
		const response = await buildTaskHistory(
			"task-1",
			sources({
				loadEvents: async () => [
					{
						type: "card_created",
						taskId: "task-1",
						at: 1,
						column: "backlog",
						card: { title: "Collapsible Done", createdAt: 1, agentId: "claude", priority: null, tags: [] },
					},
					...moves([2, "backlog", "in_progress"], [5, "in_progress", "review"], [8, "review", "trash"]),
				],
				loadClaudeCodeRuns: async () => [
					{
						startedAt: 2,
						messages: [message("user", "Make Done collapsible"), message("assistant", "First try")],
					},
					{
						startedAt: 4,
						messages: [
							message("user", "Keep going"),
							message("tool", "{}", "AskUserQuestion"),
							message("assistant", "Done: columns collapse"),
						],
					},
				],
			}),
		);

		expect(response.ok).toBe(true);
		expect(response.history?.prompt).toBe("Make Done collapsible");
		expect(response.history?.outcome).toEqual({ kind: "result", text: "Done: columns collapse" });
		expect(response.history?.facts).toEqual({
			startedAt: 2,
			finishedAt: 8,
			durationMs: 6,
			questionCount: 1,
			messageCount: 4,
		});
		expect(response.history?.runs).toHaveLength(2);
		expect(response.history?.movements).toHaveLength(4);
	});

	it("labels the outcome as last reply when the card skipped review", async () => {
		const response = await buildTaskHistory(
			"task-1",
			sources({
				loadEvents: async () => moves([2, "backlog", "in_progress"], [3, "in_progress", "trash"]),
				loadClaudeCodeRuns: async () => [{ startedAt: 2, messages: [message("assistant", "Half way")] }],
			}),
		);

		expect(response.history?.outcome).toEqual({ kind: "last_reply", text: "Half way" });
	});

	it("falls back to the hook's final message when no transcript survives", async () => {
		const response = await buildTaskHistory(
			"task-1",
			sources({
				loadSessions: async () => ({
					"task-1": summary({
						latestHookActivity: {
							activityText: null,
							toolName: null,
							toolInputSummary: null,
							finalMessage: "Shipped it",
							hookEventName: null,
							notificationType: null,
							source: null,
						} as RuntimeTaskSessionSummary["latestHookActivity"],
					}),
				}),
			}),
		);

		expect(response.history?.outcome?.text).toBe("Shipped it");
		expect(response.history?.runs).toEqual([]);
		expect(response.history?.facts.questionCount).toBeNull();
		expect(response.history?.facts.messageCount).toBe(0);
	});

	it("uses the Cline session for a Cline card and drops reasoning", async () => {
		const response = await buildTaskHistory(
			"task-1",
			sources({
				loadBoard: async () => board("trash", card({ agentId: "cline" })),
				loadClineMessages: async () => [
					message("user", "Do it"),
					message("reasoning", "thinking"),
					message("assistant", "Done"),
					message("tool", "{}", "ask_question"),
				],
			}),
		);

		expect(response.history?.runs).toHaveLength(1);
		expect(response.history?.runs[0]?.messages).toHaveLength(3);
		expect(response.history?.facts.questionCount).toBe(1);
	});

	it("gives other agents only the request, facts and moves", async () => {
		const loadClineMessages = vi.fn(async () => []);
		const loadClaudeCodeRuns = vi.fn(async (): Promise<TaskHistoryRun[]> => []);
		const response = await buildTaskHistory(
			"task-1",
			sources({
				loadBoard: async () => board("trash", card({ agentId: "codex" })),
				loadClineMessages,
				loadClaudeCodeRuns,
			}),
		);

		expect(response.history?.runs).toEqual([]);
		expect(response.history?.movements.length).toBeGreaterThan(0);
		expect(loadClineMessages).not.toHaveBeenCalled();
		expect(loadClaudeCodeRuns).not.toHaveBeenCalled();
	});

	it("refuses a card that is not in Done", async () => {
		const response = await buildTaskHistory("task-1", sources({ loadBoard: async () => board("review") }));

		expect(response).toEqual({ ok: false, history: null, error: "Task is not in Done." });
	});

	it("reports a card that no longer exists", async () => {
		const response = await buildTaskHistory("missing", sources());

		expect(response).toEqual({ ok: false, history: null, error: "Task not found." });
	});
});
