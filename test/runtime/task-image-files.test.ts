import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MAX_TASK_IMAGE_BYTES, readTaskImageFiles } from "../../src/commands/task-image-files";
import { createTempDir } from "../utilities/temp-dir";

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

function fixture(name: string, bytes: Buffer): string {
	const dir = createTempDir("task-image-");
	cleanups.push(dir.cleanup);
	const path = join(dir.path, name);
	writeFileSync(path, bytes);
	return path;
}

describe("readTaskImageFiles", () => {
	it("stores each image as base64 with its type and name", () => {
		const path = fixture("print.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		const [image] = readTaskImageFiles([path]);
		expect(image).toMatchObject({ data: "iVBORw==", mimeType: "image/png", name: "print.png" });
		expect(image?.id).toMatch(/^[0-9a-f]{12}$/);
	});

	it("reads the type from the extension, whatever its case", () => {
		const path = fixture("Foto.JPG", Buffer.from([1, 2, 3]));
		expect(readTaskImageFiles([path])[0]?.mimeType).toBe("image/jpeg");
	});

	// An image the agent cannot open is worse than none: the card would claim to have it.
	it("refuses a type it cannot attach, naming the file", () => {
		const path = fixture("notes.txt", Buffer.from("x"));
		expect(() => readTaskImageFiles([path])).toThrow(/notes\.txt/);
	});

	it("refuses an image over the size limit", () => {
		const path = fixture("huge.png", Buffer.alloc(MAX_TASK_IMAGE_BYTES + 1));
		expect(() => readTaskImageFiles([path])).toThrow(/huge\.png.*5 MB/);
	});

	it("refuses a file that is not there", () => {
		expect(() => readTaskImageFiles(["/nonexistent/print.png"])).toThrow(/print\.png/);
	});
});
