import { describe, expect, it } from "vitest";

import type { RuntimeProjectsOverviewCard } from "@/runtime/types";
import { cardNeedsAttention, mergeProjectsOverview, resolveProjectColor } from "@/utils/projects-overview";

function card(projectId: string, taskId: string): RuntimeProjectsOverviewCard {
	return {
		projectId,
		taskId,
		column: "backlog",
		title: taskId,
		tags: [],
		category: null,
		priority: null,
		source: null,
		agentId: null,
		createdAt: 0,
		updatedAt: 0,
		status: null,
		pendingQuestion: null,
		activityText: null,
		sessionUpdatedAt: null,
	};
}

describe("mergeProjectsOverview", () => {
	const current = {
		projects: [
			{ id: "a", name: "a", path: "/a" },
			{ id: "b", name: "b", path: "/b" },
		],
		cards: [card("a", "a1"), card("b", "b1")],
	};

	it("replaces only the reloaded project", () => {
		const merged = mergeProjectsOverview(
			current,
			{ projects: [{ id: "b", name: "b", path: "/b" }], cards: [card("b", "b2")] },
			["b"],
		);
		expect(merged.cards.map((entry) => entry.taskId)).toEqual(["a1", "b2"]);
		expect(merged.projects.map((project) => project.id)).toEqual(["a", "b"]);
	});

	it("drops a reloaded project that no longer exists", () => {
		const merged = mergeProjectsOverview(current, { projects: [], cards: [] }, ["b"]);
		expect(merged.projects.map((project) => project.id)).toEqual(["a"]);
		expect(merged.cards.map((entry) => entry.taskId)).toEqual(["a1"]);
	});

	it("takes a full reload as is", () => {
		const update = { projects: [], cards: [] };
		expect(mergeProjectsOverview(current, update, null)).toBe(update);
	});
});

describe("cardNeedsAttention", () => {
	it("counts questions, reviews and failures, but nothing already done", () => {
		expect(cardNeedsAttention({ status: "awaiting_answer", column: "review" })).toBe(true);
		expect(cardNeedsAttention({ status: "awaiting_review", column: "review" })).toBe(true);
		expect(cardNeedsAttention({ status: "failed", column: "in_progress" })).toBe(true);
		expect(cardNeedsAttention({ status: "running", column: "in_progress" })).toBe(false);
		expect(cardNeedsAttention({ status: "awaiting_review", column: "trash" })).toBe(false);
	});
});

describe("resolveProjectColor", () => {
	it("is stable for a project", () => {
		expect(resolveProjectColor("kanban-1a2b")).toBe(resolveProjectColor("kanban-1a2b"));
	});
});
