import type { RuntimeTaskSessionReviewReason } from "../core/api-contract";

/**
 * Whether a task entering `awaiting_review` should notify the human.
 *
 * Extracted from the inline condition in `runtime-state-hub.ts` so the rule has a name, a
 * single definition, and a test. It used to be a three-way `||` buried in a state-diff
 * callback, and that is how `exit` came to be missing from it for months (#308): a task that
 * finishes SUCCESSFULLY gets `reviewReason: "exit"` (see `session-state-machine.ts`, where the
 * reason is `exitCode === 0 ? "exit" : "error"`), so the most common path — the agent is done
 * and waiting for you — was the one path that stayed silent, while a *failing* task notified
 * correctly.
 *
 * `interrupted` is deliberately excluded: the human who interrupted the task is already at the
 * keyboard, so telling them about it is noise. That exclusion is written here, with its reason,
 * precisely so it reads as a decision rather than as another oversight.
 */
export function shouldNotifyTaskReadyForReview(reviewReason: RuntimeTaskSessionReviewReason): boolean {
	switch (reviewReason) {
		case "exit":
		case "error":
		case "hook":
		case "attention":
			return true;
		case "interrupted":
		case null:
			return false;
		default: {
			// Exhaustiveness: a new reason added to the enum lands here as a type error at
			// build time, instead of silently never notifying — which is the failure mode
			// this whole module exists to prevent.
			const unhandled: never = reviewReason;
			return unhandled;
		}
	}
}
