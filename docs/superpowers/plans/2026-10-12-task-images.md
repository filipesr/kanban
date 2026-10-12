# Task Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A photo sent with a `/task` caption becomes an image on the Kanban card. The board shows it as the card's background, and the card's agent receives it when the card starts.

**Architecture:** Three changes. Kanban's CLI gains `task create --image <path>`, and `task start` forwards the card's images, which the runtime already turns into files for the agent. The web-ui renders `card.images`: a background behind an 80% panel on the card, and a read-only strip when the card is open. The Cline connector exposes the incoming message's photos to commands through a lazy `context.images()`, which saves them to disk, and `/task` passes them on as `--image`.

**Tech Stack:** TypeScript, commander, vitest, React 19 + Tailwind v4 (web-ui), `chat` lib + `@chat-adapter/telegram` (connector).

**Spec:** `docs/superpowers/specs/2026-10-12-task-images-design.md`

## Global Constraints

- Repos: Kanban `/Users/fsrezende/Documents/algorithm/kanban` (`feat/hub-notify-on-review`); Cline `/Users/fsrezende/Documents/algorithm/cline` (`feat/kanban-chat-loop`).
- **No commits.** Per AGENTS.md, commit only when the user asks.
- No `any`, no inline or dynamic imports. Use Tailwind classes; inline `style` only for the dynamic background image. No `dark:` prefixes.
- Accepted image extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`. Max **5 MB** per image. Anything else is refused, and no card is created.
- Card image: `{ id, data (base64), mimeType, name }`, with `id = crypto.randomUUID().replaceAll("-", "").slice(0, 12)`, the same scheme as `web-ui/src/components/task-image-input-utils.ts:36`.
- Card with images: `min-h-28`, content panel `bg-surface-2/80` (hover/selected `bg-surface-3/80`), first image as `cover` background, count shown only for more than one image.
- Connector image dir: `<clineDataDir>/connectors/<transport>/task-images/<uuid>/`. Removed after a plain `/task`, kept for `--brainstorm`, and pruned on connector start when older than 7 days.
- Reply copy: `… (card <id>, 1 imagem)` / `… (card <id>, N imagens)`; when a download failed, `… — a imagem não pôde ser baixada` (plural: `N imagens não puderam ser baixadas`).
- Kanban tests: `npx vitest run <path>`; `npm run typecheck`; web-ui: `npm --prefix web-ui run test -- --run <path>` and `npm run web:typecheck`; lint: `npx biome check <files>`.
- Cline tests: `cd apps/cli && npx vitest run --config vitest.config.ts <path>`; `npx tsc --noEmit -p .`; lint: `npx biome check <files>` from the cline root.

## Review Focus

- **A photo sent "as a file" (document `image/png`).** It is attached like a compressed photo. Test in Task 5.
- **An image over 5 MB, or an unsupported type, reaching `/task`.** The person reads Kanban's reason, not a stack trace, and no card exists. Tests in Task 1 (Kanban refuses) and Task 6 (the reason is replied).
- **A Telegram download that fails.** The card is still filed from the caption, and the reply says the picture could not be downloaded. Test in Task 6.
- **A card with no images.** It renders exactly as before: no backdrop, no extra height, no count. Test in Task 4.
- **The object URL is never leaked.** It is revoked when the card unmounts and when its image changes. Test in Task 3.

---

## File map

**Kanban**
- `src/commands/task-image-files.ts` (new): `readTaskImageFiles(paths)`.
- `src/commands/task.ts`: `--image` on `task create`; `buildTaskSessionStartRequest` used by `startTask`.
- `web-ui/src/utils/task-image-blob.ts` (new): `taskImageToBlob`, `openTaskImage`.
- `web-ui/src/hooks/use-task-image-object-url.ts` (new).
- `web-ui/src/components/board-card-image-backdrop.tsx` (new).
- `web-ui/src/components/board-card.tsx`: backdrop, count, strip when selected.
- `web-ui/src/components/task-image-strip.tsx`: optional `onOpenImage`.

**Cline**
- `apps/cli/src/connectors/message-images.ts` (new): `saveMessageImages`, `pruneOldImageDirs`.
- `apps/cli/src/utils/chat-commands.ts`: `ChatCommandContext.images`; `/task` uses it.
- `apps/cli/src/utils/kanban-task.ts`: `KanbanTaskRequest.images`, `--image` args, brainstorm prompt, reply suffix.
- `apps/cli/src/connectors/connector-host.ts`: `images` on the turn input, passed to the command context.
- `apps/cli/src/connectors/adapters/telegram.ts`: pass the message's attachments; prune on start.

---

### Task 1: `kanban task create --image`

**Files:**
- Create: `src/commands/task-image-files.ts`
- Modify: `src/commands/task.ts` (`createTask` input and the `addTaskToColumn` call; the `create` command options and action)
- Test: `test/runtime/task-image-files.test.ts`

**Interfaces:**
- Produces: `export const MAX_TASK_IMAGE_BYTES = 5 * 1024 * 1024;` and `export function readTaskImageFiles(paths: readonly string[]): RuntimeTaskImage[]`, which throws `Error` naming the file for an unsupported extension, an oversize file, or an unreadable file.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run test/runtime/task-image-files.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement `src/commands/task-image-files.ts`**

```ts
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
```

- [ ] **Step 4: Run it and check that it passes**

Run: `npx vitest run test/runtime/task-image-files.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Wire `--image` into `task create`**

