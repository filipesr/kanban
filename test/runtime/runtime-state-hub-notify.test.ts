import { describe, expect, it, vi } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import { createRuntimeStateHub } from "../../src/server/runtime-state-hub";

/**
 * The wiring between "a card entered review" and "the hub was told" had no coverage: the
 * decision function and the notifier were each tested alone, and two defects lived in the gap
 * between them. Both are pinned here.
 */

const REPO = "/code/partyshare";
const WORKTREE = "/home/me/.cline/worktrees/461e5/partyshare";

function summary(patch: Partial<RuntimeTaskSessionSummary>): RuntimeTaskSessionSummary {
	return {
		taskId: "461e5",
		state: "idle",
		agentId: "claude",
		workspacePath: WORKTREE,
		pid: null,
		startedAt: null,
		updatedAt: 0,
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

function harness(
	options: { closing?: { next: "integrate" | "push" | null; unintegratedCommits: number; unknown?: true } } = {},
) {
	const notifyReadyForReview = vi.fn<
		(notification: {
			taskId: string;
			taskTitle: string;
			workspaceName: string;
			workspacePath?: string;
			detail?: string;
			priority?: string;
			awaitingAnswer?: boolean;
			column?: string;
			actions?: Array<{ id: string; label: string; confirm?: string }>;
			images?: string[];
		}) => Promise<void>
	>(async () => undefined);
	const notifyCardProgress = vi.fn<
		(notification: {
			taskId: string;
			taskTitle: string;
			workspaceName: string;
			workspacePath?: string;
			activity: string;
		}) => Promise<void>
	>(async () => undefined);
	let emit: (summary: RuntimeTaskSessionSummary) => void = () => undefined;
	const notifyCardMoved = vi.fn<
		(notification: {
			taskId: string;
			taskTitle: string;
			workspaceName: string;
			workspacePath?: string;
			column?: string;
		}) => Promise<void>
	>(async () => undefined);
	const notifyQuestionAnswered = vi.fn<
		(notification: {
			taskId: string;
			taskTitle: string;
			workspaceName: string;
			workspacePath?: string;
			column?: string;
			answer?: string;
		}) => Promise<void>
	>(async () => undefined);
	const hub = createRuntimeStateHub({
		hubNotifier: { notifyReadyForReview, notifyCardProgress, notifyCardMoved, notifyQuestionAnswered },
		resolveCardClosingState: async () => options.closing ?? { next: null, unintegratedCommits: 0 },
		workspaceRegistry: {
			getWorkspacePathById: () => REPO,
			buildWorkspaceStateSnapshot: async () => ({
				board: {
					columns: [
						{
							id: "review",
							cards: [{ id: "461e5", title: "Cartão de teste", priority: "high", baseRef: "main" }],
						},
					],
				},
			}),
			resolveWorkspaceForStream: async () => null,
			buildProjectsPayload: async () => ({ currentProjectId: null, projects: [] }),
		} as never,
	});
	const manager = {
		listSummaries: () => [],
		onSummary: (listener: (s: RuntimeTaskSessionSummary) => void) => {
			emit = listener;
			return () => undefined;
		},
	} as never;
	hub.trackTerminalManager("partyshare", manager);
	return {
		notifyReadyForReview,
		notifyCardProgress,
		notifyCardMoved,
		notifyQuestionAnswered,
		emit: (s: RuntimeTaskSessionSummary) => emit(s),
	};
}

describe("ready-for-review notification from a terminal agent", () => {
	it("notifies the hub when a terminal-agent card enters review", async () => {
		// The notification block used to exist only on the Cline SDK path. Cards running a
		// terminal agent -- the default for `agentId: "claude"` -- went to review in silence,
		// so the feature could never fire for anyone using that agent.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
	});

	it("announces the repository path, not the throwaway worktree", async () => {
		// A card runs in a worktree under ~/.cline/worktrees. No browser tab and no chat
		// conversation is bound to a worktree, so a notification carrying that path is
		// addressed to nowhere and silently reaches no one.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		const sent = h.notifyReadyForReview.mock.calls[0]?.[0];
		expect(sent?.workspacePath).toBe(REPO);
		expect(sent?.workspacePath).not.toBe(WORKTREE);
	});

	it("stays silent when the card was merely interrupted", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "interrupted", exitCode: 143 }));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(h.notifyReadyForReview).not.toHaveBeenCalled();
	});

	it("does not re-notify while the card stays in review", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1);
	});
});

