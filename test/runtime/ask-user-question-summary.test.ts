import { describe, expect, it } from "vitest";

import { summarizeAskUserQuestion } from "../../src/core/ask-user-question-summary";

describe("summarizeAskUserQuestion", () => {
	it("numbers the options, because the number is the answer", () => {
		// The prompt is an interactive selection: someone answering from a chat needs to know
		// that "1" picks Azul. Prose is accepted by the terminal and silently ignored.
		expect(
			summarizeAskUserQuestion({
				questions: [
					{
						question: "Qual cor você prefere?",
						options: [{ label: "Azul" }, { label: "Verde" }],
					},
				],
			}),
		).toBe("Qual cor você prefere? — 1) Azul  2) Verde");
	});

	it("accepts a single question at the top level", () => {
		expect(
			summarizeAskUserQuestion({
				question: "Seguir?",
				options: [{ label: "Sim" }, { label: "Não" }],
			}),
		).toBe("Seguir? — 1) Sim  2) Não");
	});

	it("accepts plain strings as options", () => {
		expect(summarizeAskUserQuestion({ question: "Cor?", options: ["Azul", "Verde"] })).toBe(
			"Cor? — 1) Azul  2) Verde",
		);
	});

	it("falls back to the header when there is no question text", () => {
		expect(summarizeAskUserQuestion({ header: "Escopo", options: [{ label: "Tudo" }] })).toBe("Escopo — 1) Tudo");
	});

	it("shows the question alone when it carries no options", () => {
		expect(summarizeAskUserQuestion({ question: "Qual o nome?" })).toBe("Qual o nome?");
	});

	it("returns nothing for a shape it does not recognize", () => {
		// The caller keeps its own fallback rather than showing a mangled guess.
		expect(summarizeAskUserQuestion(null)).toBeUndefined();
		expect(summarizeAskUserQuestion({})).toBeUndefined();
		expect(summarizeAskUserQuestion({ questions: [] })).toBeUndefined();
		expect(summarizeAskUserQuestion({ command: "ls" })).toBeUndefined();
	});

	it("keeps a long question readable on a phone", () => {
		const summary = summarizeAskUserQuestion({
			question: "x".repeat(400),
			options: [{ label: "Sim" }],
		});
		expect(summary?.length).toBeLessThan(260);
		expect(summary).toContain("1) Sim");
	});

	it("stops after a handful of options instead of listing dozens", () => {
		const summary = summarizeAskUserQuestion({
			question: "Qual?",
			options: Array.from({ length: 20 }, (_, i) => ({ label: `op${i}` })),
		});
		expect(summary).toContain("6) op5");
		expect(summary).not.toContain("7) op6");
	});
});
