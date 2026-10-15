// The append-only log of card and session events, one JSON object per line, next to a project's
// board. It lives beside the board rather than inside it so that clearing the trash -- which
// deletes cards from the board -- never deletes their history.
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type RuntimeTaskEvent, runtimeTaskEventSchema } from "../core/task-events";
import { lockedFileSystem } from "../fs/locked-file-system";

const EVENTS_FILENAME = "events.jsonl";

export function getTaskEventLogPath(workspaceDirectoryPath: string): string {
	return join(workspaceDirectoryPath, EVENTS_FILENAME);
}

/**
 * Appends under the log's own file lock. The board writers already hold the workspace lock when
 * they call this, but session events come from the runtime without it, and both may land at once.
 */
export async function appendTaskEvents(workspaceDirectoryPath: string, events: RuntimeTaskEvent[]): Promise<void> {
	if (events.length === 0) {
		return;
	}
	const path = getTaskEventLogPath(workspaceDirectoryPath);
	const lines = events.map((event) => `${JSON.stringify(event)}\n`).join("");
	await lockedFileSystem.withLock({ path, type: "file" }, async () => {
		await appendFile(path, lines, "utf8");
	});
}

/**
 * Every readable event, oldest first. A line that does not parse -- a write cut short by a crash,
 * or an event type from a newer version -- is skipped rather than failing the whole log.
 */
export async function readTaskEvents(workspaceDirectoryPath: string): Promise<RuntimeTaskEvent[]> {
	let raw: string;
	try {
		raw = await readFile(getTaskEventLogPath(workspaceDirectoryPath), "utf8");
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
	const events: RuntimeTaskEvent[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		const result = runtimeTaskEventSchema.safeParse(parsed);
		if (result.success) {
			events.push(result.data);
		}
	}
	return events.sort((left, right) => left.at - right.at);
}
