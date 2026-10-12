import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

import type { RuntimeTaskImage } from "../core/api-contract";

/**
 * Images given to `task create --image`, as the card stores them.
 *
 * The board already holds images on a card, and the runtime already hands them to the agent when
 * the card starts; this is the CLI's way in, which is how a picture sent with `/task` gets there.
 */

/** Stored base64 inside the board's state file, so every board read pays for its size. */
export const MAX_TASK_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

/** Same id scheme the board uses for an image pasted into the composer. */
function createTaskImageId(): string {
	return globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

export function readTaskImageFiles(paths: readonly string[]): RuntimeTaskImage[] {
	return paths.map((path) => {
		const name = basename(path);
		const mimeType = MIME_TYPE_BY_EXTENSION[extname(path).toLowerCase()];
		if (!mimeType) {
			throw new Error(`Cannot attach ${name}: only png, jpg, gif and webp images are accepted.`);
		}
		let size: number;
		try {
			size = statSync(path).size;
		} catch {
			throw new Error(`Cannot attach ${name}: the file could not be read.`);
		}
		if (size > MAX_TASK_IMAGE_BYTES) {
			throw new Error(`Cannot attach ${name}: images are limited to 5 MB.`);
		}
		return { id: createTaskImageId(), data: readFileSync(path).toString("base64"), mimeType, name };
	});
}
