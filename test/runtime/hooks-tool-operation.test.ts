import { describe, expect, it } from "vitest";

import { describeToolOperation, normalizeHookMetadata } from "../../src/commands/hooks";

describe("describeToolOperation", () => {
	it("carries the question and its numbered options", () => {
		// Without this the notice was "Using AskUserQuestion" and nothing else: the generic
		// fallbacks look for a command or a path, find neither, and reduce the call to its tool
		// name. Someone away from the board then had to open it just to read the question.
		expect(
			describeToolOperation("AskUserQuestion", {
				questions: [{ question: "Qual cor você prefere?", options: [{ label: "Azul" }, { label: "Verde" }] }],
			}),
		).toBe("AskUserQuestion: Qual cor você prefere? — 1) Azul  2) Verde");
	});

	it("still describes a command the way it always did", () => {
		expect(describeToolOperation("Bash", { command: "npm test" })).toBe("Bash: npm test");
	});

	it("still describes a file the way it always did", () => {
		expect(describeToolOperation("Read", { file_path: "/code/app/index.ts" })).toBe("Read: /code/app/index.ts");
	});

	it("falls back to the tool name when the input says nothing useful", () => {
		expect(describeToolOperation("Glob", { unexpected: 1 })).toBe("Glob");
	});

	it("says nothing without a tool or an input", () => {
		expect(describeToolOperation(null, { command: "ls" })).toBeNull();
		expect(describeToolOperation("Bash", null)).toBeNull();
	});
});

describe("the answer to a question, read off the hook", () => {
	const askUserQuestion = {
		tool_name: "AskUserQuestion",
		tool_input: { questions: [{ question: "Gravar?", options: [{ label: "Gravar" }, { label: "Descartar" }] }] },
	};

	it("carries what was chosen once the question completes", () => {
		const metadata = normalizeHookMetadata(
			"to_in_progress",
			{
				...askUserQuestion,
				hook_event_name: "PostToolUse",
				tool_response: { answers: { "Gravar?": "Descartar" } },
			},
			{},
		);
		expect(metadata?.answer).toBe("Descartar");
	});

	it("carries no answer while the question is still being asked", () => {
		const metadata = normalizeHookMetadata("activity", { ...askUserQuestion, hook_event_name: "PreToolUse" }, {});
		expect(metadata?.answer).toBeUndefined();
	});
});

describe("a question that needs the person's permission to be shown", () => {
	it("keeps the question and its options, not a bare request for approval", () => {
		// Entering review stores this hook's activity before the card is announced. Reduced to
		// "Waiting for approval", the question reached the phone with nothing to read and no
		// options to turn into buttons -- and with no buttons, nothing to close once answered.
		const metadata = normalizeHookMetadata(
			"to_review",
			{
				hook_event_name: "PermissionRequest",
				tool_name: "AskUserQuestion",
				tool_input: {
					questions: [{ question: "Gravar?", options: [{ label: "Gravar" }, { label: "Descartar" }] }],
				},
			},
			{},
		);
		expect(metadata?.activityText).toBe("AskUserQuestion: Gravar? — 1) Gravar 2) Descartar");
	});

	it("still waits for approval on any other tool", () => {
		const metadata = normalizeHookMetadata(
			"to_review",
			{ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "rm -rf dist" } },
			{},
		);
		expect(metadata?.activityText).toBe("Waiting for approval");
	});
});
