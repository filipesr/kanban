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

	it("always disposes the client, including when sending throws", async () => {
		const dispose = vi.fn<() => Promise<void>>(async () => undefined);
		const notifier = createClineHubNotifier({
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
