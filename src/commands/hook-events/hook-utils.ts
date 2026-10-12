export function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

/**
 * An agent's message as it wrote it: lines, lists and paragraphs kept, only trailing spaces and
 * runs of blank lines removed. `normalizeWhitespace` is for one-line fields; applied to a final
 * message it turned a conclusion into one run-on paragraph.
 */
export function normalizeMessageText(value: string): string {
	return value
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** `readStringField` for a field holding a message, whose line breaks are part of it. */
export function readMessageField(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	if (typeof value !== "string") {
		return null;
	}
	const normalized = normalizeMessageText(value);
	return normalized.length > 0 ? normalized : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

export function readStringField(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	if (typeof value !== "string") {
		return null;
	}
	const normalized = normalizeWhitespace(value);
	return normalized.length > 0 ? normalized : null;
}

export function readNestedString(record: Record<string, unknown>, path: string[]): string | null {
	let current: unknown = record;
	for (const key of path) {
		const candidate = asRecord(current);
		if (!candidate || !(key in candidate)) {
			return null;
		}
		current = candidate[key];
	}
	if (typeof current !== "string") {
		return null;
	}
	const normalized = normalizeWhitespace(current);
	return normalized.length > 0 ? normalized : null;
}