describe("a running card saying what it is doing", () => {
	it("reports the tool, carrying the repository path like the review notice does", async () => {
		const h = harness();
		h.emit(summary({ state: "idle" }));
		h.emit(
			summary({
				state: "running",
				latestHookActivity: {
					activityText: null,
					toolName: "Bash",
					toolInputSummary: null,
					finalMessage: null,
					hookEventName: null,
					notificationType: null,
					source: null,
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyCardProgress).toHaveBeenCalledTimes(1));
		const sent = h.notifyCardProgress.mock.calls[0]?.[0];
		expect(sent?.activity).toBe("Running · Bash");
		expect(sent?.workspacePath).toBe(REPO);
	});

	it("does not report progress for a card entering review", async () => {
		// That notification asks the person for something, so it must not be folded into a
		// status line that quietly replaces itself.
		const h = harness();
		h.emit(summary({ state: "running" }));
		// Wait for the running line to land before clearing: the publish is fired and not
		// awaited, so clearing too early would count it against the next emit.
		await vi.waitFor(() => expect(h.notifyCardProgress).toHaveBeenCalledTimes(1));
		h.notifyCardProgress.mockClear();

		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		expect(h.notifyCardProgress).not.toHaveBeenCalled();
	});
});

describe("the home sidebar agent is not a card", () => {
	const HOME = "__home_agent__:partyshare:claude";

	it("does not announce the home agent starting to run", async () => {
		// It has no card, so the line it produced was its synthetic session id followed by
		// "Running": an activation notice for something nobody is waiting on from afar.
		const h = harness();
		h.emit(summary({ taskId: HOME, state: "idle" }));
		h.emit(summary({ taskId: HOME, state: "running" }));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(h.notifyCardProgress).not.toHaveBeenCalled();
	});

	it("does not announce the home agent finishing a turn as a card for review", async () => {
		const h = harness();
		h.emit(summary({ taskId: HOME, state: "running" }));
		h.emit(summary({ taskId: HOME, state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(h.notifyReadyForReview).not.toHaveBeenCalled();
	});
});

describe("what the review notice tells someone away from the board", () => {
	it("carries the question the card is asking", async () => {
		// Without it the notice can only send them to the board, which is where they were not.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(
			summary({
				state: "awaiting_review",
				reviewReason: "hook",
				latestHookActivity: {
					activityText: "Plano pronto, posso seguir?",
					toolName: "ExitPlanMode",
					toolInputSummary: null,
					finalMessage: null,
					hookEventName: "Notification",
					notificationType: "permission_prompt",
					source: "claude",
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.detail).toBe("ExitPlanMode: Plano pronto, posso seguir?");
	});

	// The notice still goes out, and now it says what there was to say: nothing. An empty body
	// on a card that did no work reads exactly like a finished card with a terse agent.
	it("still notifies when the card said nothing, and reports the silence", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.detail).toBe("Stopped without reporting anything.");
	});
});

describe("what the hub actually hands the notifier", () => {
	it("carries the card's priority and whether it is waiting", async () => {
		// These travelled as far as the function signature and no further: the call site was
		// never updated, so both were accepted and dropped. A test on the notifier alone could
		// not see it, because it called the notifier directly and skipped the hub.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(
			summary({
				state: "awaiting_review",
				reviewReason: "hook",
				latestHookActivity: {
					activityText: "Waiting for approval",
					toolName: "AskUserQuestion",
					toolInputSummary: null,
					finalMessage: null,
					hookEventName: "Notification",
					notificationType: "permission_prompt",
					source: "claude",
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());

		const sent = h.notifyReadyForReview.mock.calls[0]?.[0];
		expect(sent?.priority).toBe("high");
		expect(sent?.awaitingAnswer).toBe(true);
	});

	it("says it is not waiting once the tool completed", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(
			summary({
				state: "awaiting_review",
				reviewReason: "hook",
				latestHookActivity: {
					activityText: "Completed AskUserQuestion: Devo gravar? — 1) Gravar 2) Descartar",
					toolName: "AskUserQuestion",
					toolInputSummary: null,
					finalMessage: "descartado",
					hookEventName: "SubagentStop",
					notificationType: "permission_prompt",
					source: "claude",
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());

		const sent = h.notifyReadyForReview.mock.calls[0]?.[0];
		expect(sent?.awaitingAnswer).toBe(false);
		expect(sent?.detail).toBe("descartado");
	});
});

describe("the column travels with the notice", () => {
	// A subscriber showing one message per card keeps it current from this: without the column
	// the only way to know the card moved is to read the board, which is where the person is
	// not. It rides both notices because those are the two moments a card changes column.
	it("says which column the card is in when it reaches review", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "hook" }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalled());
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.column).toBe("review");
	});
});

describe("closing a finished card from the conversation", () => {
	it("offers the next step and Concluir on a card that finished", async () => {
		const h = harness({ closing: { next: "integrate", unintegratedCommits: 0 } });
		h.emit(summary({ state: "running", pid: 4242 }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "hook", pid: 4242 }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.actions).toEqual([
			{ id: "integrate", label: "Integrar na main" },
			{ id: "done", label: "Concluir" },
		]);
	});

	// An agent whose process exited cannot be typed into, so Integrar would be refused forever.
	it("does not offer integrate on a terminal card whose process is gone", async () => {
		const h = harness({ closing: { next: "integrate", unintegratedCommits: 1 } });
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "exit", exitCode: 0, pid: null }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.actions?.map((action) => action.id)).toEqual(["done"]);
	});

	// A native Cline card never has a pid, and still takes the prompt as a chat message.
	it("offers integrate on a native Cline card", async () => {
		const h = harness({ closing: { next: "integrate", unintegratedCommits: 0 } });
		h.emit(summary({ state: "running", agentId: "cline", pid: null }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "hook", agentId: "cline", pid: null }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.actions?.[0]?.id).toBe("integrate");
	});

	// A card that is asking gets its question's choices; closing buttons there would be a
	// second, unrelated set of things to tap.
	it("offers nothing to close on a card that is asking", async () => {
		const h = harness({ closing: { next: "integrate", unintegratedCommits: 0 } });
		h.emit(summary({ state: "running" }));
		h.emit(
			summary({
				state: "awaiting_review",
				reviewReason: "hook",
				latestHookActivity: {
					activityText: "Faço o push? 1) Sim 2) Não",
					toolName: "AskUserQuestion",
					toolInputSummary: null,
					finalMessage: null,
					hookEventName: "PreToolUse",
					notificationType: null,
					source: "claude",
				},
			}),
		);
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.awaitingAnswer).toBe(true);
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.actions).toBeUndefined();
	});
});

describe("the pictures a question points at", () => {
	const asking = (patch: Record<string, unknown>) =>
		summary({
			state: "awaiting_review",
			reviewReason: "hook",
			latestHookActivity: {
				activityText: "AskUserQuestion: Aprovar este rascunho? — 1) Aprovar 2) Pedir ajuste 3) Descartar",
				toolName: "AskUserQuestion",
				toolInputSummary: null,
				finalMessage: null,
				hookEventName: "PermissionRequest",
				notificationType: null,
				source: "claude",
				images: ["/w/final/01.jpg", "/w/final/02.jpg"],
				...patch,
			},
		});

	it("travel with the question to the hub", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(asking({}));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.images).toEqual(["/w/final/01.jpg", "/w/final/02.jpg"]);
	});

	it("keep the caption's line breaks in what the question says", async () => {
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(asking({ activityText: "AskUserQuestion: Aprovar?\n\nLegenda:\nLinha 1\nLinha 2 — 1) Aprovar" }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.detail).toBe(
			"AskUserQuestion: Aprovar?\n\nLegenda:\nLinha 1\nLinha 2 — 1) Aprovar",
		);
	});

	it("stay behind once the card is no longer asking", async () => {
		// The question was answered and the agent concluded: a picture without its question is
		// just a picture.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(asking({ hookEventName: "Stop", finalMessage: "Publicado." }));
		await vi.waitFor(() => expect(h.notifyReadyForReview).toHaveBeenCalledTimes(1));
		expect(h.notifyReadyForReview.mock.calls[0]?.[0]?.images).toBeUndefined();
	});
});

