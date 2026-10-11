import type { RuntimeTaskSessionSummary } from "../core/api-contract";

/**
 * What the card is actually asking, for a notification read away from the board.
 *
 * Without this, "Ready for review" tells someone that a card wants them and nothing about what
 * it wants -- so the notification's only use is to send them to the board, which is the thing
 * they were not at. The agent's question is already on the summary; it just never travelled.
 */

const DETAIL_MAX_LENGTH = 600;

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

function clip(value: string): string {
	const collapsed = value.replace(/\s+/g, " ").trim();
	if (collapsed.length <= DETAIL_MAX_LENGTH) {
		return collapsed;
	}
	const clipped = collapsed.slice(0, DETAIL_MAX_LENGTH);
	const lastSpace = clipped.lastIndexOf(" ");
	const base = lastSpace > DETAIL_MAX_LENGTH / 2 ? clipped.slice(0, lastSpace) : clipped;
	return `${base.trimEnd()}…`;
}

export function describeReviewRequest(summary: RuntimeTaskSessionSummary): string | undefined {
	const activity = summary.latestHookActivity;
	// A failure explains itself through the warning the runtime recorded; nothing the agent
	// said is more useful than "it died and here is what was launched".
	const warning = summary.warningMessage?.trim();
	if (warning) {
		return clip(warning);
	}
	const awaiting = isAwaitingAnswer(summary);
	// A card that is not asking has only one thing worth saying: what it concluded. Its current
	// tool call is not that -- "Completed AskUserQuestion: Devo gravar? 1) Gravar 2) Descartar"
	// replays a question that was already answered, and reads as being asked twice.
	const text = awaiting
		? activity?.activityText?.trim() || activity?.finalMessage?.trim()
		: activity?.finalMessage?.trim();
	if (!text) {
		return undefined;
	}
	// Naming the tool matters for a permission prompt: "may I run Bash" and "may I leave plan
	// mode" are different enough decisions that the answer depends on which one it is.
	const tool = activity?.toolName?.trim();
	const prefix = awaiting && tool ? `${tool}: ` : "";
	return clip(`${prefix}${text}`);
}
