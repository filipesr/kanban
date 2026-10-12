import type { TaskImage } from "@/types";

/** A card image as a Blob: decoded once from the base64 the board stores. */
export function taskImageToBlob(image: TaskImage): Blob {
	const binary = atob(image.data);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new Blob([bytes], { type: image.mimeType });
}
