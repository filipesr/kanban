import { join } from "node:path";

import { HubUIClient, readHubDiscovery, resolveClineDataDir } from "@clinebot/core";
import { resolveClineBuildEnv } from "@clinebot/shared";
import { loadGlobalRuntimeConfig } from "../config/runtime-config";

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
	sendNotify(payload: {
		title: string;
		body: string;
		severity?: "info" | "warning" | "error";
		source?: { workspacePath?: string; itemId?: string };
	}): Promise<void>;
	dispose(): Promise<void>;
}

export interface ClineHubNotifierOptions {
	/**
	 * Whether hub delivery is on. Opt-in by default: publishing to the hub is new behaviour,
	 * and new behaviour that turns itself on is how a notification feature becomes a surprise.
	 */
	isEnabled?: () => Promise<boolean>;
	/** Overridable for tests; defaults to reading the hub discovery file written by the CLI. */
	readDiscovery?: () => Promise<ClineHubDiscoveryRecord | undefined>;
	/** Overridable for tests; defaults to a real `HubUIClient`. */
	createClient?: (record: Required<ClineHubDiscoveryRecord>) => ClineHubNotifyClient;
}

export interface ReadyForReviewNotification {
	taskId: string;
	taskTitle: string;
	workspaceName: string;
	/**
	 * Absolute path of the workspace, travelling with the notification so a subscriber can
	 * route it. Without it, whoever receives the event knows that something is ready but not
	 * where, and can only broadcast or guess.
	 */
	workspacePath?: string;
}

async function defaultIsEnabled(): Promise<boolean> {
	try {
		const config = await loadGlobalRuntimeConfig();
		return config.readyForReviewHubNotificationsEnabled === true;
	} catch {
		// An unreadable config is not a reason to notify against the user's wishes.
		return false;
	}
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

export interface ClineHubNotifier {
	notifyReadyForReview(notification: ReadyForReviewNotification): Promise<void>;
}

export function createClineHubNotifier(options: ClineHubNotifierOptions = {}): ClineHubNotifier {
	const isEnabled = options.isEnabled ?? defaultIsEnabled;
	const readDiscovery = options.readDiscovery ?? defaultReadDiscovery;
	const createClient = options.createClient ?? defaultCreateClient;

	return {
		async notifyReadyForReview(notification: ReadyForReviewNotification): Promise<void> {
			let client: ClineHubNotifyClient | undefined;
			try {
				if (!(await isEnabled())) {
					return;
				}
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
					// The machine-readable half: a subscriber matches this against the workspace
					// it is bound to, instead of broadcasting or picking the last active one.
					source: {
						workspacePath: notification.workspacePath,
						itemId: notification.taskId,
					},
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
