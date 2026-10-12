import type { ReactElement } from "react";

import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import { useTaskImageObjectUrl } from "@/hooks/use-task-image-object-url";
import type { TaskImage } from "@/types";

/**
 * An attached image at the size it can be read at. A thumbnail in a strip is 20px wide, which
 * is enough to tell which image it is and nothing more.
 */
export function TaskImagePreviewDialog({
	image,
	onClose,
}: {
	/** The image to show; nothing is shown while it is undefined. */
	image: TaskImage | undefined;
	onClose: () => void;
}): ReactElement {
	const url = useTaskImageObjectUrl(image);
	return (
		<Dialog
			open={image !== undefined}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			contentClassName="max-w-[min(90vw,1100px)]"
		>
			<DialogHeader title={image?.name ?? "Image"} />
			<DialogBody className="flex items-center justify-center p-2">
				<div data-task-image-preview className="flex min-h-0 items-center justify-center">
					{url ? (
						<img
							src={url}
							alt={image?.name ?? "attached image"}
							className="max-h-[75vh] max-w-full rounded-md object-contain"
						/>
					) : null}
				</div>
			</DialogBody>
		</Dialog>
	);
}
