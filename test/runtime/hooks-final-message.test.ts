import { describe, expect, it } from "vitest";

import { normalizeHookMetadata } from "../../src/commands/hooks";

describe("the final message a hook carries", () => {
	// The conclusion reached the phone as one run-on paragraph: the hook flattened it before the
	// runtime ever saw it, so every line, list and paragraph the agent wrote was gone.
	it("keeps the agent's lines, lists and paragraphs", () => {
		const metadata = normalizeHookMetadata(
			"to_review",
			{
				hook_event_name: "Stop",
				transcript_path: "/Users/me/.claude/projects/x/session.jsonl",
				last_assistant_message: "O commit está feito.   \n\n- **Hash:** `189af67`\n- **Conflitos:** nenhum\n",
			},
			{},
		);
		expect(metadata?.finalMessage).toBe("O commit está feito.\n\n- **Hash:** `189af67`\n- **Conflitos:** nenhum");
	});

	// The card's one-line activity is still one line.
	it("still flattens the activity line shown on the card", () => {
		const metadata = normalizeHookMetadata(
			"to_review",
			{
				hook_event_name: "Stop",
				transcript_path: "/Users/me/.claude/projects/x/session.jsonl",
				last_assistant_message: "linha um\n\nlinha dois",
			},
			{},
		);
		expect(metadata?.activityText).not.toContain("\n");
	});
});
