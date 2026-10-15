/**
 * Turns an `AskUserQuestion` tool input into one line a person can act on.
 *
 * Measured on 11/10/2026: without this, a card asking a question announced itself as "Using
 * AskUserQuestion" and nothing else. Someone away from the board learned that a card wanted
 * them, had to open the board to read the question, and -- because the prompt is an interactive
 * selection -- had to know to answer with the option's number. Answering in prose is accepted
 * by the terminal and silently ignored.
 *
 * So the options are numbered here. The number is not decoration: it is the answer.
 */

import { existsSync, statSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_OPTIONS = 6;
const MAX_QUESTION_LENGTH = 200;
/**
 * A question with pictures is usually asking to approve what they show, and carries the text
 * being approved with them: on 15/10/2026, an Instagram post's caption of up to ~1200 characters.
 * Clipped at 200 the person would approve a caption they could not read, so such a question is
 * kept whole up to this, and how much a chat shows at once is the connector's call.
 */
const MAX_ILLUSTRATED_QUESTION_LENGTH = 2000;
const MAX_OPTION_LENGTH = 40;

function readString(value: unknown): string | undefined {
	const text = typeof value === "string" ? value.trim() : "";
	return text ? text : undefined;
}

function clip(value: string, max: number): string {
	return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A Markdown image, `![alt](path)` or `![alt](<path with spaces>)`, with an optional title.
 * Global, so every use must go through `matchAll`/`replace`, which reset `lastIndex`.
 */
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/**
 * The formats a chat can show as a photo. Anything else -- an SVG, a PDF, a GIF that would
 * arrive as a still -- is better left as the path in the question than sent as a broken picture.
 */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** What the hub contract allows per notification, and roughly what a chat album holds. */
const MAX_QUESTION_IMAGES = 10;

/**
 * The question as a person reads it: the pictures it points at are delivered as pictures, so
 * their markdown would only be noise. Costly noise, too: on 15/10/2026 the one image in an
 * Instagram draft approval ("Aprovar este rascunho? ![](marketing/.../final/01.jpg)") was 67 of
 * the 200 characters the question is allowed, and with three the question itself was clipped.
 */
function stripMarkdownImages(value: string): string {
	return value.replace(MARKDOWN_IMAGE, " ");
}

/**
 * The tidying a multi-line question gets instead of being flattened: its line breaks are the
 * agent's -- a caption's paragraphs -- so only runs of spaces and tabs, trailing spaces, and
 * more than one blank line in a row go.
 */
export function tidyQuestionText(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * The question as shown. One with pictures loses their markdown and keeps its lines, and its
 * length up to the larger cap; one without is exactly what it always was.
 */
function readQuestionText(value: unknown, illustrated: boolean): string | undefined {
	const text = readString(value);
	if (!text) {
		return undefined;
	}
	if (!illustrated) {
		return clip(text, MAX_QUESTION_LENGTH);
	}
	const tidied = readString(tidyQuestionText(stripMarkdownImages(text)));
	return tidied ? clip(tidied, MAX_ILLUSTRATED_QUESTION_LENGTH) : undefined;
}

function readFirstQuestion(toolInput: Record<string, unknown>): Record<string, unknown> | undefined {
	const first = Array.isArray(toolInput.questions)
		? (toolInput.questions[0] as Record<string, unknown> | undefined)
		: toolInput;
	return first && typeof first === "object" ? first : undefined;
}

function readOptions(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const labels: string[] = [];
	for (const option of value.slice(0, MAX_OPTIONS)) {
		const label =
			typeof option === "string"
				? readString(option)
				: readString((option as Record<string, unknown> | null)?.label);
		if (label) {
			labels.push(clip(label, MAX_OPTION_LENGTH));
		}
	}
	return labels;
}

/**
 * What was chosen, read off the tool's response once the question completes. Only the first
 * question's answer: it is the one `summarizeAskUserQuestion` showed, so it is the one a reader
 * elsewhere is waiting to see settled.
 */
export function readAskUserQuestionAnswer(
	toolResponse: Record<string, unknown> | null | undefined,
): string | undefined {
	const answers = toolResponse?.answers;
	if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
		return undefined;
	}
	const byQuestion = answers as Record<string, unknown>;
	const first = Array.isArray(toolResponse?.questions)
		? readString((toolResponse.questions[0] as Record<string, unknown> | undefined)?.question)
		: undefined;
	const answer = (first ? byQuestion[first] : undefined) ?? Object.values(byQuestion)[0];
	return readString(answer);
}

/**
 * Accepts both shapes the tool is seen with: a `questions` array, and a single question at the
 * top level. A shape we do not recognize returns nothing, so the caller keeps its own fallback
 * instead of showing a mangled guess.
 */
export function summarizeAskUserQuestion(toolInput: Record<string, unknown> | null | undefined): string | undefined {
	if (!toolInput) {
		return undefined;
	}
	const first = readFirstQuestion(toolInput);
	if (!first) {
		return undefined;
	}
	const illustrated = readAskUserQuestionImageRefs(toolInput).length > 0;
	const header = readString(first.header);
	const question =
		readQuestionText(first.question, illustrated) ?? (header ? clip(header, MAX_QUESTION_LENGTH) : undefined);
	const options = readOptions(first.options);
	if (!question && options.length === 0) {
		return undefined;
	}
	const numbered = options.map((label, index) => `${index + 1}) ${label}`).join("  ");
	return [question, numbered || undefined].filter(Boolean).join(" — ");
}

/**
 * The pictures the first question points at, as written: in its text, or in an option's
 * `description` or `preview` -- where an agent puts the draft each choice is about. In the order
 * they appear, each once. Only the first question, for the same reason as the summary: it is
 * the one shown with buttons.
 */
export function readAskUserQuestionImageRefs(toolInput: Record<string, unknown> | null | undefined): string[] {
	const first = toolInput ? readFirstQuestion(toolInput) : undefined;
	if (!first) {
		return [];
	}
	const texts: unknown[] = [first.question];
	if (Array.isArray(first.options)) {
		for (const option of first.options) {
			if (option && typeof option === "object") {
				const record = option as Record<string, unknown>;
				texts.push(record.description, record.preview);
			}
		}
	}
	const refs: string[] = [];
	for (const text of texts) {
		if (typeof text !== "string") {
			continue;
		}
		for (const match of text.matchAll(MARKDOWN_IMAGE)) {
			const ref = (match[1] ?? match[2] ?? "").trim();
			if (ref && !refs.includes(ref)) {
				refs.push(ref);
			}
		}
	}
	return refs;
}

function isExistingFile(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * The pictures a question points at, as absolute paths a subscriber on this machine can open.
 *
 * Resolved here, in the hook, because only here is the agent's `cwd` known: an agent writes
 * paths relative to its card's worktree, and the board -- or the hub, or a chat connector --
 * runs elsewhere and would resolve them against the wrong directory. A path that does not
 * exist, or is not a picture a chat can show, is dropped rather than sent to fail later.
 */
export function resolveAskUserQuestionImages(
	toolInput: Record<string, unknown> | null | undefined,
	cwd: string | null | undefined,
	fileExists: (path: string) => boolean = isExistingFile,
): string[] {
	const images: string[] = [];
	for (const ref of readAskUserQuestionImageRefs(toolInput)) {
		if (images.length >= MAX_QUESTION_IMAGES) {
			break;
		}
		let path = ref;
		if (/^file:\/\//i.test(path)) {
			try {
				path = fileURLToPath(path);
			} catch {
				continue;
			}
		} else if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) {
			// A URL (https:, data:) is not a file on this machine; a Windows drive is.
			continue;
		}
		if (!isAbsolute(path)) {
			if (!cwd) {
				continue;
			}
			path = resolve(cwd, path);
		}
		if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase()) || images.includes(path) || !fileExists(path)) {
			continue;
		}
		images.push(path);
	}
	return images;
}
