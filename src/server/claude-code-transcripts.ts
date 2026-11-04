// Reads what Claude Code itself kept of a card's conversation, for the Done history view.
// Kanban never records a Claude Code session id, so the card's worktree folder is the only link:
// Claude Code files every session started there under one project folder. Its line format is not
// a public contract, so anything unexpected is skipped rather than failing the whole history.
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { hydratePersistedSessionMessages } from "../cline-sdk/cline-message-repository";
import type { ClineSdkPersistedMessage } from "../cline-sdk/sdk-runtime-boundary";
import type { RuntimeTaskChatMessage } from "../core/api-contract";

/** Prompts Claude Code writes on the user's behalf: slash commands, their output, reminders, background-task notices. */
const INJECTED_USER_TEXT_PREFIXES = ["<command-", "<local-command-", "<system-reminder>", "<task-notification>"];
/**
 * How the card's own session was started. Programs that run the Agent SDK inside a worktree file
 * their sessions in the same folder, marked with another entrypoint; older lines carry none.
 */
const CARD_SESSION_ENTRYPOINT = "cli";

export interface TaskHistoryRun {
	startedAt: number | null;
	messages: RuntimeTaskChatMessage[];
}

export function getClaudeCodeProjectDirectory(worktreePath: string, env: NodeJS.ProcessEnv = process.env): string {
	const configDirectory = env.CLAUDE_CONFIG_DIR?.trim() || join(env.HOME?.trim() || homedir(), ".claude");
	return join(configDirectory, "projects", worktreePath.replace(/[^a-zA-Z0-9]/g, "-"));
}

/** One run per session file in the folder, oldest first. Subagent transcripts live in subfolders and are left out. */
export async function readClaudeCodeTranscriptRuns(
	taskId: string,
	projectDirectory: string,
): Promise<TaskHistoryRun[]> {
	let entries: string[];
	try {
		entries = (await readdir(projectDirectory, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
			.map((entry) => entry.name);
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}

	const runs: TaskHistoryRun[] = [];
	for (const name of entries) {
		const run = parseTranscript(taskId, await readFile(join(projectDirectory, name), "utf8"));
		if (run) {
			runs.push(run);
		}
	}
	return runs.sort((first, second) => (first.startedAt ?? 0) - (second.startedAt ?? 0));
}

function parseTranscript(taskId: string, raw: string): TaskHistoryRun | null {
	const persisted: ClineSdkPersistedMessage[] = [];
	let startedAt: number | null = null;
	for (const rawLine of raw.split("\n")) {
		const message = readConversationLine(rawLine);
		if (!message) {
			continue;
		}
		if (message.entrypoint !== null && message.entrypoint !== CARD_SESSION_ENTRYPOINT) {
			return null;
		}
		persisted.push(message.persisted);
		startedAt ??= message.timestamp;
	}
	if (persisted.length === 0) {
		return null;
	}
	const messages = hydratePersistedSessionMessages(taskId, persisted).filter(
		(message) => message.role !== "reasoning",
	);
	return { startedAt, messages };
}

function readConversationLine(
	rawLine: string,
): { persisted: ClineSdkPersistedMessage; timestamp: number | null; entrypoint: string | null } | null {
	if (!rawLine.trim()) {
		return null;
	}
	let line: unknown;
	try {
		line = JSON.parse(rawLine);
	} catch {
		return null;
	}
	if (!isRecord(line) || (line.type !== "user" && line.type !== "assistant")) {
		return null;
	}
	if (line.isSidechain === true || line.isMeta === true || line.isCompactSummary === true) {
		return null;
	}
	const message = line.message;
	if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) {
		return null;
	}
	const content = convertContent(message.content);
	if (content === null || (message.role === "user" && isInjectedUserText(content))) {
		return null;
	}
	const parsedTimestamp = typeof line.timestamp === "string" ? Date.parse(line.timestamp) : Number.NaN;
	return {
		persisted: { role: message.role, content } as ClineSdkPersistedMessage,
		timestamp: Number.isFinite(parsedTimestamp) ? parsedTimestamp : null,
		entrypoint: typeof line.entrypoint === "string" ? line.entrypoint : null,
	};
}

/** Claude Code's blocks are Anthropic API blocks; the SDK history differs only in how images and thinking are kept. */
function convertContent(content: unknown): ClineSdkPersistedMessage["content"] | null {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return null;
	}
	const blocks = content.filter(isRecord).flatMap((block) => {
		if (block.type === "thinking" || block.type === "redacted_thinking") {
			return [];
		}
		if (block.type === "image") {
			return convertImage(block);
		}
		if (block.type === "tool_result" && Array.isArray(block.content)) {
			return [
				{
					...block,
					content: block.content
						.filter(isRecord)
						.flatMap((part) => (part.type === "image" ? convertImage(part) : [part])),
				},
			];
		}
		return [block];
	});
	// Unchecked beyond the block type: hydration reads each block's fields defensively.
	return blocks.length > 0 ? (blocks as unknown as ClineSdkPersistedMessage["content"]) : null;
}

function convertImage(block: Record<string, unknown>): Record<string, unknown>[] {
	const source = block.source;
	if (!isRecord(source) || typeof source.data !== "string" || typeof source.media_type !== "string") {
		return [];
	}
	return [{ type: "image", data: source.data, mediaType: source.media_type }];
}

function isInjectedUserText(content: ClineSdkPersistedMessage["content"]): boolean {
	const onlyBlock = typeof content === "string" ? null : content.length === 1 ? content[0] : undefined;
	const text = typeof content === "string" ? content : onlyBlock?.type === "text" ? onlyBlock.text : null;
	if (text === null) {
		return false;
	}
	const trimmed = text.trimStart();
	return INJECTED_USER_TEXT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
