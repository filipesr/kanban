import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	readAskUserQuestionAnswer,
	readAskUserQuestionImageRefs,
	resolveAskUserQuestionImages,
	summarizeAskUserQuestion,
} from "../../src/core/ask-user-question-summary";

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

describe("readAskUserQuestionAnswer", () => {
	const questions = [{ question: "Qual cor você prefere?", options: [{ label: "Azul" }, { label: "Verde" }] }];

	it("reads what was chosen for the question the notice showed", () => {
		// Answered in the card's terminal, the question on the phone still had live buttons and no
		// sign it was settled. What was chosen is in the tool's response, keyed by the question.
		expect(readAskUserQuestionAnswer({ questions, answers: { "Qual cor você prefere?": "Verde" } })).toBe("Verde");
	});

	it("answers for the first question, the one the notice showed", () => {
		expect(
			readAskUserQuestionAnswer({
				questions: [...questions, { question: "E o tamanho?" }],
				answers: { "E o tamanho?": "Grande", "Qual cor você prefere?": "Azul" },
			}),
		).toBe("Azul");
	});

	it("says nothing for a response it does not recognize", () => {
		expect(readAskUserQuestionAnswer({ answers: {} })).toBeUndefined();
		expect(readAskUserQuestionAnswer({ output: "ok" })).toBeUndefined();
		expect(readAskUserQuestionAnswer(null)).toBeUndefined();
	});
});

const DRAFT = "marketing/instagram/projects/x/posts/2026-10-22-y/final/01.jpg";

describe("the pictures a question points at", () => {
	let worktree: string;

	beforeEach(() => {
		worktree = mkdtempSync(join(tmpdir(), "kanban-question-images-"));
	});

	afterEach(() => {
		rmSync(worktree, { recursive: true, force: true });
	});

	function picture(relative: string): string {
		const path = join(worktree, relative);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, "");
		return path;
	}

	it("finds them in the question, then in each option's description and preview, in order", () => {
		expect(
			readAskUserQuestionImageRefs({
				questions: [
					{
						question: `Aprovar este rascunho? ![capa](${DRAFT})`,
						options: [
							{ label: "Aprovar", description: "Como está ![](a.png)" },
							{ label: "Pedir ajuste", preview: '![b](<b c.webp> "título")' },
							{ label: "Descartar", description: `De novo ![](${DRAFT})` },
						],
					},
				],
			}),
		).toEqual([DRAFT, "a.png", "b c.webp"]);
	});

	it("resolves a relative path against the card's worktree and keeps an absolute one", () => {
		const relative = picture(DRAFT);
		const absolute = picture("elsewhere/02.png");
		expect(
			resolveAskUserQuestionImages(
				{ question: `Aprovar? ![](${DRAFT}) ![](${absolute})`, options: [{ label: "Aprovar" }] },
				worktree,
			),
		).toEqual([relative, absolute]);
	});

	it("drops a picture that does not exist, is not a photo a chat can show, or is a URL", () => {
		const kept = picture("ok.jpeg");
		picture("diagram.svg");
		expect(
			resolveAskUserQuestionImages(
				{
					question: "Aprovar? ![](missing.png) ![](diagram.svg) ![](https://example.com/x.png) ![](ok.jpeg)",
				},
				worktree,
			),
		).toEqual([kept]);
	});

	it("drops a relative path when the worktree is not known, rather than guess where it is", () => {
		picture("ok.png");
		expect(resolveAskUserQuestionImages({ question: "Ok? ![](ok.png)" }, null)).toEqual([]);
	});

	it("sends at most ten, the first ten", () => {
		const paths = Array.from({ length: 12 }, (_, index) => picture(`final/${index}.jpg`));
		const question = `Aprovar? ${paths.map((_, index) => `![](final/${index}.jpg)`).join(" ")}`;
		expect(resolveAskUserQuestionImages({ question }, worktree)).toEqual(paths.slice(0, 10));
	});

	it("reads only the first question, the one shown with buttons", () => {
		expect(
			readAskUserQuestionImageRefs({
				questions: [{ question: "Primeira?" }, { question: "Segunda? ![](b.png)" }],
			}),
		).toEqual([]);
	});
});

describe("a question with pictures, as summarized", () => {
	it("leaves the picture markdown out of the text", () => {
		expect(
			summarizeAskUserQuestion({
				questions: [
					{
						question: `Aprovar este rascunho?   ![](${DRAFT})`,
						options: [{ label: "Aprovar" }, { label: "Pedir ajuste" }, { label: "Descartar" }],
					},
				],
			}),
		).toBe("Aprovar este rascunho? — 1) Aprovar  2) Pedir ajuste  3) Descartar");
	});

	it("keeps a caption being approved whole, with its line breaks", () => {
		// The caption is what is being approved. Clipped at 200 and run into one line, the person
		// would approve text they could not read.
		const caption = Array.from({ length: 12 }, (_, index) => `Linha ${index} ${"x".repeat(90)}`).join("\n");
		const summary = summarizeAskUserQuestion({
			question: `Aprovar o post E02 (22/10, carrossel)?\n\n\n\nLegenda:\n${caption}\n\n![](final/01.jpg) ![](final/02.jpg)`,
			options: [{ label: "Aprovar" }, { label: "Descartar" }],
		});
		expect(summary).toBe(`Aprovar o post E02 (22/10, carrossel)?\n\nLegenda:\n${caption} — 1) Aprovar  2) Descartar`);
	});

	it("still caps it, at 2000", () => {
		const summary = summarizeAskUserQuestion({ question: `${"x".repeat(3000)} ![](a.png)` });
		expect(summary?.length).toBe(2000);
		expect(summary?.endsWith("…")).toBe(true);
	});

	it("leaves a question without pictures exactly as it was", () => {
		const summary = summarizeAskUserQuestion({
			question: `Linha 1\n${"x".repeat(400)}`,
			options: [{ label: "Sim" }],
		});
		expect(summary?.startsWith("Linha 1\nxxx")).toBe(true);
		expect(summary?.length).toBeLessThan(260);
	});
});
