import type { RuntimeTaskSessionSummary } from "../core/api-contract";

/**
 * What the card is actually asking, for a notification read away from the board.
 *
 * Without this, "Ready for review" tells someone that a card wants them and nothing about what
 * it wants -- so the notification's only use is to send them to the board, which is the thing
 * they were not at. The agent's question is already on the summary; it just never travelled.
 */

const DETAIL_MAX_LENGTH = 600;

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
	const text = activity?.finalMessage?.trim() || activity?.activityText?.trim();
	if (!text) {
		return undefined;
	}
	// Naming the tool matters for a permission prompt: "may I run Bash" and "may I leave plan
	// mode" are different enough decisions that the answer depends on which one it is.
	const tool = activity?.toolName?.trim();
	const prefix = activity?.notificationType === "permission_prompt" && tool ? `${tool}: ` : "";
	return clip(`${prefix}${text}`);
}
