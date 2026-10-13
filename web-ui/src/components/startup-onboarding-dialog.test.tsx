import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StartupOnboardingDialog } from "@/components/startup-onboarding-dialog";

const RENDER_BUDGET = 50;

const controllerCalls = vi.hoisted(() => ({ count: 0 }));

// The real controller hands back a fresh object on every render; the mock does the same
// and bails out once the dialog renders far more often than opening it ever should.
vi.mock("@/hooks/use-runtime-settings-cline-controller", () => ({
	useRuntimeSettingsClineController: () => {
		controllerCalls.count += 1;
		if (controllerCalls.count > RENDER_BUDGET) {
			throw new Error(`StartupOnboardingDialog rendered more than ${RENDER_BUDGET} times`);
		}
		return {
			hasUnsavedChanges: false,
			saveProviderSettings: async () => ({ ok: true }),
		};
	},
}));

vi.mock("@/components/shared/cline-setup-section", () => ({
	ClineSetupSection: () => null,
}));

vi.mock("@runtime-agent-catalog", () => ({
	getRuntimeAgentCatalogEntry: vi.fn(() => null),
}));

describe("StartupOnboardingDialog", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
		controllerCalls.count = 0;
		previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
	});

	it("settles after opening instead of re-rendering forever", () => {
		act(() => {
			root.render(<StartupOnboardingDialog open onClose={() => {}} selectedAgentId="claude" agents={[]} />);
		});

		expect(controllerCalls.count).toBeLessThan(RENDER_BUDGET);
		expect(document.body.textContent).toContain("Get started");
	});
});
