import type { RuntimeTaskSessionSummary } from "../core/api-contract";

/**
 * What the card is actually asking, for a notification read away from the board.
 *
 * Without this, "Ready for review" tells someone that a card wants them and nothing about what
 * it wants -- so the notification's only use is to send them to the board, which is the thing
 * they were not at. The agent's question is already on the summary; it just never travelled.
 */

const DETAIL_MAX_LENGTH = 600;

/**
 * Hook events that mean the prompt is over. `notificationType` cannot be used for this: it
 * sticks at `permission_prompt` long after the prompt was answered, while the hook event moves
 * on. Measured on a card whose activity already read "Final: descartado" and whose
 * notificationType still claimed a pending prompt.
 */
const COMPLETION_EVENTS = new Set(["posttooluse", "posttoolusefailure", "subagentstop", "stop"]);

/**
 * Whether the card is waiting on the person right now, as opposed to reporting something it
 * already did. Only a card that is waiting should be offered choices to answer with: a second
 * set of buttons for a question already answered sends a tap nowhere, which is what happened
 * when a completed AskUserQuestion was announced with the options still in its text.
 */
export function isAwaitingAnswer(summary: RuntimeTaskSessionSummary): boolean {
	const activity = summary.latestHookActivity;
	if (!activity || activity.notificationType !== "permission_prompt") {
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
	// A card that already acted should say what it did, not replay the question it asked --
	// repeating "Devo gravar? 1) Gravar 2) Descartar" after the answer reads like a second ask.
	const text = awaiting
		? activity?.activityText?.trim() || activity?.finalMessage?.trim()
		: activity?.finalMessage?.trim() || activity?.activityText?.trim();
	if (!text) {
		return undefined;
	}
	// Naming the tool matters for a permission prompt: "may I run Bash" and "may I leave plan
	// mode" are different enough decisions that the answer depends on which one it is.
	const tool = activity?.toolName?.trim();
	const prefix = awaiting && tool ? `${tool}: ` : "";
	return clip(`${prefix}${text}`);
}
