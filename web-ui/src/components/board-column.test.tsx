import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardColumn } from "@/components/board-column";
import type { BoardCard, BoardColumn as BoardColumnModel } from "@/types";

vi.mock("@hello-pangea/dnd", () => ({
	Droppable: ({
		children,
	}: {
		children: (
			provided: { innerRef: () => void; droppableProps: Record<string, never>; placeholder: null },
			snapshot: { isDraggingOver: boolean },
		) => ReactNode;
	}): ReactNode => children({ innerRef: () => {}, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
}));

vi.mock("@/components/board-card", () => ({
	BoardCard: ({ card, onClick }: { card: BoardCard; onClick?: () => void }): React.ReactElement => (
		<button type="button" data-task-id={card.id} onClick={onClick}>
			{card.title}
		</button>
	),
}));

function createCard(id: string, title: string): BoardCard {
	return {
		id,
		title,
		prompt: title,
		startInPlanMode: false,
		baseRef: "main",
		createdAt: 0,
		updatedAt: 0,
	};
}

const DONE_COLUMN: BoardColumnModel = {
	id: "trash",
	title: "Done",
	cards: [createCard("task-1", "Ship it"), createCard("task-2", "Write docs")],
};

describe("BoardColumn collapsing", () => {
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
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
	});

	function renderColumn(props: Partial<Parameters<typeof BoardColumn>[0]> = {}): void {
		act(() => {
			root.render(<BoardColumn column={DONE_COLUMN} taskSessions={{}} {...props} />);
		});
	}

	it("offers no collapse button when the column is not collapsible", () => {
		renderColumn();
		expect(container.querySelector('[aria-label="Collapse Done"]')).toBeNull();
	});

	it("asks to collapse from the expanded header", () => {
		const onCollapsedChange = vi.fn();
		renderColumn({ onCollapsedChange });

		act(() => {
			(container.querySelector('[aria-label="Collapse Done"]') as HTMLButtonElement).click();
		});

		expect(onCollapsedChange).toHaveBeenCalledWith(true);
	});

	it("folds into a strip that shows the count but not the cards", () => {
		const onCollapsedChange = vi.fn();
		renderColumn({ isCollapsed: true, onCollapsedChange });

		const section = container.querySelector('section[data-column-id="trash"]');
		expect(section?.getAttribute("data-collapsed")).toBe("true");
		expect(container.querySelector("[data-task-id]")).toBeNull();
		expect(container.textContent).toContain("2");

		act(() => {
			(container.querySelector('[aria-label="Expand Done"]') as HTMLButtonElement).click();
		});

		expect(onCollapsedChange).toHaveBeenCalledWith(false);
	});

	it("asks to edit a backlog card when it is clicked", () => {
		const draft = createCard("task-3", "Draft");
		const onEditTask = vi.fn();
		const onCardClick = vi.fn();
		renderColumn({
			column: { id: "backlog", title: "Backlog", cards: [draft] },
			onEditTask,
			onCardClick,
		});

		act(() => {
			(container.querySelector('[data-task-id="task-3"]') as HTMLButtonElement).click();
		});

		expect(onEditTask).toHaveBeenCalledWith(draft);
		expect(onCardClick).not.toHaveBeenCalled();
	});

	it("keeps a collapsed backlog folded, since editing happens in a dialog", () => {
		renderColumn({
			column: { id: "backlog", title: "Backlog", cards: [createCard("task-3", "Draft")] },
			isCollapsed: true,
			onCollapsedChange: vi.fn(),
		});

		expect(container.querySelector('section[data-column-id="backlog"]')?.getAttribute("data-collapsed")).toBe("true");
		expect(container.querySelector("[data-task-id]")).toBeNull();
	});
});