In `src/commands/task.ts`:
- Add `images?: RuntimeTaskImage[];` to `createTask`'s input type (import the type from `../core/api-contract`). Pass `images: input.images` in the `addTaskToColumn(..., { … })` object, next to `source`.
- Add to the `create` command, after `--source`:

  ```ts
  .option(
  	"--image <path>",
  	"Attach an image (png, jpg, gif, webp; up to 5 MB). Repeat for several.",
  	(value: string, previous: string[]) => [...previous, value],
  	[] as string[],
  )
  ```

- In the action's `options` type add `image: string[];`, and pass `images: options.image.length > 0 ? readTaskImageFiles(options.image) : undefined` to `createTask`. Import `readTaskImageFiles` at the top.
- Add to the returned `task` record: `...(created.images?.length ? { imageCount: created.images.length } : {})`.
- Add `.RI [ --image " " path ]` to the `create` entry in `man/kanban.1`.

Run: `npx vitest run test/runtime/task-image-files.test.ts test/runtime/format-task-record.test.ts && npm run typecheck && npx biome check src/commands test/runtime/task-image-files.test.ts`
Expected: PASS and clean. A refusal surfaces through `runTaskCommand` as `{ ok: false, error: "Task command failed at …: Cannot attach …" }`, and because `readTaskImageFiles` runs before `createTask`, no card is created.

---

### Task 2: `task start` carries the card's images

**Files:**
- Modify: `src/commands/task.ts` (`startTask`, the `startTaskSession.mutate` call around line 986)
- Test: `test/runtime/task-start-request.test.ts`

**Interfaces:**
- Produces: `export function buildTaskSessionStartRequest(task: RuntimeBoardCard, agentOverride: RuntimeAgentId | null | undefined)`, which returns the object passed to `runtime.startTaskSession.mutate`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { buildTaskSessionStartRequest } from "../../src/commands/task";
import type { RuntimeBoardCard } from "../../src/core/api-contract";

function card(patch: Partial<RuntimeBoardCard> = {}): RuntimeBoardCard {
	return {
		id: "b4e17",
		title: "desativar a mensagem de ativação",
		prompt: "desativar a mensagem de ativação do agente",
		baseRef: "main",
		startInPlanMode: false,
		createdAt: 1,
		updatedAt: 1,
		...patch,
	} as RuntimeBoardCard;
}

