import type { RuntimeTaskSessionSummary } from "../core/api-contract";

/**
 * What the card is actually asking, for a notification read away from the board.
 *
 * Without this, "Ready for review" tells someone that a card wants them and nothing about what
 * it wants -- so the notification's only use is to send them to the board, which is the thing
 * they were not at. The agent's question is already on the summary; it just never travelled.
 *
 * Nothing here is cut to length. How much of a long text a chat can show, and how the rest
 * reaches it, is the connector's call -- Telegram's sends anything long as a `.md` file and
 * shows its end, where the conclusion or the question is. A cut made here first left that file
 * holding only the opening, with the end it was meant to show already gone.
 */

/** Hook events that mean the turn is over, whatever the agent did or did not say. */
const COMPLETION_EVENTS = new Set(["posttooluse", "posttoolusefailure", "subagentstop", "stop"]);

/**
 * Whether the card is waiting on the person right now, as opposed to reporting something it
 * already did. Only a card that is waiting should be offered choices to answer with: a second
 * set of buttons for a question already answered sends a tap nowhere, which is what happened
 * when a completed AskUserQuestion was announced with the options still in its text.
 */
export function isAwaitingAnswer(summary: RuntimeTaskSessionSummary): boolean {
	const activity = summary.latestHookActivity;
	if (!activity) {
		return false;
	}
	// The agent having said its final word is the one reliable sign it is not waiting. Measured
	// across a dozen cards: every one still waiting had `finalMessage: null`, and every one
	// that had answered carried the text it ended with. `notificationType` says neither -- it
	// was `null` on the prompt that arrived through PreToolUse and still `permission_prompt`
	// long after the answer.
	if (activity.finalMessage?.trim()) {
		return false;
	}
	const event = activity.hookEventName?.trim().toLocaleLowerCase() ?? "";
	return !COMPLETION_EVENTS.has(event);
}

/** Text read off the terminal, where line breaks are the TUI's wrapping, not the agent's. */
function flattenTerminalText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

/**
 * The agent's conclusion, which is its own markdown: lists and paragraphs are kept, because they
 * are what makes it readable. Only the noise goes -- runs of spaces inside a line, trailing
 * spaces, and more than one blank line in a row. Leading indentation stays: it is what nests a
 * list.
 */
function tidyConclusion(value: string): string {
	return value
		.split("\n")
		.map((line) => {
			const indent = line.match(/^[ \t]*/)?.[0] ?? "";
			return `${indent}${line.slice(indent.length).replace(/[ \t]+/g, " ")}`.trimEnd();
		})
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * What to say about a card that reached review with nothing recorded to say.
 *
 * Returning nothing here is what made the worst failure in this whole path invisible: a card
 * whose agent stopped having done no work announced "Ready for review" with an empty body,
 * which is exactly what a finished card with a terse agent looks like. Observed live -- the
 * card wrote no file, left no transcript and registered no session, and the notification was
 * indistinguishable from success.
 *
 * Silence is therefore reported as silence. A card still asking is left alone: its question is
 * already the body, and this would only talk over it.
 */
function describeSilence(summary: RuntimeTaskSessionSummary, awaiting: boolean): string | undefined {
	if (awaiting) {
		return undefined;
	}
	// A card mid-flight has an activity even without a conclusion -- a tool name, a line of
	// what it is doing. That one is genuinely better left alone: replaying its last tool call
	// is how a question the person had already answered got announced a second time. Only a
	// card with nothing recorded anywhere has silence worth reporting.
	const activity = summary.latestHookActivity;
	const recorded = [activity?.activityText, activity?.toolName, activity?.finalMessage].some((value) => value?.trim());
	if (recorded) {
		return undefined;
	}
	const exitCode = summary.exitCode;
	// A non-zero exit is the one hard fact available; zero says nothing a reader can use, and
	// no code at all means the runtime never reported one.
	return exitCode !== null && exitCode !== 0
		? `Stopped with exit ${exitCode} and reported nothing.`
		: "Stopped without reporting anything.";
}

function escapeForRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function describeReviewRequest(summary: RuntimeTaskSessionSummary): string | undefined {
	const activity = summary.latestHookActivity;
	// A failure explains itself through the warning the runtime recorded; nothing the agent
	// said is more useful than "it died and here is what was launched".
	const warning = summary.warningMessage?.trim();
	if (warning) {
		return flattenTerminalText(warning);
	}
	const awaiting = isAwaitingAnswer(summary);
	// A card that is not asking has only one thing worth saying: what it concluded. Its current
	// tool call is not that -- "Completed AskUserQuestion: Devo gravar? 1) Gravar 2) Descartar"
	// replays a question that was already answered, and reads as being asked twice.
	const question = awaiting ? activity?.activityText?.trim() : undefined;
	const conclusion = activity?.finalMessage?.trim();
	const text = question || conclusion;
	if (!text) {
		return describeSilence(summary, awaiting);
	}
	if (!question) {
		return tidyConclusion(text);
	}
	// Naming the tool matters for a permission prompt: "may I run Bash" and "may I leave plan
	// mode" are different enough decisions that the answer depends on which one it is.
	const tool = activity?.toolName?.trim();
	// Unless the text already names it, which is how "AskUserQuestion: Using AskUserQuestion:
	// Gravar?" reached a person's phone -- the tool named twice before the question it was
	// asking.
	const alreadyNamed = tool ? new RegExp(`\\b${escapeForRegExp(tool)}\\b`).test(text) : false;
	const prefix = awaiting && tool && !alreadyNamed ? `${tool}: ` : "";
	return flattenTerminalText(`${prefix}${text}`);
}

/**
 * The headline of the notification, which is the only part a phone shows before it is opened.
 *
 * "Ready for review" is true of a card that finished and false of one that stopped to ask: it
 * tells the person the work is done and waiting on their reading, when in fact nothing moves
 * until they answer. Observed live -- a card asked a question, the notification announced it as
 * ready for review, and the question itself was below the fold.
 */
export function resolveReadyForReviewTitle(awaitingAnswer: boolean | undefined): string {
	return awaitingAnswer ? "Waiting on your answer" : "Ready for review";
}
