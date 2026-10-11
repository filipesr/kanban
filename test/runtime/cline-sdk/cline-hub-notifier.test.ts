import { describe, expect, it, vi } from "vitest";

import { createClineHubNotifier } from "../../../src/cline-sdk/cline-hub-notifier";

// The notifier is an accessory: a card must transition and the board must keep working even
// when the hub is down, slow, or absent. Every test here is about that property, because the
// failure we cannot accept is a notification path that takes the board with it.
describe("createClineHubNotifier", () => {
	it("does not throw when the hub is unreachable", async () => {
		const notifier = createClineHubNotifier({
			readDiscovery: async () => undefined,
		});
		await expect(
			notifier.notifyReadyForReview({ taskTitle: "t", taskId: "1", workspaceName: "w" }),
		).resolves.toBeUndefined();
	});

	it("does not throw when discovery has no auth token", async () => {
		const notifier = createClineHubNotifier({
			readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub" }),
		});
		await expect(
			notifier.notifyReadyForReview({ taskTitle: "t", taskId: "1", workspaceName: "w" }),
		).resolves.toBeUndefined();
	});

	it("does not throw when sending fails", async () => {
		const notifier = createClineHubNotifier({
			isEnabled: async () => true,
			readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub", authToken: "tok" }),
			createClient: () => ({
				connect: async () => {
					throw new Error("boom");
				},
				sendNotify: async () => undefined,
				dispose: async () => undefined,
			}),
		});
		await expect(
			notifier.notifyReadyForReview({ taskTitle: "t", taskId: "1", workspaceName: "w" }),
		).resolves.toBeUndefined();
	});

	it("sends a notification carrying the task title, so the message is useful on a phone", async () => {
		const sendNotify = vi.fn<
			(payload: { title: string; body: string; severity?: "info" | "warning" | "error" }) => Promise<void>
		>(async () => undefined);
		const notifier = createClineHubNotifier({
			isEnabled: async () => true,
			readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub", authToken: "tok" }),
			createClient: () => ({
				connect: async () => undefined,
				sendNotify,
				dispose: async () => undefined,
			}),
		});

		await notifier.notifyReadyForReview({
			taskTitle: "Fix the console redirect",
			taskId: "461e5",
			workspaceName: "partyshare",
		});

		expect(sendNotify).toHaveBeenCalledTimes(1);
		const payload = sendNotify.mock.calls[0][0];
		expect(payload.body).toContain("Fix the console redirect");
		expect(payload.body).toContain("partyshare");
	});

	// The destination is opt-in: publishing to the hub is new behaviour, and new behaviour that
	// turns itself on is how a notification feature becomes a surprise. Existing users see no
	// change until they ask for it.
	it("stays silent when hub delivery is not enabled", async () => {
		const sendNotify = vi.fn<
			(payload: { title: string; body: string; severity?: "info" | "warning" | "error" }) => Promise<void>
		>(async () => undefined);
		const notifier = createClineHubNotifier({
			isEnabled: async () => false,
			readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub", authToken: "tok" }),
			createClient: () => ({
				connect: async () => undefined,
				sendNotify,
				dispose: async () => undefined,
			}),
		});

		await notifier.notifyReadyForReview({ taskTitle: "t", taskId: "1", workspaceName: "w" });
		expect(sendNotify).not.toHaveBeenCalled();
	});

	// A config read that throws must not become a reason to skip the notification *or* a reason
	// to crash: it is the same accessory contract as everything else here.
	it("does not throw when reading the setting fails", async () => {
		const notifier = createClineHubNotifier({
			isEnabled: async () => {
				throw new Error("config unreadable");
			},
			readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub", authToken: "tok" }),
		});
		await expect(
			notifier.notifyReadyForReview({ taskTitle: "t", taskId: "1", workspaceName: "w" }),
		).resolves.toBeUndefined();
	});

	// Routing is the whole point: a subscriber that knows only "something is ready" can do
	// nothing better than guess which conversation to deliver to. The workspace path is what
	// lets it match, so it travels with the notification.
	it("carries the workspace path so a subscriber can route instead of guessing", async () => {
		const sendNotify = vi.fn<
			(payload: {
				title: string;
				body: string;
				source?: { workspacePath?: string; itemId?: string };
			}) => Promise<void>
		>(async () => undefined);
		const notifier = createClineHubNotifier({
			isEnabled: async () => true,
			readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub", authToken: "tok" }),
			createClient: () => ({
				connect: async () => undefined,
				sendNotify,
				dispose: async () => undefined,
			}),
		});

		await notifier.notifyReadyForReview({
			taskId: "461e5",
			taskTitle: "Fix the console redirect",
			workspaceName: "partyshare",
			workspacePath: "/Users/someone/code/partyshare",
		});

		const payload = sendNotify.mock.calls[0][0];
		expect(payload.source?.workspacePath).toBe("/Users/someone/code/partyshare");
		expect(payload.source?.itemId).toBe("461e5");
	});

	it("always disposes the client, including when sending throws", async () => {
		const dispose = vi.fn<() => Promise<void>>(async () => undefined);
		const notifier = createClineHubNotifier({
			isEnabled: async () => true,
			readDiscovery: async () => ({ url: "ws://127.0.0.1:1/hub", authToken: "tok" }),
			createClient: () => ({
				connect: async () => undefined,
				sendNotify: async () => {
					throw new Error("boom");
				},
				dispose,
			}),
		});

		await notifier.notifyReadyForReview({ taskTitle: "t", taskId: "1", workspaceName: "w" });
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});

describe("priority in the review notice", () => {
	function capture() {
		const sent: Array<{ title: string; body: string }> = [];
		const notifier = createClineHubNotifier({
			isEnabled: async () => true,
			readDiscovery: async () => ({ url: "ws://x/hub", authToken: "t" }),
			createClient: () => ({
				connect: async () => undefined,
				sendNotify: async (payload) => {
					sent.push({ title: payload.title, body: payload.body });
				},
				dispose: async () => undefined,
			}),
		});
		return { notifier, sent };
	}

	it("marks an urgent card so it can be triaged without opening the board", async () => {
		const { notifier, sent } = capture();
		await notifier.notifyReadyForReview({
			taskId: "1",
			taskTitle: "Cartão",
			workspaceName: "kanban",
			priority: "high",
		});
		expect(sent[0]?.body).toContain("[alta]");
	});

	it("marks nothing else, so the mark keeps meaning something", async () => {
		// If every card were marked, the mark would say nothing.
		for (const priority of ["medium", "low", undefined] as const) {
			const { notifier, sent } = capture();
			await notifier.notifyReadyForReview({
				taskId: "1",
				taskTitle: "Cartão",
				workspaceName: "kanban",
				priority,
			});
			expect(sent[0]?.body).not.toContain("[alta]");
		}
	});
});