describe("buildTaskSessionStartRequest", () => {
	// The board sends the card's images when it starts a session; the CLI did not, so a card
	// filed with a screenshot and started from Telegram reached its agent without it.
	it("sends the card's images, as the board does", () => {
		const images = [{ id: "a1b2c3d4e5f6", data: "iVBORw==", mimeType: "image/png", name: "print.png" }];
		expect(buildTaskSessionStartRequest(card({ images }), undefined).images).toEqual(images);
	});

	it("sends no images for a card without them", () => {
		expect(buildTaskSessionStartRequest(card(), undefined).images).toBeUndefined();
	});

	it("keeps what it sent before", () => {
		expect(buildTaskSessionStartRequest(card({ agentId: "claude" }), undefined)).toMatchObject({
			taskId: "b4e17",
			prompt: "desativar a mensagem de ativação do agente",
			taskTitle: "desativar a mensagem de ativação",
			startInPlanMode: false,
			baseRef: "main",
			agentId: "claude",
		});
	});
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest run test/runtime/task-start-request.test.ts`
Expected: FAIL, because `buildTaskSessionStartRequest` is not exported.

- [ ] **Step 3: Implement**

Add the function next to `resolveStartAgentId` in `src/commands/task.ts`:

```ts
/** What starting a card's session sends: the same fields the board sends, images included. */
export function buildTaskSessionStartRequest(task: RuntimeBoardCard, agentOverride: RuntimeAgentId | null | undefined) {
	return {
		taskId: task.id,
		prompt: task.prompt,
		taskTitle: task.title,
		images: task.images && task.images.length > 0 ? task.images : undefined,
		startInPlanMode: task.startInPlanMode,
		baseRef: task.baseRef,
		agentId: resolveStartAgentId(agentOverride, task.agentId),
		clineSettings: task.clineSettings,
	};
}
```

Replace the object in `startTask`'s `runtimeClient.runtime.startTaskSession.mutate({ … })` with `buildTaskSessionStartRequest(task, input.agentId)`.

- [ ] **Step 4: Verify**

Run: `npx vitest run test/runtime/task-start-request.test.ts test/runtime/format-task-record.test.ts && npm run typecheck`
Expected: PASS. The returned type must satisfy the mutation input; if `startInPlanMode` is optional on `RuntimeBoardCard`, tsc will say so, and the fix is to keep the field as the old code passed it.

---

### Task 3: An image as an object URL

**Files:**
- Create: `web-ui/src/utils/task-image-blob.ts`
- Create: `web-ui/src/hooks/use-task-image-object-url.ts`
- Test: `web-ui/src/hooks/use-task-image-object-url.test.tsx`

**Interfaces:**
- Produces: `export function taskImageToBlob(image: TaskImage): Blob`; `export function openTaskImage(image: TaskImage): void`, which opens it in a new tab and revokes the URL after 60 s; `export function useTaskImageObjectUrl(image: TaskImage | undefined): string | undefined`.

- [ ] **Step 1: Write the failing test**

```tsx
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
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npm --prefix web-ui run test -- --run src/hooks/use-task-image-object-url.test.tsx`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement**

`web-ui/src/utils/task-image-blob.ts`:

```ts
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

/** Seconds a tab gets to load the image before its URL is released. */
const OPENED_IMAGE_URL_LIFETIME_MS = 60_000;

/** Opens the image at full size in a new tab. */
export function openTaskImage(image: TaskImage): void {
	const url = URL.createObjectURL(taskImageToBlob(image));
	window.open(url, "_blank", "noopener");
	window.setTimeout(() => URL.revokeObjectURL(url), OPENED_IMAGE_URL_LIFETIME_MS);
}
```

`web-ui/src/hooks/use-task-image-object-url.ts`:

```ts
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [imageId]);
	return url;
}
```

Before keeping the `eslint-disable` comment, check whether this repo lints hooks at all (`rg -n "exhaustive-deps" web-ui/src | head`); drop the comment if it does not. Biome flags `useExhaustiveDependencies` — if it does, use `// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by image id so the same image is not decoded twice` instead.

- [ ] **Step 4: Verify**

Run: `npm --prefix web-ui run test -- --run src/hooks/use-task-image-object-url.test.tsx && npm run web:typecheck`
Expected: PASS (3).

---

### Task 4: The board shows the picture

**Files:**
- Create: `web-ui/src/components/board-card-image-backdrop.tsx`
- Modify: `web-ui/src/components/board-card.tsx` (imports; `showTopRow` at line 331; the inner card `div` at ~588; the top row at ~600; after the `{displayDescription ? (…) : null}` block)
- Modify: `web-ui/src/components/task-image-strip.tsx` (optional `onOpenImage`)
- Test: `web-ui/src/components/board-card.test.tsx`, `web-ui/src/components/task-image-strip.test.tsx` (new)

**Spec ruling:** the spec's "detail view" is not a separate component. The detail view's left column (`detail-panels/column-context-panel.tsx:186`) renders `BoardCard` with `selected`, and that card is where the prompt is shown. So the read-only strip goes in `BoardCard`, shown when `selected`.

**Interfaces:**
- Consumes: `useTaskImageObjectUrl`, `openTaskImage` (Task 3).
- Produces: `BoardCardImageBackdrop({ image, highlighted }: { image: TaskImage; highlighted: boolean })`; `TaskImageStrip` prop `onOpenImage?: (image: TaskImage) => void`.

- [ ] **Step 1: Write the failing tests**

Add to `board-card.test.tsx`. The file already stubs `@/utils/react-use`; add this mock next to the others so no real decoding runs:

```tsx
vi.mock("@/hooks/use-task-image-object-url", () => ({
	useTaskImageObjectUrl: (image: { id: string } | undefined) => (image ? `blob:test/${image.id}` : undefined),
}));
```

