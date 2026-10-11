import { describe, expect, it } from "vitest";

import { formatTaskRecord, resolveStartAgentId } from "../../src/commands/task";
import type { RuntimeBoardCard, RuntimeWorkspaceStateResponse } from "../../src/core/api-contract";

const state = { sessions: {} } as unknown as RuntimeWorkspaceStateResponse;

function card(patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id: "0dabf",
		prompt: "read the readme",
		baseRef: "main",
		startInPlanMode: false,
		createdAt: 1,
		updatedAt: 1,
		...patch,
	} as RuntimeBoardCard;
}

describe("formatTaskRecord", () => {
	// The defect: `task create --tags ciclo --priority high` stored both, and `task list` showed
	// neither, so the CLI could not be used to check its own write.
	it("returns every attribute a create accepts", () => {
		const record = formatTaskRecord(
			state,
			card({
				title: "probe",
				tags: ["ciclo"],
				category: "infra",
				priority: "high",
				source: "telegram",
			}),
			"backlog",
		);

		expect(record).toMatchObject({
			title: "probe",
			tags: ["ciclo"],
			category: "infra",
			priority: "high",
			source: "telegram",
		});
	});

	// A card written before the attributes existed should not grow empty ones.
	it("leaves out what the card does not have", () => {
		const record = formatTaskRecord(state, card(), "backlog");

		expect(record).not.toHaveProperty("title");
		expect(record).not.toHaveProperty("tags");
		expect(record).not.toHaveProperty("category");
		expect(record).not.toHaveProperty("priority");
		expect(record).not.toHaveProperty("source");
	});

	// An empty tag list is the same as having no tags, and printing `[]` invites a reader to
	// think the card was tagged and then emptied.
	it("treats an empty tag list as no tags", () => {
		const record = formatTaskRecord(state, card({ tags: [] }), "backlog");

		expect(record).not.toHaveProperty("tags");
	});
});

describe("resolveStartAgentId", () => {
	it("keeps the card's agent when no flag is given", () => {
		expect(resolveStartAgentId(undefined, "claude")).toBe("claude");
	});

	it("lets the flag override what the card was filed with", () => {
		expect(resolveStartAgentId("claude", "cline")).toBe("claude");
	});

	// `--agent-id default` is how someone says "ignore the card": the session then falls back
	// to the board's configured agent, which is what passing nothing down means.
	it("drops the card's agent when asked for the board default", () => {
		expect(resolveStartAgentId(null, "cline")).toBeUndefined();
	});
});
