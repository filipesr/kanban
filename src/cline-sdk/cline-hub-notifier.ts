import { join } from "node:path";

import { HubUIClient, readHubDiscovery, resolveClineDataDir } from "@clinebot/core";
import { resolveClineBuildEnv } from "@clinebot/shared";

/**
 * Publishes "a card needs you" to the Cline hub, so any connected subscriber can deliver it.
 *
 * Why this exists: a board that runs agents in parallel is, by construction, something you are
 * not watching. Today the only delivery for "ready for review" is a browser notification, which
 * requires the board open in a tab on this machine. The hub already broadcasts `ui.notify` to
 * its subscribers, and the CLI connectors (Telegram, Slack, Discord) are already hub clients.
 *
 * The contract that matters: **this is an accessory**. The hub being down, slow, or absent is a
 * normal condition, not an error. Nothing here may throw, block a card transition, or keep the
 * process alive. Every failure path returns quietly.
 */

export interface ClineHubDiscoveryRecord {
	url?: string;
	authToken?: string;
}

export interface ClineHubNotifyClient {
	connect(): Promise<void>;
	sendNotify(payload: { title: string; body: string; severity?: "info" | "warning" | "error" }): Promise<void>;
	dispose(): Promise<void>;
}

export interface ClineHubNotifierOptions {
	/** Overridable for tests; defaults to reading the hub discovery file written by the CLI. */
	readDiscovery?: () => Promise<ClineHubDiscoveryRecord | undefined>;
	/** Overridable for tests; defaults to a real `HubUIClient`. */
	createClient?: (record: Required<ClineHubDiscoveryRecord>) => ClineHubNotifyClient;
}

export interface ReadyForReviewNotification {
	taskId: string;
	taskTitle: string;
	workspaceName: string;
}

async function defaultReadDiscovery(): Promise<ClineHubDiscoveryRecord | undefined> {
	try {
		// The discovery file is named after the build env, so a development hub and a production
		// hub never read each other's token.
		const path = join(resolveClineDataDir(), "locks", "hub", `${resolveClineBuildEnv()}.json`);
		return (await readHubDiscovery(path)) ?? undefined;
	} catch {
		return undefined;
	}
}

function defaultCreateClient(record: Required<ClineHubDiscoveryRecord>): ClineHubNotifyClient {
	const client = new HubUIClient({
		address: record.url,
		authToken: record.authToken,
		clientType: "kanban",
		displayName: "Kanban",
	});
	return {
		connect: () => client.connect(),
		sendNotify: (payload) => client.sendNotify(payload),
		dispose: () => client.dispose(),
	};
}

export function createClineHubNotifier(options: ClineHubNotifierOptions = {}) {
	const readDiscovery = options.readDiscovery ?? defaultReadDiscovery;
	const createClient = options.createClient ?? defaultCreateClient;

	return {
		async notifyReadyForReview(notification: ReadyForReviewNotification): Promise<void> {
			let client: ClineHubNotifyClient | undefined;
			try {
				const record = await readDiscovery();
				if (!record?.url || !record.authToken) {
					// No hub running, or a hub we cannot authenticate against. Both are normal.
					return;
				}
				client = createClient({ url: record.url, authToken: record.authToken });
				await client.connect();
				await client.sendNotify({
					title: "Ready for review",
					// The body is what a person reads on a phone, so it leads with what and where.
					body: `${notification.taskTitle} — ${notification.workspaceName}`,
					severity: "info",
				});
			} catch {
				// Deliberately silent: a notification that fails must never surface as a board
				// error, and must never be retried in a way that delays the card.
			} finally {
				try {
					await client?.dispose();
				} catch {
					// Disposing a client that never connected is not a problem worth reporting.
				}
			}
		},
	};
}
