// Assembles a finished card's history from what already exists: the card, the event log, the
// session summary and the agent's own conversation record. Nothing here is written anywhere;
// clearing Done takes the card, and with it the only way to ask for this, away.
import type {
	RuntimeBoardCard,
	RuntimeBoardData,
	RuntimeTaskChatMessage,
	RuntimeTaskHistoryResponse,
	RuntimeTaskSessionSummary,
} from "../core/api-contract";
import type { RuntimeTaskEvent } from "../core/task-events";
import { buildTaskHistoryTimeline, type TaskHistoryTimeline } from "../core/task-history-movements";
import type { TaskHistoryRun } from "./claude-code-transcripts";

/** The tools an agent asks the person a question with, per agent. */
const QUESTION_TOOL_NAMES = new Set(["AskUserQuestion", "ask_question"]);

export interface TaskHistorySources {
	loadBoard(): Promise<RuntimeBoardData>;
	loadSessions(): Promise<Record<string, RuntimeTaskSessionSummary>>;
	loadEvents(): Promise<RuntimeTaskEvent[]>;
	loadClineMessages(taskId: string): Promise<RuntimeTaskChatMessage[]>;
	loadClaudeCodeRuns(taskId: string): Promise<TaskHistoryRun[]>;
}

export async function buildTaskHistory(
	taskId: string,
	sources: TaskHistorySources,
): Promise<RuntimeTaskHistoryResponse> {
	const board = await sources.loadBoard();
	const located = findCard(board, taskId);
	if (!located) {
		return { ok: false, history: null, error: "Task not found." };
	}
	if (located.columnId !== "trash") {
		return { ok: false, history: null, error: "Task is not in Done." };
	}
	const { card } = located;
	const [sessions, events] = await Promise.all([sources.loadSessions(), sources.loadEvents()]);
	const session = sessions[taskId] ?? null;
	const agentId = session?.agentId ?? card.agentId ?? null;
	const timeline = buildTaskHistoryTimeline(events, card);
	const runs = await loadRuns(taskId, agentId, timeline, sources);
	const newestRun = runs.at(-1) ?? null;

	return {
		ok: true,
		history: {
			taskId,
			title: card.title ?? null,
			prompt: card.prompt,
			images: card.images,
			agentId,
			outcome: buildOutcome(newestRun, session, timeline),
			facts: {
				startedAt: timeline.startedAt,
				finishedAt: timeline.finishedAt,
				durationMs:
					timeline.startedAt !== null && timeline.finishedAt !== null
						? timeline.finishedAt - timeline.startedAt
						: null,
				questionCount: newestRun
					? newestRun.messages.filter(
							(message) => message.role === "tool" && QUESTION_TOOL_NAMES.has(message.meta?.toolName ?? ""),
						).length
					: null,
				messageCount: runs.reduce(
					(count, run) =>
						count +
						run.messages.filter((message) => message.role === "user" || message.role === "assistant").length,
					0,
				),
			},
			runs,
			movements: timeline.movements,
		},
	};
}

async function loadRuns(
	taskId: string,
	agentId: RuntimeBoardCard["agentId"] | null,
	timeline: TaskHistoryTimeline,
	sources: TaskHistorySources,
): Promise<TaskHistoryRun[]> {
	if (agentId === "cline") {
		const messages = (await sources.loadClineMessages(taskId)).filter((message) => message.role !== "reasoning");
		return messages.length > 0 ? [{ startedAt: timeline.startedAt, messages }] : [];
	}
	if (agentId === "claude") {
		return await sources.loadClaudeCodeRuns(taskId);
	}
	return [];
}

function buildOutcome(
	newestRun: TaskHistoryRun | null,
	session: RuntimeTaskSessionSummary | null,
	timeline: TaskHistoryTimeline,
): NonNullable<RuntimeTaskHistoryResponse["history"]>["outcome"] {
	const lastAnswer = newestRun?.messages
		.filter((message) => message.role === "assistant")
		.at(-1)
		?.content.trim();
	const text = lastAnswer || session?.latestHookActivity?.finalMessage?.trim();
	if (!text) {
		return null;
	}
	return { kind: timeline.reachedReview ? "result" : "last_reply", text };
}

function findCard(
	board: RuntimeBoardData,
	taskId: string,
): { card: RuntimeBoardCard; columnId: RuntimeBoardData["columns"][number]["id"] } | null {
	for (const column of board.columns) {
		const card = column.cards.find((candidate) => candidate.id === taskId);
		if (card) {
			return { card, columnId: column.id };
		}
	}
	return null;
}
