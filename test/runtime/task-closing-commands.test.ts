import { describe, expect, it } from "vitest";

import { assertPushableBase } from "../../src/commands/task";

describe("assertPushableBase", () => {
	it("allows pushing the card's base when it is checked out", () => {
		expect(() => assertPushableBase("main", "main")).not.toThrow();
	});

	// Pushing whatever happens to be checked out would ship a branch the card never touched.
	it("refuses when the repository is on another branch", () => {
		expect(() => assertPushableBase("other", "main")).toThrow(/main/);
		expect(() => assertPushableBase(null, "main")).toThrow(/main/);
	});
});
