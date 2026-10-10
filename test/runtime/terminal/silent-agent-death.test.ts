import { describe, expect, it } from "vitest";

import { describeSilentAgentDeath } from "../../../src/terminal/silent-agent-death";

const death = {
	taskId: "62ce4",
	binary: "claude",
	args: ["--permission-mode", "auto", "--settings", "/home/me/.cline/kanban/hooks/claude/settings.json"],
	cwd: "/home/me/.cline/worktrees/62ce4/kanban",
	exitCode: 1,
	sawOutput: false,
};

describe("describeSilentAgentDeath", () => {
	it("reports what was launched when the agent dies without a word", () => {
		const line = describeSilentAgentDeath(death);
		expect(line).toContain("exited with code 1");
		expect(line).toContain("claude");
		expect(line).toContain("/home/me/.cline/worktrees/62ce4/kanban");
		expect(line).toContain("--permission-mode auto");
	});

	it("stays quiet when the session printed something", () => {
		// Output is its own evidence; a second record would just be noise.
		expect(describeSilentAgentDeath({ ...death, sawOutput: true })).toBeUndefined();
	});

	it("stays quiet on a clean exit", () => {
		expect(describeSilentAgentDeath({ ...death, exitCode: 0 })).toBeUndefined();
	});

	it("stays quiet when there is no exit code to report", () => {
		// A signalled or still-unknown exit is not the case this exists for.
		expect(describeSilentAgentDeath({ ...death, exitCode: null })).toBeUndefined();
	});

	it("clips a prompt argument instead of dumping a whole task brief", () => {
		const line = describeSilentAgentDeath({
			...death,
			args: ["--permission-mode", "auto", "x".repeat(4000)],
		});
		expect(line).toContain("...");
		expect((line ?? "").length).toBeLessThan(400);
	});
});