Then add tests to the `describe("BoardCard")` block:

```tsx
	const pngImage = (id: string) => ({ id, data: "iVBORw==", mimeType: "image/png", name: `${id}.png` });

	it("shows a card's first image behind its content", async () => {
		await act(async () => {
			root.render(<BoardCard card={createCard({ images: [pngImage("img1")] })} index={0} columnId="backlog" />);
		});
		const backdrop = container.querySelector<HTMLElement>("[data-card-image-backdrop]");
		expect(backdrop?.style.backgroundImage).toContain("blob:test/img1");
		expect(container.querySelector("[data-card-image-panel]")?.className).toContain("bg-surface-2/80");
		expect(container.querySelector(".min-h-28")).not.toBeNull();
	});

	it("leaves a card without images exactly as it was", async () => {
		await act(async () => {
			root.render(<BoardCard card={createCard()} index={0} columnId="backlog" />);
		});
		expect(container.querySelector("[data-card-image-backdrop]")).toBeNull();
		expect(container.querySelector(".min-h-28")).toBeNull();
		expect(container.querySelector("[data-card-image-count]")).toBeNull();
	});

	it("counts the images when there is more than one", async () => {
		await act(async () => {
			root.render(
				<BoardCard card={createCard({ images: [pngImage("img1"), pngImage("img2")] })} index={0} columnId="backlog" />,
			);
		});
		const count = container.querySelector("[data-card-image-count]");
		expect(count?.textContent).toBe("2");
		expect(count?.getAttribute("aria-label")).toBe("2 imagens");
	});

	it("lists the images on the card that is open", async () => {
		await act(async () => {
			root.render(
				<BoardCard card={createCard({ images: [pngImage("img1")] })} index={0} columnId="backlog" selected />,
			);
		});
		expect(container.textContent).toContain("img1.png");
	});
```

Create `task-image-strip.test.tsx`:

```tsx
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskImageStrip } from "@/components/task-image-strip";

const image = { id: "img1", data: "iVBORw==", mimeType: "image/png", name: "print.png" };

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

	it("opens an image when it can", async () => {
		const onOpenImage = vi.fn();
		await act(async () => root.render(<TaskImageStrip images={[image]} onOpenImage={onOpenImage} />));
		const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open print.png"]');
		await act(async () => button?.click());
		expect(onOpenImage).toHaveBeenCalledWith(image);
	});

	it("stays a plain list when it cannot", async () => {
		await act(async () => root.render(<TaskImageStrip images={[image]} />));
		expect(container.querySelector("button")).toBeNull();
	});
});
```

If `TaskImageStrip` needs the `TooltipProvider` to render (it uses `Tooltip` only on the remove path), wrap it as `board-card.test.tsx` does.

- [ ] **Step 2: Run them and check that they fail**

Run: `npm --prefix web-ui run test -- --run src/components/board-card.test.tsx src/components/task-image-strip.test.tsx`
Expected: the five new tests FAIL (no backdrop, no count, no strip, no open button). The no-image test passes already; that is expected, since it guards today's behaviour.

- [ ] **Step 3: Implement the backdrop**

`web-ui/src/components/board-card-image-backdrop.tsx`:

```tsx
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
}: {
	image: TaskImage;
	/** Hovered or selected: the panel follows the card's own hover surface. */
	highlighted: boolean;
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
				)}
			/>
		</>
	);
}
```

- [ ] **Step 4: Use it in `board-card.tsx`**

- Imports: `import { Image as ImageIcon } from "lucide-react";` (add it to the existing lucide import), `BoardCardImageBackdrop`, `TaskImageStrip`, `openTaskImage`.
- After `const visibleTags = …`, add:

  ```tsx
  const cardImages = card.images ?? [];
  const backdropImage = cardImages[0];
  ```

- `showTopRow` (line 331) becomes `hasCardAttributes(card) || Boolean(sourceIcon) || Boolean(cardDate) || cardImages.length > 1`.
- In the inner card `div`'s `cn(...)` (~588), add `backdropImage && "relative isolate min-h-28 overflow-hidden"`, and render the backdrop as its first child: `{backdropImage ? <BoardCardImageBackdrop image={backdropImage} highlighted={Boolean(selected) || (isHovered && isCardInteractive)} /> : null}`.
- In the top row (~600), before the date `span`, add:

  ```tsx
  {cardImages.length > 1 ? (
  	<span
  		data-card-image-count
  		aria-label={`${cardImages.length} imagens`}
  		className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-text-tertiary"
  	>
  		<ImageIcon size={12} aria-hidden />
  		{cardImages.length}
  	</span>
  ) : null}
  ```

  The visible text must be just the number: `textContent` is checked as `"2"`. Keep the icon `aria-hidden`.
