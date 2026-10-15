import { HubUIClient, resolveClineDataDir } from "@clinebot/core";
import { resolveClineBuildEnv } from "@clinebot/shared";
import { loadGlobalRuntimeConfig } from "../config/runtime-config";
import type { CardClosingAction } from "../server/card-closing-state";
import { resolveReadyForReviewTitle } from "../server/review-request-detail";
import { findRunningHubDiscovery } from "./cline-hub-discovery";

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
		/** Column the card sits in, so a subscriber can keep one message per card current. */
		column?: string;
		/** Update what is already shown, or do nothing. Never start a new conversation. */
		updateOnly?: boolean;
		supersedesPrevious?: boolean;
		awaitingAnswer?: boolean;
		/** What can be done to close the card from where this is read. */
		actions?: CardClosingAction[];
		/** The question the card was waiting on is settled; `answer` is what was chosen, if known. */
		answered?: { answer?: string };
		/**
		 * Absolute local paths of the pictures the question points at, in display order, at most
		 * 10. Not in @clinebot/core's type yet: the hub forwards payloads verbatim, so it reaches
		 * subscribers all the same.
		 */
		images?: string[];
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
	/** Column the card is in when this goes out: backlog | in_progress | review | done. */
	column?: string;
	taskId: string;
	taskTitle: string;
	workspaceName: string;
	/**
	 * Absolute path of the workspace, travelling with the notification so a subscriber can
	 * route it. Without it, whoever receives the event knows that something is ready but not
	 * where, and can only broadcast or guess.
	 */
	workspacePath?: string;
	/**
	 * What the card is asking, when it said. Without it the notification can only send someone
	 * to the board, which is the place they were not at.
	 */
	detail?: string;
	/**
	 * Carried so someone triaging on a phone can tell an urgent card from the rest without
	 * opening the board. Only `high` is worth the room: if every card were marked, the mark
	 * would say nothing.
	 */
	priority?: "high" | "medium" | "low";
	/** The card is waiting on the person right now, so choices can be offered for it. */
	awaitingAnswer?: boolean;
	/**
	 * What the person can do to close the card from where they read this: the step still missing
	 * to get its work onto its base, and Concluir. Only on a card that is not asking.
	 */
	actions?: CardClosingAction[];
	/**
	 * Absolute paths of the pictures the question points at -- the draft a card asks to approve.
	 * Only with `awaitingAnswer`: a picture without its question is just a picture.
	 */
	images?: string[];
}

export interface QuestionAnsweredNotification extends ReadyForReviewNotification {
	/** What was chosen, when the agent said. A permission prompt does not. */
	answer?: string;
}

export interface CardProgressNotification extends ReadyForReviewNotification {
	/** What the card is doing right now, as a person would read it on a phone. */
	activity: string;
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
		return await findRunningHubDiscovery({
			dataDir: resolveClineDataDir(),
			buildEnv: resolveClineBuildEnv(),
		});
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
	notifyCardMoved(notification: ReadyForReviewNotification): Promise<void>;
	notifyCardProgress(notification: CardProgressNotification): Promise<void>;
	notifyQuestionAnswered(notification: QuestionAnsweredNotification): Promise<void>;
}

export function createClineHubNotifier(options: ClineHubNotifierOptions = {}): ClineHubNotifier {
	const isEnabled = options.isEnabled ?? defaultIsEnabled;
	const readDiscovery = options.readDiscovery ?? defaultReadDiscovery;
	const createClient = options.createClient ?? defaultCreateClient;

	/**
	 * One place for the whole ritual -- opt-in check, discovery, connect, dispose -- so each
	 * kind of notification only has to say what it is.
	 */
	const publish = async (payload: {
		title: string;
		body: string;
		taskId: string;
		workspacePath?: string;
		supersedesPrevious?: boolean;
		awaitingAnswer?: boolean;
		column?: string;
		updateOnly?: boolean;
		actions?: CardClosingAction[];
		answered?: { answer?: string };
		images?: string[];
	}): Promise<void> => {
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
				title: payload.title,
				body: payload.body,
				severity: "info",
				// The machine-readable half: a subscriber matches this against the workspace it
				// is bound to, instead of broadcasting or picking the last active one.
				source: {
					workspacePath: payload.workspacePath,
					itemId: payload.taskId,
				},
				...(payload.supersedesPrevious ? { supersedesPrevious: true } : {}),
				...(payload.awaitingAnswer ? { awaitingAnswer: true } : {}),
				...(payload.column ? { column: payload.column } : {}),
				...(payload.updateOnly ? { updateOnly: true } : {}),
				...(payload.actions && payload.actions.length > 0 ? { actions: payload.actions } : {}),
				...(payload.answered ? { answered: payload.answered } : {}),
				...(payload.images && payload.images.length > 0 ? { images: payload.images.slice(0, 10) } : {}),
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
	};

	return {
		notifyReadyForReview(notification: ReadyForReviewNotification): Promise<void> {
			return publish({
				title: resolveReadyForReviewTitle(notification.awaitingAnswer),
				// The body is what a person reads on a phone, so it leads with what and where,
				// then says what the card wants.
				body: [
					[
						notification.priority === "high" ? "[alta]" : undefined,
						`${notification.taskTitle} — ${notification.workspaceName}`,
					]
						.filter(Boolean)
						.join(" "),
					notification.detail,
				]
					.filter(Boolean)
					.join("\n\n"),
				taskId: notification.taskId,
				workspacePath: notification.workspacePath,
				awaitingAnswer: notification.awaitingAnswer,
				column: notification.column,
				actions: notification.actions,
				images: notification.awaitingAnswer ? notification.images : undefined,
				// Never supersedes: this one asks the person for something, so it has to arrive
				// on its own instead of quietly replacing a status line.
			});
		},
		notifyCardMoved(notification: ReadyForReviewNotification): Promise<void> {
			return publish({
				title: notification.taskTitle,
				body: notification.workspaceName,
				taskId: notification.taskId,
				workspacePath: notification.workspacePath,
				supersedesPrevious: true,
				column: notification.column,
				// A card dragged across the board is a change of state, not an announcement.
				// Someone watching that card already has it on screen and wants the dot to
				// follow; someone who never asked about it should not be handed a message
				// because a board was tidied.
				updateOnly: true,
			});
		},
		notifyCardProgress(notification: CardProgressNotification): Promise<void> {
			return publish({
				title: notification.taskTitle,
				body: `${notification.workspaceName} · ${notification.activity}`,
				taskId: notification.taskId,
				workspacePath: notification.workspacePath,
				supersedesPrevious: true,
				column: notification.column,
			});
		},
		notifyQuestionAnswered(notification: QuestionAnsweredNotification): Promise<void> {
			return publish({
				// Shaped as a status-line update on purpose: a subscriber that does not know
				// `answered` keeps the card's message current and posts nothing new, which is what
				// an answer given at the terminal should cost a chat that never asked.
				title: notification.taskTitle,
				body: `${notification.workspaceName} · Running`,
				taskId: notification.taskId,
				workspacePath: notification.workspacePath,
				supersedesPrevious: true,
				updateOnly: true,
				column: notification.column,
				answered: notification.answer ? { answer: notification.answer } : {},
			});
		},
	};
}