describe("a question answered in the card's own terminal", () => {
	const answered = (answer?: string) =>
		summary({
			state: "running",
			latestHookActivity: {
				activityText: "Completed AskUserQuestion: Gravar?",
				toolName: "AskUserQuestion",
				toolInputSummary: null,
				finalMessage: null,
				hookEventName: "PostToolUse",
				notificationType: null,
				source: "claude",
				answer,
			},
		});

	it("tells the hub, with what was chosen, so the question elsewhere stops asking", async () => {
		// Reported from use: answered at the terminal, the question on the phone kept its buttons
		// and said nothing about being settled, so it could still be tapped.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "hook" }));
		h.emit(answered("Descartar"));
		await vi.waitFor(() => expect(h.notifyQuestionAnswered).toHaveBeenCalledTimes(1));
		const sent = h.notifyQuestionAnswered.mock.calls[0]?.[0];
		expect(sent?.taskId).toBe("461e5");
		expect(sent?.answer).toBe("Descartar");
		expect(sent?.workspacePath).toBe(REPO);
	});

	it("still tells the hub when what was chosen is not known", async () => {
		// A permission prompt says nothing about which option was taken, but it was settled.
		const h = harness();
		h.emit(summary({ state: "running" }));
		h.emit(summary({ state: "awaiting_review", reviewReason: "hook" }));
		h.emit(answered());
		await vi.waitFor(() => expect(h.notifyQuestionAnswered).toHaveBeenCalledTimes(1));
		expect(h.notifyQuestionAnswered.mock.calls[0]?.[0].answer).toBeUndefined();
	});

	it("says nothing for a card that was never waiting", async () => {
		const h = harness();
		h.emit(summary({ state: "idle" }));
		h.emit(answered("Descartar"));
		await vi.waitFor(() => expect(h.notifyCardProgress).toHaveBeenCalled());
		expect(h.notifyQuestionAnswered).not.toHaveBeenCalled();
	});
});
