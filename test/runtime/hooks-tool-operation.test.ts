import { describe, expect, it } from "vitest";

import { describeToolOperation } from "../../src/commands/hooks";

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
