import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getClaudeCodeProjectDirectory, readClaudeCodeTranscriptRuns } from "../../src/server/claude-code-transcripts";

function line(value: Record<string, unknown>): string {
	return JSON.stringify(value);
}

function userText(text: string, timestamp: string, extra: Record<string, unknown> = {}): string {
	return line({ type: "user", timestamp, message: { role: "user", content: text }, ...extra });
}

function conversationLines(timestamp: string): string[] {
	return [
		userText("Make Done collapsible", timestamp),
		line({
			type: "assistant",
			timestamp,
			message: { role: "assistant", content: [{ type: "text", text: "On it." }] },
		}),
		line({
			type: "assistant",
			timestamp,
			message: {
				role: "assistant",
				content: [{ type: "tool_use", id: "tool-1", name: "Edit", input: { file_path: "a.ts" } }],
			},
		}),
		line({
			type: "user",
			timestamp,
			message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-1", content: "ok" }] },
		}),
	];
}

describe("getClaudeCodeProjectDirectory", () => {
	it("derives the project folder from the worktree path", () => {
		expect(getClaudeCodeProjectDirectory("/Users/a/.cline/worktrees/ab61f/kanban", { HOME: "/h" })).toBe(
			"/h/.claude/projects/-Users-a--cline-worktrees-ab61f-kanban",
		);
		expect(
			getClaudeCodeProjectDirectory("/Users/a/.cline/worktrees/ab61f/kanban", {
				HOME: "/h",
				CLAUDE_CONFIG_DIR: "/c",
			}),
		).toBe("/c/projects/-Users-a--cline-worktrees-ab61f-kanban");
	});
});

describe("readClaudeCodeTranscriptRuns", () => {
	let directory: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "kanban-claude-transcripts-"));
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("turns a transcript into user, assistant and tool messages", async () => {
		await writeFile(join(directory, "s1.jsonl"), conversationLines("2026-11-02T09:00:00Z").join("\n"));

		const runs = await readClaudeCodeTranscriptRuns("task-1", directory);

		expect(runs).toHaveLength(1);
		const messages = runs[0]?.messages ?? [];
		expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
		expect(messages[0]?.content).toBe("Make Done collapsible");
		expect(messages[2]?.meta?.toolName).toBe("Edit");
	});

	it("skips sidechain, meta, command-wrapper and unparseable lines", async () => {
		const timestamp = "2026-11-02T09:00:00Z";
		await writeFile(
			join(directory, "s1.jsonl"),
			[
				"not json",
				line({ type: "attachment", timestamp, attachment: { type: "hook_success" } }),
				userText("<command-name>/clear</command-name>", timestamp),
				userText("injected", timestamp, { isMeta: true }),
				userText("<task-notification> <task-id>a1</task-id> </task-notification>", timestamp),
				...conversationLines(timestamp),
				line({
					type: "assistant",
					timestamp,
					isSidechain: true,
					message: { role: "assistant", content: [{ type: "text", text: "subagent talk" }] },
				}),
				line({
					type: "assistant",
					timestamp,
					message: { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }] },
				}),
			].join("\n"),
		);

		const runs = await readClaudeCodeTranscriptRuns("task-1", directory);

		expect(runs[0]?.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
	});

	it("orders several sessions oldest first and leaves out subagent folders", async () => {
		await writeFile(join(directory, "later.jsonl"), conversationLines("2026-11-02T10:00:00Z").join("\n"));
		await writeFile(join(directory, "earlier.jsonl"), conversationLines("2026-11-02T09:00:00Z").join("\n"));
		await mkdir(join(directory, "earlier"));
		await writeFile(
			join(directory, "earlier", "subagent.jsonl"),
			conversationLines("2026-11-02T08:00:00Z").join("\n"),
		);

		const runs = await readClaudeCodeTranscriptRuns("task-1", directory);

		expect(runs.map((run) => run.startedAt)).toEqual([
			Date.parse("2026-11-02T09:00:00Z"),
			Date.parse("2026-11-02T10:00:00Z"),
		]);
	});

	it("leaves out sessions a program started through the Agent SDK in the worktree", async () => {
		const timestamp = "2026-11-02T09:00:00Z";
		await writeFile(
			join(directory, "card.jsonl"),
			conversationLines(timestamp)
				.map((raw) => JSON.stringify({ ...JSON.parse(raw), entrypoint: "cli" }))
				.join("\n"),
		);
		await writeFile(
			join(directory, "sdk.jsonl"),
			[
				userText("You are Cline, a careful and helpful assistant", "2026-11-02T10:00:00Z", {
					entrypoint: "sdk-cli",
				}),
			].join("\n"),
		);

		const runs = await readClaudeCodeTranscriptRuns("task-1", directory);

		expect(runs).toHaveLength(1);
		expect(runs[0]?.messages[0]?.content).toBe("Make Done collapsible");
	});

	it("returns no runs when the folder does not exist", async () => {
		expect(await readClaudeCodeTranscriptRuns("task-1", join(directory, "missing"))).toEqual([]);
	});
});
