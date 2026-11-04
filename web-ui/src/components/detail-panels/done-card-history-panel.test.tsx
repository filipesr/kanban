import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DoneCardHistoryPanel } from "@/components/detail-panels/done-card-history-panel";
import type { UseTaskHistoryResult } from "@/hooks/use-task-history";
import type { RuntimeTaskChatMessage, RuntimeTaskHistory } from "@/runtime/types";
import type { BoardCard } from "@/types";

const useTaskHistoryMock = vi.hoisted(() => vi.fn<() => UseTaskHistoryResult>());

vi.mock("@/hooks/use-task-history", () => ({
	useTaskHistory: useTaskHistoryMock,
}));

const CARD: BoardCard = {
	id: "task-1",
	title: "Collapsible Done",
	prompt: "Make Done collapsible",
	startInPlanMode: false,
	baseRef: "main",
	createdAt: 1,
	updatedAt: 1,
};

function message(role: RuntimeTaskChatMessage["role"], content: string): RuntimeTaskChatMessage {
	return { id: `${role}-${content}`, role, content, createdAt: 0 };
}

function history(patch: Partial<RuntimeTaskHistory> = {}): RuntimeTaskHistory {
	return {
		taskId: "task-1",
		title: "Collapsible Done",
		prompt: "Make Done collapsible",
		agentId: "claude",
		outcome: { kind: "result", text: "Columns now collapse." },
		facts: { startedAt: 0, finishedAt: 50 * 60_000, durationMs: 50 * 60_000, questionCount: 1, messageCount: 2 },
		runs: [
			{ startedAt: 0, messages: [message("user", "Make Done collapsible"), message("assistant", "Working on it")] },
		],
		movements: [
			{ at: 0, from: null, to: "backlog" },
			{ at: 1, from: "review", to: "trash" },
		],
		...patch,
	};
}

function showHistory(value: RuntimeTaskHistory): void {
	useTaskHistoryMock.mockReturnValue({ history: value, isLoading: false, error: null });
}

describe("DoneCardHistoryPanel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	async function render(): Promise<void> {
		await act(async () => root.render(<DoneCardHistoryPanel projectId="project-1" card={CARD} />));
	}

	async function expand(label: string): Promise<void> {
		const trigger = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
		expect(trigger).toBeDefined();
		await act(async () => trigger?.click());
	}

	it("shows request, result and facts, with conversation and moves collapsed", async () => {
		showHistory(history());
		await render();

		const text = container.textContent ?? "";
		expect(text).toContain("Request");
		expect(text).toContain("Make Done collapsible");
		expect(text).toContain("Result");
		expect(text).toContain("Columns now collapse.");
		expect(text).toContain("Claude Code");
		expect(text).toContain("50 min");
		expect(text).not.toContain("Working on it");
		expect(text).not.toContain("Review → Done");

		await expand("Conversation");
		expect(container.textContent).toContain("Working on it");

		await expand("Card moves");
		expect(container.textContent).toContain("Created in Backlog");
		expect(container.textContent).toContain("Review → Done");
	});

	it("labels a card that skipped review as last reply", async () => {
		showHistory(history({ outcome: { kind: "last_reply", text: "Half way" } }));
		await render();

		expect(container.textContent).toContain("Last reply");
		expect(container.textContent).not.toContain("Result");
	});

	it("explains when no conversation was saved", async () => {
		showHistory(history({ runs: [] }));
		await render();
		await expand("Conversation");

		expect(container.textContent).toContain("No conversation was saved for this card.");
	});

	it("leaves out facts it does not know", async () => {
		showHistory(
			history({
				facts: { startedAt: null, finishedAt: null, durationMs: null, questionCount: null, messageCount: 0 },
			}),
		);
		await render();

		expect(container.textContent).not.toContain("Duration");
		expect(container.textContent).not.toContain("Questions");
	});

	it("separates several runs", async () => {
		showHistory(
			history({
				runs: [
					{ startedAt: 0, messages: [message("assistant", "First")] },
					{ startedAt: 1, messages: [message("assistant", "Second")] },
				],
			}),
		);
		await render();
		await expand("Conversation");

		expect(container.textContent).toContain("Run 1");
		expect(container.textContent).toContain("Run 2");
	});

	it("does not claim a card older than the event log was created in Done", async () => {
		showHistory(
			history({
				movements: [
					{ at: 0, from: null, to: "backlog" },
					{ at: 1, from: null, to: "trash" },
				],
			}),
		);
		await render();
		await expand("Card moves");

		expect(container.textContent).toContain("Created in Backlog");
		expect(container.textContent).toContain("Moved to Done");
		expect(container.textContent).not.toContain("Created in Done");
	});

	it("shows the runtime's error", async () => {
		useTaskHistoryMock.mockReturnValue({ history: null, isLoading: false, error: "Task not found." });
		await render();

		expect(container.textContent).toContain("Task not found.");
	});
});
