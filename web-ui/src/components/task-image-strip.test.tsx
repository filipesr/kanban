import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskImageStrip } from "@/components/task-image-strip";

vi.mock("@/hooks/use-task-image-object-url", () => ({
	useTaskImageObjectUrl: (image: { id: string } | undefined) => (image ? `blob:test/${image.id}` : undefined),
}));

const image = { id: "img1", data: "iVBORw==", mimeType: "image/png", name: "print.png" };

function previewImage(): HTMLImageElement | null {
	return document.body.querySelector<HTMLImageElement>("[data-task-image-preview] img");
}

describe("TaskImageStrip", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// A thumbnail 20px wide shows nothing; the picture has to be seen to be any use.
	it("shows the image at full size when it is clicked", async () => {
		await act(async () => root.render(<TaskImageStrip images={[image]} />));
		const open = container.querySelector<HTMLButtonElement>('button[aria-label="Open print.png"]');
		await act(async () => open?.click());
		expect(previewImage()?.getAttribute("src")).toBe("blob:test/img1");
		expect(previewImage()?.getAttribute("alt")).toBe("print.png");
	});

	// The defect: in the composer the whole chip was the delete button, so looking at the image
	// deleted it.
	it("opens the image instead of deleting it when it can be removed", async () => {
		const onRemoveImage = vi.fn();
		await act(async () => root.render(<TaskImageStrip images={[image]} onRemoveImage={onRemoveImage} />));
		const open = container.querySelector<HTMLButtonElement>('button[aria-label="Open print.png"]');
		await act(async () => open?.click());
		expect(onRemoveImage).not.toHaveBeenCalled();
		expect(previewImage()).not.toBeNull();
	});

	it("deletes only from its own button", async () => {
		const onRemoveImage = vi.fn();
		await act(async () => root.render(<TaskImageStrip images={[image]} onRemoveImage={onRemoveImage} />));
		const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Delete print.png"]');
		await act(async () => remove?.click());
		expect(onRemoveImage).toHaveBeenCalledWith("img1");
		expect(previewImage()).toBeNull();
	});

	it("offers no delete where the images cannot be removed", async () => {
		await act(async () => root.render(<TaskImageStrip images={[image]} />));
		expect(container.querySelector('button[aria-label="Delete print.png"]')).toBeNull();
	});

	// React events cross portals along the component tree, so a press inside the preview reached
	// the card around the strip, which opens and drags on press.
	it("keeps presses inside the preview from reaching what holds the strip", async () => {
		const onCardClick = vi.fn();
		await act(async () =>
			root.render(
				// biome-ignore lint/a11y/useKeyWithClickEvents: stands in for the card that holds the strip
				// biome-ignore lint/a11y/noStaticElementInteractions: stands in for the card that holds the strip
				<div onClick={onCardClick}>
					<TaskImageStrip images={[image]} />
				</div>,
			),
		);
		const open = container.querySelector<HTMLButtonElement>('button[aria-label="Open print.png"]');
		await act(async () => open?.click());
		await act(async () => previewImage()?.click());
		expect(onCardClick).not.toHaveBeenCalled();
	});
});
