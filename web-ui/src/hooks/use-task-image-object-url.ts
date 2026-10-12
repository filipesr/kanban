import { useEffect, useState } from "react";

import type { TaskImage } from "@/types";
import { taskImageToBlob } from "@/utils/task-image-blob";

/**
 * A card image as an object URL, created once per image and revoked when the image changes or
 * the card unmounts. A `data:` URL of up to 5 MB repeated in a style on every render of every
 * card is what this avoids.
 */
export function useTaskImageObjectUrl(image: TaskImage | undefined): string | undefined {
	const [url, setUrl] = useState<string | undefined>(undefined);
	const imageId = image?.id;
	useEffect(() => {
		if (!image) {
			setUrl(undefined);
			return;
		}
		const next = URL.createObjectURL(taskImageToBlob(image));
		setUrl(next);
		return () => {
			URL.revokeObjectURL(next);
		};
		// Keyed by id: the same image re-rendered must not be decoded again.
	}, [imageId]);
	return url;
}
