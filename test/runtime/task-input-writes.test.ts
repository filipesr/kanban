import { describe, expect, it } from "vitest";

import { planTaskInputDelivery } from "../../src/commands/task";

const PASTE_START = "\u001b[200~";
const PASTE_END = "\u001b[201~";

describe("planTaskInputDelivery", () => {
	// The defect: an answer from Telegram ("faz o merge com o main") reached a Claude Code card
	// as typed text and sat in its prompt. A newline that arrives with the text is a line break
	// to a terminal agent, not Enter, so somebody had to open the card to submit it.
	it("submits to a terminal agent with a separate Enter, as the board does", () => {
		expect(planTaskInputDelivery({ agentId: "claude", pid: 7 }, "faz o merge com o main")).toEqual({
			kind: "terminal",
			writes: [
				{ text: "faz o merge com o main", appendNewline: false },
				{ text: "\r", appendNewline: false },
			],
		});
	});

	it("treats a session with no known agent as a terminal", () => {
		expect(planTaskInputDelivery({ agentId: null, pid: 7 }, "sim")).toMatchObject({ kind: "terminal" });
	});

	// The commit prompt is twenty lines. Typed as keystrokes, each newline is a key press the
	// agent's prompt interprets; pasted, it is one block of text, which is how the board sends it.
	it("pastes text that spans lines, then presses Enter", () => {
		expect(planTaskInputDelivery({ agentId: "claude", pid: 7 }, "Commit.\nThen report.")).toEqual({
			kind: "terminal",
			writes: [
				{ text: `${PASTE_START}Commit.\nThen report.${PASTE_END}`, appendNewline: false },
				{ text: "\r", appendNewline: false },
			],
		});
	});

	// A native Cline session has no process of its own (`pid` is always null), so the old pid
	// check refused every one of them. It takes text as a chat message, which the runtime can
	// also deliver to a persisted session by rebinding it.
	it("sends a native Cline session a chat message, whatever its pid", () => {
		expect(planTaskInputDelivery({ agentId: "cline", pid: null }, "sim")).toEqual({ kind: "chat" });
		expect(planTaskInputDelivery({ agentId: "cline", pid: null }, "Commit.", "act")).toEqual({
			kind: "chat",
			mode: "act",
		});
	});

	it("refuses a terminal agent whose process is gone, and a card with no session", () => {
		expect(planTaskInputDelivery({ agentId: "claude", pid: null }, "sim")).toEqual({ kind: "refuse" });
		expect(planTaskInputDelivery(null, "sim")).toEqual({ kind: "refuse" });
	});
});
