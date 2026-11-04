import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UseTaskAgentModelPickerResult } from "@/components/task-agent-model-picker";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { LocalStorageKey } from "@/storage/local-storage-store";
import { EMPTY_CARD_ATTRIBUTES } from "@/utils/card-attributes-draft";

vi.mock("@/components/task-prompt-composer", () => ({
	TaskPromptComposer: ({
		value,
		onValueChange,
	}: {
		value: string;
		onValueChange: (value: string) => void;
	}): React.ReactElement => (
		<textarea aria-label="Task prompt" value={value} onChange={(event) => onValueChange(event.currentTarget.value)} />
	),
}));

vi.mock("@/components/task-agent-model-picker", () => ({
	TaskAgentModelPicker: (): null => null,
	useTaskAgentModelPicker: (): UseTaskAgentModelPickerResult => ({
		agentOptions: [],
		clineProviderOptions: [],
		clineModelOptions: [],
		effectiveDefaultModelId: null,
		providerModels: [],
		isLoadingProviders: false,
		isLoadingModels: false,
		providerDefaultModels: {},
	}),
}));

type DialogProps = Parameters<typeof TaskCreateDialog>[0];

function findButton(label: string): HTMLButtonElement | undefined {
	return Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === label);
}

function pressModEnter(options: { shiftKey?: boolean } = {}): void {
	act(() => {
		document.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				metaKey: true,
				shiftKey: options.shiftKey ?? false,
				bubbles: true,
			}),
		);
	});
}

describe("TaskCreateDialog in edit mode", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
		previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT;
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		window.localStorage.clear();
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
	});

	function renderDialog(props: Partial<DialogProps> = {}): DialogProps {
		const resolved: DialogProps = {
			intent: "edit",
			open: true,
			onOpenChange: vi.fn(),
			prompt: "1. First step\n2. Second step",
			onPromptChange: vi.fn(),
			images: [],
			onImagesChange: vi.fn(),
			onCreate: vi.fn(() => "task-1"),
			onCreateAndStart: vi.fn(() => "task-1"),
			startInPlanMode: false,
			onStartInPlanModeChange: vi.fn(),
			autoReviewEnabled: false,
			onAutoReviewEnabledChange: vi.fn(),
			autoReviewMode: "commit",
			onAutoReviewModeChange: vi.fn(),
			attributes: EMPTY_CARD_ATTRIBUTES,
			onAttributesChange: vi.fn(),
			workspaceId: "project-1",
			branchRef: "main",
			branchOptions: [{ value: "main", label: "main" }],
			onBranchRefChange: vi.fn(),
			...props,
		};
		act(() => {
			root.render(<TaskCreateDialog {...resolved} />);
		});
		return resolved;
	}

	it("shows the card's prompt under an edit title with save actions", () => {
		renderDialog();

		expect(document.body.textContent).toContain("Edit task");
		expect(document.body.textContent).not.toContain("New task");
		expect((document.querySelector('[aria-label="Task prompt"]') as HTMLTextAreaElement).value).toBe(
			"1. First step\n2. Second step",
		);
		expect(findButton("Save")).toBeDefined();
		expect(findButton("Save and start")).toBeDefined();
		expect(findButton("Create")).toBeUndefined();
	});

	it("offers neither creating more nor splitting the prompt into tasks", () => {
		renderDialog();

		expect(document.body.textContent).not.toContain("Create more");
		expect(document.body.textContent).not.toContain("Split into");
		expect(document.querySelector('[aria-label="More start options"]')).toBeNull();
	});

	it("saves from the Save button and from the start button", () => {
		const props = renderDialog();

		act(() => {
			findButton("Save")?.click();
		});
		expect(props.onCreate).toHaveBeenCalledTimes(1);

		act(() => {
			findButton("Save and start")?.click();
		});
		expect(props.onCreateAndStart).toHaveBeenCalledTimes(1);
	});

	it("saves and starts even when creation last remembered 'Start and open'", () => {
		window.localStorage.setItem(LocalStorageKey.TaskCreatePrimaryStartAction, "start_and_open");
		const props = renderDialog();

		act(() => {
			findButton("Save and start")?.click();
		});
		expect(props.onCreateAndStart).toHaveBeenCalledTimes(1);
	});

	it("saves with Cmd/Ctrl+Enter and saves and starts with Cmd/Ctrl+Shift+Enter", () => {
		const props = renderDialog();

		pressModEnter();
		expect(props.onCreate).toHaveBeenCalledTimes(1);

		pressModEnter({ shiftKey: true });
		expect(props.onCreateAndStart).toHaveBeenCalledTimes(1);
	});

	it("cancels the edit on Escape", () => {
		const props = renderDialog();

		act(() => {
			document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		expect(props.onOpenChange).toHaveBeenCalledWith(false);
		expect(props.onCreate).not.toHaveBeenCalled();
	});

	it("still offers splitting a list prompt when creating", () => {
		renderDialog({ intent: "create", onCreateMultiple: vi.fn(() => []) });

		expect(document.body.textContent).toContain("New task");
		expect(document.body.textContent).toContain("Split into 2 tasks");
		expect(findButton("Create")).toBeDefined();
	});
});
