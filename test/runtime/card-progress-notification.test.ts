import { describe, expect, it } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import { resolveCardProgress } from "../../src/server/card-progress-notification";

function summary(patch: Partial<RuntimeTaskSessionSummary> = {}): RuntimeTaskSessionSummary {
	return {
		taskId: "461e5",
		state: "running",
		agentId: "claude",
		workspacePath: "/code/app",
		pid: 1,
		startedAt: 0,
		updatedAt: 0,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		warningMessage: null,
		latestTurnCheckpoint: null,
		previousTurnCheckpoint: null,
		...patch,
	};
}

function activity(toolName: string | null) {
	return {
		activityText: null,
		toolName,
		toolInputSummary: null,
		finalMessage: null,
		hookEventName: null,
		notificationType: null,
		source: null,
	};
}

describe("resolveCardProgress", () => {
	it("names the tool the card is running", () => {
		const decision = resolveCardProgress({
			summary: summary({ latestHookActivity: activity("Bash") }),
			previous: {},
			now: 1000,
		});
		expect(decision?.text).toBe("Running · Bash");
	});

	it("says just running when no tool is named", () => {
		expect(resolveCardProgress({ summary: summary(), previous: {}, now: 0 })?.text).toBe("Running");
	});

	it("stays quiet while the card is doing the same thing", () => {
		// A hook fires on every tool call; repeating the line would turn one tool into many
		// messages saying the same thing.
		const decision = resolveCardProgress({
			summary: summary({ latestHookActivity: activity("Bash") }),
			previous: { text: "Running · Bash", publishedAt: 0 },
			now: 100_000,
		});
		expect(decision).toBeUndefined();
	});

	it("spaces updates out even when the work changes fast", () => {
		const decision = resolveCardProgress({
			summary: summary({ latestHookActivity: activity("Read") }),
			previous: { text: "Running · Bash", publishedAt: 10_000 },
			now: 11_000,
			minIntervalMs: 5_000,
		});
		expect(decision).toBeUndefined();
	});

	it("reports again once enough time has passed", () => {
		const decision = resolveCardProgress({
			summary: summary({ latestHookActivity: activity("Read") }),
			previous: { text: "Running · Bash", publishedAt: 10_000 },
			now: 16_000,
			minIntervalMs: 5_000,
		});
		expect(decision?.text).toBe("Running · Read");
		expect(decision?.next).toEqual({ text: "Running · Read", publishedAt: 16_000 });
	});

	it("reports the first line without waiting", () => {
		// Nothing has been said yet, so there is nothing to space this out from.
		expect(resolveCardProgress({ summary: summary(), previous: {}, now: 1 })?.text).toBe("Running");
	});

	it("says nothing about a card that is not running", () => {
		// A card entering review asks the person for something, and that notification has to
		// arrive on its own rather than overwrite a status line.
		for (const state of ["idle", "awaiting_review", "interrupted", "failed"] as const) {
			expect(resolveCardProgress({ summary: summary({ state }), previous: {}, now: 0 })).toBeUndefined();
		}
	});
});
