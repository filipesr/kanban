import { describe, expect, it } from "vitest";

import { shouldNotifyTaskReadyForReview } from "../../src/server/ready-for-review-notification";

// Regression test for #308 ("No notification is shown even though notification on review
// option is enabled").
//
// The notification was gated on `reviewReason` being one of hook | attention | error. A task
// that finishes SUCCESSFULLY gets `reviewReason: "exit"` (session-state-machine.ts, where
// `exitCode === 0 ? "exit" : "error"`), so the most common path — the agent finished and is
// waiting for you — was the one path that never notified. A task that *failed* did notify,
// which is why this survived: reproducing with a failing task shows the feature working.
describe("shouldNotifyTaskReadyForReview", () => {
	it("notifies when the agent finished successfully (#308)", () => {
		expect(shouldNotifyTaskReadyForReview("exit")).toBe(true);
	});

	it("still notifies on the reasons that already worked", () => {
		expect(shouldNotifyTaskReadyForReview("hook")).toBe(true);
		expect(shouldNotifyTaskReadyForReview("attention")).toBe(true);
		expect(shouldNotifyTaskReadyForReview("error")).toBe(true);
	});

	// The human who interrupted the task is, by definition, already at the keyboard: telling
	// them about it is noise. Kept explicit so the omission reads as a decision, not an
	// oversight — which is exactly how `exit` came to be missing.
	it("does not notify when the human interrupted the task", () => {
		expect(shouldNotifyTaskReadyForReview("interrupted")).toBe(false);
	});

	it("does not notify without a review reason", () => {
		expect(shouldNotifyTaskReadyForReview(null)).toBe(false);
	});
});
