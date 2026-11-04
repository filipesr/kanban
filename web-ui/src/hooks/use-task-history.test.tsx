import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type UseTaskHistoryResult, useTaskHistory } from "@/hooks/use-task-history";
import type { RuntimeTaskHistory, RuntimeTaskHistoryResponse } from "@/runtime/types";

const getTaskHistoryQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/trpc-client", () => ({
	getRuntimeTrpcClient: () => ({
		runtime: {
			getTaskHistory: {
				query: getTaskHistoryQueryMock,
			},
		},
	}),
}));

function history(taskId: string): RuntimeTaskHistory {
	return {
		taskId,
		title: null,
		prompt: `Prompt of ${taskId}`,
		agentId: "claude",
		outcome: null,
		facts: { startedAt: null, finishedAt: null, durationMs: null, questionCount: null, messageCount: 0 },
		runs: [],
		movements: [],
	};
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

let latest: UseTaskHistoryResult | null = null;

function HookHarness({ taskId }: { taskId: string }): null {
	latest = useTaskHistory({ projectId: "project-1", taskId });
	return null;
}

describe("useTaskHistory", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		latest = null;
		getTaskHistoryQueryMock.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("loads the history of the selected card", async () => {
		const response = deferred<RuntimeTaskHistoryResponse>();
		getTaskHistoryQueryMock.mockReturnValue(response.promise);

		await act(async () => root.render(<HookHarness taskId="task-1" />));
		expect(latest?.isLoading).toBe(true);

		await act(async () => response.resolve({ ok: true, history: history("task-1") }));

		expect(getTaskHistoryQueryMock).toHaveBeenCalledWith({ taskId: "task-1" });
		expect(latest?.isLoading).toBe(false);
		expect(latest?.history?.prompt).toBe("Prompt of task-1");
	});

	it("keeps only the latest card's history when the selection changes quickly", async () => {
		const first = deferred<RuntimeTaskHistoryResponse>();
		const second = deferred<RuntimeTaskHistoryResponse>();
		getTaskHistoryQueryMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

		await act(async () => root.render(<HookHarness taskId="task-1" />));
		await act(async () => root.render(<HookHarness taskId="task-2" />));
		await act(async () => second.resolve({ ok: true, history: history("task-2") }));
		await act(async () => first.resolve({ ok: true, history: history("task-1") }));

		expect(latest?.history?.taskId).toBe("task-2");
	});

	it("reports the runtime's error", async () => {
		getTaskHistoryQueryMock.mockResolvedValue({ ok: false, history: null, error: "Task not found." });

		await act(async () => root.render(<HookHarness taskId="task-1" />));

		expect(latest?.error).toBe("Task not found.");
		expect(latest?.history).toBeNull();
	});
});
