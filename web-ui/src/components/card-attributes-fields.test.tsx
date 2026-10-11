import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardAttributesFields } from "@/components/card-attributes-fields";
import { EMPTY_CARD_ATTRIBUTES } from "@/utils/card-attributes-draft";

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

/**
 * React intercepts the value setter to track changes, so assigning `.value` directly and
 * dispatching an event is ignored. Going through the prototype's setter is what makes the
 * component see a real edit.
 */
function typeInto(input: HTMLInputElement, value: string): void {
	const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function field(label: string): HTMLInputElement | HTMLSelectElement {
	const element = container.querySelector(`[aria-label="${label}"]`);
	if (!element) {
		throw new Error(`no field labelled ${label}`);
	}
	return element as HTMLInputElement | HTMLSelectElement;
}

describe("CardAttributesFields", () => {
	it("shows the three fields empty for a card that carries none", async () => {
		await act(async () => {
			root.render(<CardAttributesFields draft={EMPTY_CARD_ATTRIBUTES} onChange={() => {}} />);
		});

		expect((field("Tags") as HTMLInputElement).value).toBe("");
		expect((field("Category") as HTMLInputElement).value).toBe("");
		expect((field("Priority") as HTMLSelectElement).value).toBe("");
	});

	it("shows what the card already carries", async () => {
		await act(async () => {
			root.render(
				<CardAttributesFields
					draft={{ tags: "infra, docs", category: "bug", priority: "high" }}
					onChange={() => {}}
				/>,
			);
		});

		expect((field("Tags") as HTMLInputElement).value).toBe("infra, docs");
		expect((field("Category") as HTMLInputElement).value).toBe("bug");
		expect((field("Priority") as HTMLSelectElement).value).toBe("high");
	});

	it("reports each change without disturbing the others", async () => {
		const onChange = vi.fn();
		await act(async () => {
			root.render(
				<CardAttributesFields draft={{ tags: "infra", category: "bug", priority: "low" }} onChange={onChange} />,
			);
		});

		await act(async () => {
			typeInto(field("Tags") as HTMLInputElement, "infra, docs");
		});

		expect(onChange).toHaveBeenCalledWith({
			tags: "infra, docs",
			category: "bug",
			priority: "low",
		});
	});

	it("lets a priority be taken back off a card", async () => {
		// "No priority" is a value in its own right: without it, a priority set once could
		// never be removed.
		const onChange = vi.fn();
		await act(async () => {
			root.render(<CardAttributesFields draft={{ tags: "", category: "", priority: "high" }} onChange={onChange} />);
		});

		const priority = field("Priority") as HTMLSelectElement;
		await act(async () => {
			priority.value = "";
			priority.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(onChange).toHaveBeenCalledWith({ tags: "", category: "", priority: undefined });
	});
});