- After the `{displayDescription ? (…) : null}` block, add:

  ```tsx
  {selected && cardImages.length > 0 ? (
  	<TaskImageStrip images={cardImages} onOpenImage={openTaskImage} className="mt-2" />
  ) : null}
  ```

  The card's existing click and drag handlers must not fire on a thumbnail click: the strip's buttons call `event.stopPropagation()` (Step 5).

- [ ] **Step 5: Make the strip openable**

In `task-image-strip.tsx`, add `onOpenImage?: (image: TaskImage) => void;` to the props. In the read-only branch (`if (!onRemoveImage)`), when `onOpenImage` is set, render a `button` instead of the `div`:

```tsx
if (!onRemoveImage) {
	const chipClassName =
		"inline-flex max-w-[260px] min-w-0 items-center gap-1.5 rounded-md border border-border-bright bg-surface-2 px-1.5 py-1";
	return onOpenImage ? (
		<button
			key={image.id}
			type="button"
			aria-label={`Open ${image.name ?? "image"}`}
			onMouseDown={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.stopPropagation();
				onOpenImage(image);
			}}
			className={cn(chipClassName, "cursor-pointer hover:border-border-focus")}
		>
			{preview}
		</button>
	) : (
		<div key={image.id} className={chipClassName}>
			{preview}
		</div>
	);
}
```

- [ ] **Step 6: Verify**

Run: `npm --prefix web-ui run test -- --run src/components && npm run web:typecheck && npx biome check web-ui/src/components web-ui/src/hooks web-ui/src/utils`
Expected: PASS and clean.

---

### Task 5: The connector can read a message's pictures

**Repository:** cline.

