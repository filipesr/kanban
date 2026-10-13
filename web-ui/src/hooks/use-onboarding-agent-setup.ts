import { useEffect, useRef, useState } from "react";

import {
	type UseRuntimeSettingsClineControllerResult,
	useRuntimeSettingsClineController,
} from "@/hooks/use-runtime-settings-cline-controller";
import type { RuntimeAgentId, RuntimeConfigResponse } from "@/runtime/types";

export interface OnboardingAgentSetupResult {
	ok: boolean;
	message?: string;
}

interface UseOnboardingAgentSetupOptions {
	open: boolean;
	workspaceId: string | null;
	runtimeConfig: RuntimeConfigResponse | null;
	selectedAgentId: RuntimeAgentId | null;
	onSelectAgent?: (agentId: RuntimeAgentId) => Promise<OnboardingAgentSetupResult>;
	onClineSetupSaved?: () => void;
}

export interface OnboardingAgentSetup {
	activeAgentId: RuntimeAgentId | null;
	selectionError: string | null;
	clineSetupError: string | null;
	setClineSetupError: (message: string | null) => void;
	clineSettings: UseRuntimeSettingsClineControllerResult;
	selectAgent: (agentId: RuntimeAgentId) => void;
	/** Settles a pending agent switch and saves unsaved Cline provider settings before onboarding closes. */
	completeAgentSetup: () => Promise<OnboardingAgentSetupResult>;
}

export function useOnboardingAgentSetup({
	open,
	workspaceId,
	runtimeConfig,
	selectedAgentId,
	onSelectAgent,
	onClineSetupSaved,
}: UseOnboardingAgentSetupOptions): OnboardingAgentSetup {
	const [activeAgentId, setActiveAgentId] = useState<RuntimeAgentId | null>(selectedAgentId);
	const [selectionError, setSelectionError] = useState<string | null>(null);
	const [clineSetupError, setClineSetupError] = useState<string | null>(null);
	const selectionSavePromiseRef = useRef<Promise<OnboardingAgentSetupResult> | null>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		setActiveAgentId(selectedAgentId);
		setSelectionError(null);
		setClineSetupError(null);
	}, [open, selectedAgentId]);

	const clineSettings = useRuntimeSettingsClineController({
		open,
		workspaceId,
		selectedAgentId: activeAgentId ?? selectedAgentId ?? "cline",
		config: runtimeConfig,
	});

	const selectAgent = (agentId: RuntimeAgentId) => {
		if (activeAgentId === agentId) {
			return;
		}
		setActiveAgentId(agentId);
		setSelectionError(null);
		if (!onSelectAgent) {
			return;
		}
		const savePromise = onSelectAgent(agentId);
		selectionSavePromiseRef.current = savePromise;
		void savePromise
			.then((result) => {
				if (selectionSavePromiseRef.current !== savePromise) {
					return;
				}
				if (!result.ok) {
					setSelectionError(result.message ?? "Could not switch agents. Try again.");
					setActiveAgentId(selectedAgentId);
				}
			})
			.catch((error: unknown) => {
				if (selectionSavePromiseRef.current !== savePromise) {
					return;
				}
				const message = error instanceof Error ? error.message : String(error);
				setSelectionError(message || "Could not switch agents. Try again.");
				setActiveAgentId(selectedAgentId);
			})
			.finally(() => {
				if (selectionSavePromiseRef.current === savePromise) {
					selectionSavePromiseRef.current = null;
				}
			});
	};

	const completeAgentSetup = async (): Promise<OnboardingAgentSetupResult> => {
		if (selectionSavePromiseRef.current) {
			const selectionResult = await selectionSavePromiseRef.current.catch((error: unknown) => ({
				ok: false,
				message: error instanceof Error ? error.message : String(error),
			}));
			if (!selectionResult.ok) {
				const message = selectionResult.message ?? "Could not switch agents. Try again.";
				setSelectionError(message);
				return { ok: false, message };
			}
		}
		if (activeAgentId !== "cline") {
			return { ok: true };
		}
		if (!clineSettings.hasUnsavedChanges) {
			return { ok: true };
		}
		setClineSetupError(null);
		const saveResult = await clineSettings.saveProviderSettings();
		if (!saveResult.ok) {
			const message = saveResult.message ?? "Could not save Cline provider settings.";
			setClineSetupError(message);
			return { ok: false, message };
		}
		onClineSetupSaved?.();
		return { ok: true };
	};

	return {
		activeAgentId,
		selectionError,
		clineSetupError,
		setClineSetupError,
		clineSettings,
		selectAgent,
		completeAgentSetup,
	};
}
