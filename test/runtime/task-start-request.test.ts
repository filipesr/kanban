import { describe, expect, it } from "vitest";

import { buildTaskSessionStartRequest } from "../../src/commands/task";
import type { RuntimeBoardCard } from "../../src/core/api-contract";

function card(patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id: "b4e17",
		title: "desativar a mensagem de ativação",
		prompt: "desativar a mensagem de ativação do agente",
		baseRef: "main",
		startInPlanMode: false,
		createdAt: 1,
		updatedAt: 1,
		...patch,
	} as RuntimeBoardCard;
}

describe("buildTaskSessionStartRequest", () => {
	// The board sends the card's images when it starts a session; the CLI did not, so a card
	// filed with a screenshot and started from Telegram reached its agent without it.
	it("sends the card's images, as the board does", () => {
		const images = [{ id: "a1b2c3d4e5f6", data: "iVBORw==", mimeType: "image/png", name: "print.png" }];
		expect(buildTaskSessionStartRequest(card({ images }), undefined).images).toEqual(images);
	});

	it("sends no images for a card without them", () => {
		expect(buildTaskSessionStartRequest(card(), undefined).images).toBeUndefined();
	});

	it("keeps what it sent before", () => {
		expect(buildTaskSessionStartRequest(card({ agentId: "claude" }), undefined)).toMatchObject({
			taskId: "b4e17",
			prompt: "desativar a mensagem de ativação do agente",
			taskTitle: "desativar a mensagem de ativação",
			startInPlanMode: false,
			baseRef: "main",
			agentId: "claude",
		});
	});
});
