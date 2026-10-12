import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTaskImageObjectUrl } from "@/hooks/use-task-image-object-url";
import type { TaskImage } from "@/types";

const first: TaskImage = { id: "img1", data: "iVBORw==", mimeType: "image/png", name: "a.png" };
const second: TaskImage = { id: "img2", data: "R0lGOA==", mimeType: "image/gif", name: "b.gif" };

let seen: string | undefined;
function Probe({ image }: { image: TaskImage | undefined }): null {
	seen = useTaskImageObjectUrl(image);
	return null;
}

describe("useTaskImageObjectUrl", () => {
	let container: HTMLDivElement;
	let root: Root;
	const created: string[] = [];
	const revoked: string[] = [];

	beforeEach(() => {
		created.length = 0;
		revoked.length = 0;
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: vi.fn(() => {
				const url = `blob:test/${created.length + 1}`;
				created.push(url);
				return url;
			}),
			revokeObjectURL: vi.fn((url: string) => {
				revoked.push(url);
			}),
		});
		container = document.createElement("div");
		root = createRoot(container);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("decodes an image once and gives its URL", async () => {
		await act(async () => root.render(<Probe image={first} />));
		await act(async () => root.render(<Probe image={first} />));
		expect(seen).toBe("blob:test/1");
		expect(created).toHaveLength(1);
	});

	// A 5 MB image held as a URL nobody revokes stays in memory for the life of the tab.
	it("revokes the URL when the image changes and when the card goes away", async () => {
		await act(async () => root.render(<Probe image={first} />));
		await act(async () => root.render(<Probe image={second} />));
		expect(revoked).toEqual(["blob:test/1"]);
		await act(async () => root.unmount());
		expect(revoked).toEqual(["blob:test/1", "blob:test/2"]);
	});

	it("gives nothing for a card without an image", async () => {
		await act(async () => root.render(<Probe image={undefined} />));
		expect(seen).toBeUndefined();
		expect(created).toHaveLength(0);
	});
});
