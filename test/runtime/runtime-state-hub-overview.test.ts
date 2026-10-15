import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import type { RuntimeStateStreamMessage } from "../../src/core/api-contract";
import { createRuntimeStateHub, type RuntimeStateHub } from "../../src/server/runtime-state-hub";

/**
 * The cross-project overview lives in a tab scoped to some other project, so a change anywhere
 * has to reach it. Before this message existed, workspace updates only went to clients of that
 * same workspace, and a tab elsewhere never heard of them.
 */
describe("runtime state hub overview invalidation", () => {
	let server: Server | null = null;
	let hub: RuntimeStateHub | null = null;
	const sockets: WebSocket[] = [];

	afterEach(async () => {
		for (const socket of sockets) {
			socket.terminate();
		}
		sockets.length = 0;
		await hub?.close();
		hub = null;
		await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
		server = null;
	});

	async function connectClient(): Promise<{ messages: RuntimeStateStreamMessage[] }> {
		hub = createRuntimeStateHub({
			workspaceRegistry: {
				resolveWorkspaceForStream: async () => ({
					workspaceId: null,
					workspacePath: null,
					removedRequestedWorkspacePath: null,
					didPruneProjects: false,
				}),
				buildProjectsPayload: async () => ({ currentProjectId: null, projects: [] }),
				buildWorkspaceStateSnapshot: async () => {
					throw new Error("not under test");
				},
				getWorkspacePathById: () => null,
			},
			hubNotifier: {
				notifyReadyForReview: async () => undefined,
				notifyCardMoved: async () => undefined,
				notifyCardProgress: async () => undefined,
				notifyQuestionAnswered: async () => undefined,
			},
		});
		const runtimeHub = hub;
		server = createServer();
		server.on("upgrade", (request, socket, head) => {
			runtimeHub.handleUpgrade(request, socket, head, { requestedWorkspaceId: null });
		});
		await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		const messages: RuntimeStateStreamMessage[] = [];
		const socket = new WebSocket(`ws://127.0.0.1:${port}`);
		sockets.push(socket);
		await new Promise<void>((resolve, reject) => {
			socket.on("message", (data) => {
				const message = JSON.parse(String(data)) as RuntimeStateStreamMessage;
				messages.push(message);
				if (message.type === "snapshot") {
					resolve();
				}
			});
			socket.on("error", reject);
		});
		return { messages };
	}

	it("tells every client which project changed, whatever project it is scoped to", async () => {
		const { messages } = await connectClient();

		await hub?.broadcastRuntimeWorkspaceStateUpdated("other-project", "/code/other");
		await expect.poll(() => messages.map((message) => message.type)).toContain("projects_overview_invalidated");

		expect(messages).toContainEqual({ type: "projects_overview_invalidated", workspaceId: "other-project" });
	});
});
