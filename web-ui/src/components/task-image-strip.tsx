import { X } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

import { TaskImagePreviewDialog } from "@/components/task-image-preview-dialog";
import type { TaskImage } from "@/types";

interface TaskImageStripProps {
	images: TaskImage[];
	onRemoveImage?: (imageId: string) => void;
	className?: string;
	label?: string | null;
}

/**
 * Attached images as chips. Pressing an image shows it at full size; deleting it is its own
 * button. When the whole chip was the delete button, looking at an image in the composer
 * deleted it.
 */
export function TaskImageStrip({
	images,
	onRemoveImage,
	className,
	label = null,
}: TaskImageStripProps): ReactElement | null {
	const [previewImageId, setPreviewImageId] = useState<string | null>(null);
	const previewImage = images.find((image) => image.id === previewImageId);

	if (images.length === 0) {
		return null;
	}

	return (
		<div className={className}>
			{label ? (
				<div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{label}</div>
			) : null}
			<div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
				{images.map((image) => {
					const name = image.name ?? "image";
					return (
						<div
							key={image.id}
							className="inline-flex max-w-[260px] min-w-0 items-center gap-1 rounded-md border border-border-bright bg-surface-2 py-1 pl-1.5 pr-1 hover:border-border-focus"
						>
							<button
								type="button"
								aria-label={`Open ${name}`}
								// The strip can sit inside a card that opens and drags on press; a press on
								// an image belongs to the image.
								onMouseDown={(event) => event.stopPropagation()}
								onClick={(event) => {
									event.stopPropagation();
									setPreviewImageId(image.id);
								}}
								className="inline-flex min-w-0 cursor-zoom-in items-center gap-1.5"
							>
								<img
									src={`data:${image.mimeType};base64,${image.data}`}
									alt={name}
									className="h-5 w-5 rounded object-cover"
								/>
								<span className="min-w-0 max-w-32 truncate text-[11px] text-text-secondary">
									{image.name ?? "Image"}
								</span>
							</button>
							{onRemoveImage ? (
								<button
									type="button"
									aria-label={`Delete ${name}`}
									onMouseDown={(event) => event.stopPropagation()}
									onClick={(event) => {
										event.stopPropagation();
										onRemoveImage(image.id);
									}}
									className="shrink-0 cursor-pointer rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-status-red"
								>
									<X size={12} />
								</button>
							) : null}
						</div>
					);
				})}
			</div>
			{/* React events cross portals along the component tree: without this, a press inside the
			    preview reached the card around the strip and opened or dragged it. */}
			<div
				onClick={(event) => event.stopPropagation()}
				onMouseDown={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<TaskImagePreviewDialog image={previewImage} onClose={() => setPreviewImageId(null)} />
			</div>
		</div>
	);
}
