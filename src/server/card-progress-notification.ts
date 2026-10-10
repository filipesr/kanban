import type { RuntimeTaskSessionSummary } from "../core/api-contract";

/**
 * Whether a running card should say what it is doing, and what it should say.
 *
 * A card that runs for fifteen minutes is silence followed by one notice. Reporting progress
 * fixes that, but naively: a hook fires on every tool call, so the same work would produce a
 * message per call. Two guards keep it a status line instead of a flood -- the same text is
 * never repeated, and updates are spaced out.
 *
 * Terminal states are deliberately not reported here. A card entering review is a notification
 * that asks the person for something, and that one has to arrive on its own.
 */

const DEFAULT_MIN_INTERVAL_MS = 5_000;

export interface CardProgressState {
	text?: string;
	publishedAt?: number;
}

export interface CardProgressDecision {
	text: string;
	next: CardProgressState;
}

function describeActivity(summary: RuntimeTaskSessionSummary): string {
	const toolName = summary.latestHookActivity?.toolName?.trim();
	return toolName ? `Running · ${toolName}` : "Running";
}

export function resolveCardProgress(input: {
	summary: RuntimeTaskSessionSummary;
	previous: CardProgressState;
	now: number;
	minIntervalMs?: number;
}): CardProgressDecision | undefined {
	if (input.summary.state !== "running") {
		return undefined;
	}
	const text = describeActivity(input.summary);
	if (text === input.previous.text) {
		return undefined;
	}
	const minIntervalMs = input.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
	const publishedAt = input.previous.publishedAt;
	if (publishedAt !== undefined && input.now - publishedAt < minIntervalMs) {
		// Dropped rather than queued: by the time a queued line could be sent, the card is
		// probably doing something else, and the something else is what matters.
		return undefined;
	}
	return { text, next: { text, publishedAt: input.now } };
}