**Files:**
- Create: `apps/cli/src/connectors/message-images.ts`
- Modify: `apps/cli/src/utils/chat-commands.ts` (`ChatCommandContext`, around line 36)
- Modify: `apps/cli/src/connectors/connector-host.ts` (turn input type near `react?` at 346; the command context built at ~632)
- Modify: `apps/cli/src/connectors/adapters/telegram.ts` (`handleTurn` signature at 1228 and its call sites, e.g. 1563; connector start, for pruning)
- Test: `apps/cli/src/connectors/message-images.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface IncomingImages { dir: string; paths: string[]; failed: number }
  export interface MessageAttachmentLike { type?: string; mimeType?: string; name?: string; fetchData?: () => Promise<Buffer> }
  export async function saveMessageImages(input: { attachments: readonly MessageAttachmentLike[] | undefined; rootDir: string }): Promise<IncomingImages | undefined>
  export async function pruneOldImageDirs(rootDir: string, maxAgeMs: number, now?: number): Promise<void>
  // ChatCommandContext:
  images?: () => Promise<IncomingImages | undefined>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { pruneOldImageDirs, saveMessageImages } from "./message-images";

const roots: string[] = [];
function root(): string {
	const dir = mkdtempSync(join(tmpdir(), "msg-images-"));
	roots.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("saveMessageImages", () => {
	it("saves a photo with the extension of its type", async () => {
		const saved = await saveMessageImages({
			rootDir: root(),
			attachments: [{ type: "image", mimeType: "image/jpeg", fetchData: async () => Buffer.from([1, 2]) }],
		});
		expect(saved?.paths).toHaveLength(1);
		expect(saved?.paths[0]).toMatch(/image-1\.jpg$/);
		expect(readFileSync(saved?.paths[0] ?? "")).toEqual(Buffer.from([1, 2]));
		expect(saved?.failed).toBe(0);
	});

	// Telegram sends a picture "as a file" as a document with its own type, not as a photo.
	it("takes an image sent as a file", async () => {
		const saved = await saveMessageImages({
			rootDir: root(),
			attachments: [{ type: "file", mimeType: "image/png", name: "print.png", fetchData: async () => Buffer.from([3]) }],
		});
		expect(saved?.paths[0]).toMatch(/\.png$/);
	});

	it("ignores what is not an image, and reports nothing for a message without one", async () => {
		const fetchData = vi.fn(async () => Buffer.from([0]));
		expect(
			await saveMessageImages({ rootDir: root(), attachments: [{ type: "file", mimeType: "application/pdf", fetchData }] }),
		).toBeUndefined();
		expect(fetchData).not.toHaveBeenCalled();
		expect(await saveMessageImages({ rootDir: root(), attachments: undefined })).toBeUndefined();
	});

	it("counts a download that failed instead of failing", async () => {
		const saved = await saveMessageImages({
			rootDir: root(),
			attachments: [
				{ type: "image", mimeType: "image/jpeg", fetchData: async () => Promise.reject(new Error("timeout")) },
			],
		});
		expect(saved).toMatchObject({ paths: [], failed: 1 });
	});
});

describe("pruneOldImageDirs", () => {
	it("removes directories older than the limit and keeps recent ones", async () => {
		const dir = root();
		const old = join(dir, "old");
		const recent = join(dir, "recent");
		mkdirSync(old);
		mkdirSync(recent);
		const now = Date.now();
		const eightDaysAgo = (now - 8 * 24 * 3600 * 1000) / 1000;
		utimesSync(old, eightDaysAgo, eightDaysAgo);
		await pruneOldImageDirs(dir, 7 * 24 * 3600 * 1000, now);
		expect(existsSync(old)).toBe(false);
		expect(existsSync(recent)).toBe(true);
	});

	it("does nothing when the directory does not exist", async () => {
		await expect(pruneOldImageDirs("/nonexistent/task-images", 1)).resolves.toBeUndefined();
	});
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors/message-images.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement `message-images.ts`**

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The pictures a message carries, saved where a command can hand them on.
 *
 * The connector used to read only a message's text, so a screenshot captioned `/task …` reached
 * the card as its caption alone -- and the picture was the clearest part of the demand.
 */

export interface IncomingImages {
	/** The directory holding them, so whoever used them can remove it. */
	dir: string;
	paths: string[];
	/** Images the message had that could not be downloaded. */
	failed: number;
}

/** What the chat library gives for an attachment; only what this needs. */
export interface MessageAttachmentLike {
	type?: string;
	mimeType?: string;
	name?: string;
	fetchData?: () => Promise<Buffer>;
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
};

/** A photo, or a picture sent "as a file" -- Telegram sends that as a document. */
function isImage(attachment: MessageAttachmentLike): boolean {
	return attachment.type === "image" || (attachment.mimeType?.startsWith("image/") ?? false);
}

export async function saveMessageImages(input: {
	attachments: readonly MessageAttachmentLike[] | undefined;
	rootDir: string;
}): Promise<IncomingImages | undefined> {
	const images = (input.attachments ?? []).filter(isImage);
	if (images.length === 0) {
		return undefined;
	}
	const dir = join(input.rootDir, randomUUID());
	await mkdir(dir, { recursive: true });
	const paths: string[] = [];
	let failed = 0;
	for (const [index, image] of images.entries()) {
		try {
			if (!image.fetchData) {
				throw new Error("no way to download it");
			}
			const data = await image.fetchData();
			const extension = EXTENSION_BY_MIME_TYPE[image.mimeType ?? "image/jpeg"] ?? "jpg";
			const path = join(dir, `image-${index + 1}.${extension}`);
			await writeFile(path, data);
			paths.push(path);
		} catch {
			// The demand in the caption still deserves its card; the reply says what was lost.
			failed += 1;
		}
	}
	return { dir, paths, failed };
}

/** Removes leftovers -- `/task --brainstorm` keeps its pictures until the agent has used them. */
export async function pruneOldImageDirs(rootDir: string, maxAgeMs: number, now = Date.now()): Promise<void> {
	let entries: string[];
	try {
		entries = await readdir(rootDir);
	} catch {
		return;
	}
	await Promise.all(
		entries.map(async (entry) => {
			const path = join(rootDir, entry);
			try {
				const info = await stat(path);
				if (now - info.mtimeMs > maxAgeMs) {
					await rm(path, { recursive: true, force: true });
				}
			} catch {
				// Gone already, or not ours to touch: either way nothing to do.
			}
		}),
	);
}
```

- [ ] **Step 4: Run it and check that it passes**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors/message-images.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Expose it to commands**

- `utils/chat-commands.ts`: add to `ChatCommandContext`, after `react?`:

  ```ts
  /**
   * The pictures the message carried, saved to disk. Lazy, so only a command that wants them
   * downloads them; undefined when the message had none.
   */
  images?: () => Promise<IncomingImages | undefined>;
  ```

  Add `import type { IncomingImages } from "../connectors/message-images";` at the top.
