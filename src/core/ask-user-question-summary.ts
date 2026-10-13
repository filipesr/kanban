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

const MAX_OPTIONS = 6;
const MAX_QUESTION_LENGTH = 200;
const MAX_OPTION_LENGTH = 40;

function readString(value: unknown): string | undefined {
	const text = typeof value === "string" ? value.trim() : "";
	return text ? text : undefined;
}

function clip(value: string, max: number): string {
	return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
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
	const first = Array.isArray(toolInput.questions)
		? (toolInput.questions[0] as Record<string, unknown> | undefined)
		: toolInput;
	if (!first || typeof first !== "object") {
		return undefined;
	}
	const question = readString(first.question) ?? readString(first.header);
	const options = readOptions(first.options);
	if (!question && options.length === 0) {
		return undefined;
	}
	const numbered = options.map((label, index) => `${index + 1}) ${label}`).join("  ");
	return [question ? clip(question, MAX_QUESTION_LENGTH) : undefined, numbered || undefined]
		.filter(Boolean)
		.join(" — ");
}
