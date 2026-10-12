import type { ReactElement } from "react";

import { cn } from "@/components/ui/cn";
import { useTaskImageObjectUrl } from "@/hooks/use-task-image-object-url";
import type { TaskImage } from "@/types";

/**
 * A card's picture behind its content: the image, then the card's own surface at 80% over it,
 * so the text reads as on a plain card and the picture shows through. Both layers sit under the
 * content inside the card's isolated stacking context.
 */
export function BoardCardImageBackdrop({
	image,
	highlighted,
	ringed,
}: {
	image: TaskImage;
	/** Hovered or selected: the panel follows the card's own hover surface. */
	highlighted: boolean;
	/**
	 * Source or target of a dependency being linked. The card's own ring is an inset shadow these
	 * layers would cover, so the panel draws it instead.
	 */
	ringed: boolean;
}): ReactElement {
	const url = useTaskImageObjectUrl(image);
	return (
		<>
			<div
				aria-hidden
				data-card-image-backdrop
				className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-center"
				style={url ? { backgroundImage: `url("${url}")` } : undefined}
			/>
			<div
				aria-hidden
				data-card-image-panel
				className={cn(
					"pointer-events-none absolute inset-0 -z-10",
					highlighted ? "bg-surface-3/80" : "bg-surface-2/80",
					ringed && "shadow-[inset_0_0_0_1px_var(--color-accent)]",
				)}
			/>
		</>
	);
}