- `connectors/connector-host.ts`: add `images?: () => Promise<IncomingImages | undefined>;` to the turn input type, next to `react?` (line 346), with the comment "Supplied by the adapter because only it holds the incoming message". In the context object passed to `maybeHandleChatCommand` (~632), add `images: input.images,`.
- `connectors/adapters/telegram.ts`:
  - `handleTurn` gains a fourth parameter, `attachments?: readonly MessageAttachmentLike[]`, and passes it to `handleConnectorUserTurn`:

    ```ts
    images: attachments?.length
    	? () => saveMessageImages({ attachments, rootDir: this.resolveDataPath("task-images") })
    	: undefined,
    ```

    Use whatever this adapter calls the `base.ts:221` helper that joins `connectors/<name>/...` (find it with `rg -n "resolveClineDataDir\(\), \"connectors\"" apps/cli/src/connectors/base.ts`, then the method name above it). Bind it the way the surrounding code reaches `bindingsPath`.
  - At each `handleTurn(thread, message.text, message.id)` call (e.g. line 1563), pass `message.attachments` as the fourth argument.
  - On connector start, next to where notifications start, add `void pruneOldImageDirs(<the same task-images path>, 7 * 24 * 3600 * 1000);`.

- [ ] **Step 6: Verify**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/connectors && npx tsc --noEmit -p .`
Expected: PASS. If `message.attachments` is typed as the library's `Attachment[]`, it is assignable to `readonly MessageAttachmentLike[]`; if tsc disagrees on `fetchData`'s return type, widen `MessageAttachmentLike.fetchData` to match the library type (`chat/dist/types-*.d.ts`, `interface Attachment`) rather than casting.

---

### Task 6: `/task` attaches the pictures

**Repository:** cline.

**Files:**
- Modify: `apps/cli/src/utils/kanban-task.ts` (`KanbanTaskRequest`, `buildKanbanCreateArgs`, `buildBrainstormPrompt`)
- Modify: `apps/cli/src/utils/chat-commands.ts` (the `/task` handler, ~436-512)
- Test: `apps/cli/src/utils/kanban-task.test.ts`, `apps/cli/src/utils/chat-commands.test.ts`

**Interfaces:**
- Consumes: `IncomingImages`, `ChatCommandContext.images` (Task 5).
- Produces: `KanbanTaskRequest.images?: string[]`; `buildBrainstormPrompt` input `images?: string[]`; `export function describeAttachedImages(saved: IncomingImages | undefined): string`, which returns the reply suffix.

- [ ] **Step 1: Write the failing tests**

In `kanban-task.test.ts`:

```ts
describe("pictures sent with /task", () => {
	it("passes each picture to Kanban", () => {
		const args = buildKanbanCreateArgs({
			description: "desativar a mensagem de ativação",
			projectPath: "/code/kanban",
			images: ["/data/task-images/u/image-1.jpg", "/data/task-images/u/image-2.png"],
		});
		expect(args.filter((arg) => arg === "--image")).toHaveLength(2);
		expect(args).toContain("/data/task-images/u/image-1.jpg");
	});

	it("asks the brainstorming agent to attach them", () => {
		const prompt = buildBrainstormPrompt({
			description: "x",
			projectPath: "/code/kanban",
			start: false,
			images: ["/data/task-images/u/image-1.jpg"],
		});
		expect(prompt).toContain("--image /data/task-images/u/image-1.jpg");
	});

	it("says what became of them", () => {
		expect(describeAttachedImages(undefined)).toBe("");
		expect(describeAttachedImages({ dir: "d", paths: ["a"], failed: 0 })).toBe(", 1 imagem");
		expect(describeAttachedImages({ dir: "d", paths: ["a", "b"], failed: 0 })).toBe(", 2 imagens");
		expect(describeAttachedImages({ dir: "d", paths: [], failed: 1 })).toBe(" — a imagem não pôde ser baixada");
		expect(describeAttachedImages({ dir: "d", paths: ["a"], failed: 2 })).toBe(
			", 1 imagem — 2 imagens não puderam ser baixadas",
		);
	});
});
```

In `chat-commands.test.ts`, follow the file's existing `/task` tests. They mock `createKanbanTask` (line 8-11); copy one, and add a context with `images`:

```ts
it("files the pictures with the card, then removes them", async () => {
	const dir = mkdtempSync(join(tmpdir(), "task-images-"));
	const path = join(dir, "image-1.jpg");
	writeFileSync(path, Buffer.from([1]));
	// mockedCreate = vi.mocked(createKanbanTask), resolving { ok: true, taskId: "b4e17", message: "Added to the kanban backlog: x (card b4e17)" }
	// run "/task desativar a mensagem" with context.images = async () => ({ dir, paths: [path], failed: 0 })
	// expect mockedCreate.mock.calls[0][0].images toEqual [path]
	// expect the reply toBe "Added to the kanban backlog: x (card b4e17, 1 imagem)"
	// expect existsSync(dir) toBe false
});

it("keeps the pictures for --brainstorm, for the agent to attach", async () => {
	// same setup; run "/task --brainstorm x"; expect submitPrompt called with a prompt containing `--image ${path}`
	// expect existsSync(dir) toBe true
});

it("still files the card when the picture could not be downloaded", async () => {
	// context.images = async () => ({ dir, paths: [], failed: 1 })
	// expect mockedCreate called; reply ends with "— a imagem não pôde ser baixada)"
});
```

Write these three fully in that file's own harness: how it builds `context`, how it runs a command, and how it reads the reply. Read the existing `/task` tests first, and copy their setup rather than inventing one.

- [ ] **Step 2: Run them and check that they fail**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/utils/kanban-task.test.ts src/utils/chat-commands.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement in `kanban-task.ts`**

- `KanbanTaskRequest` gains `/** Pictures to attach, as files Kanban can read. */ images?: string[];`.
- `buildKanbanCreateArgs` appends `...(request.images ?? []).flatMap((path) => ["--image", path]),`.
- `buildBrainstormPrompt` input gains `images?: string[];`, and its `kanban task create` line appends `(input.images ?? []).map((path) => \` --image ${path}\`).join("")`.
- Add:

```ts
function countImages(count: number): string {
	return count === 1 ? "1 imagem" : `${count} imagens`;
}

/** The reply's note on the pictures, so the person can tell whether the card saw them. */
export function describeAttachedImages(saved: IncomingImages | undefined): string {
	if (!saved) {
		return "";
	}
	const attached = saved.paths.length > 0 ? `, ${countImages(saved.paths.length)}` : "";
	const lost =
		saved.failed === 0
			? ""
			: saved.failed === 1
				? " — a imagem não pôde ser baixada"
				: ` — ${saved.failed} imagens não puderam ser baixadas`;
	return `${attached}${lost}`;
}
```

  Import the `IncomingImages` type from `../connectors/message-images`.

- [ ] **Step 4: Implement in the `/task` handler (`chat-commands.ts`)**

After `parseTaskCommand(args)` and the empty-description check, and before the `brainstorm` branch:

```ts
const images = await context.images?.();
```

- Brainstorm branch: pass `images: images?.paths` to `buildBrainstormPrompt`, and do not remove the directory (the agent has not run yet).
- Create branch: pass `images: images?.paths` to `createKanbanTask(...)`. Then remove the directory whatever the outcome, in a `finally`: `if (images) await rm(images.dir, { recursive: true, force: true }).catch(() => undefined);`. The card holds the bytes once created, and a failed create has no use for them.
- Reply: `result.message` ends with `(card <id>)`. Insert the suffix before the closing parenthesis:

  ```ts
  const note = describeAttachedImages(images);
  const message = note ? result.message.replace(/\)$/, `${note})`) : result.message;
  ```

  Use `message` in the existing `context.reply(...)` for the backlog case. For `--start`, which today replies nothing, reply only when `images?.failed` is non-zero, with the same text, so a lost picture is never silent.
- Imports: `rm` from `node:fs/promises`, and `describeAttachedImages`.

- [ ] **Step 5: Verify**

Run: `cd apps/cli && npx vitest run --config vitest.config.ts src/utils src/connectors && npx tsc --noEmit -p .`, then `npx biome check apps/cli/src` from the cline root.
Expected: PASS and clean.

---

### Task 7: Live check

- [ ] **Step 1:** Rebuild Kanban (`npm run build`) and restart it on 3484, after confirming that no card session is live. Restart the Telegram connector: killing its pid lets the hub restart it with the new source.
- [ ] **Step 2:** In the Kanban topic, send a screenshot with the caption `/task descreva o que aparece na imagem anexada, sem alterar arquivos`. Check:
  - the reply ends with `(card <id>, 1 imagem)`;
  - the board card carries the image (below), and the connector's `task-images` directory no longer has its folder;
  - the board card shows the screenshot behind its text at 80%, slightly taller than a plain card; opened, it lists the image, and a click opens it full size.
- [ ] **Step 3:** Start it (`kanban task start --task-id <id>`, or `/task --start` on a new one). The agent's conclusion, in the review notice, describes the screenshot's content, which proves the image reached it.
