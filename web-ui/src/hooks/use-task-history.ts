import { useEffect, useRef, useState } from "react";

import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import type { RuntimeTaskHistory } from "@/runtime/types";

export interface UseTaskHistoryResult {
	history: RuntimeTaskHistory | null;
	isLoading: boolean;
	error: string | null;
}

/** Loads a Done card's history once per selection: a finished card does not change, so nothing polls. */
export function useTaskHistory({
	projectId,
	taskId,
}: {
	projectId: string | null;
	taskId: string;
}): UseTaskHistoryResult {
	const [history, setHistory] = useState<RuntimeTaskHistory | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	// Only the latest selection may land: a slow transcript must not replace the card opened after it.
	const latestRequestIdRef = useRef(0);

	useEffect(() => {
		const requestId = latestRequestIdRef.current + 1;
		latestRequestIdRef.current = requestId;
		setHistory(null);
		setError(null);
		setIsLoading(true);
		void (async () => {
			try {
				const response = await getRuntimeTrpcClient(projectId).runtime.getTaskHistory.query({ taskId });
				if (latestRequestIdRef.current !== requestId) {
					return;
				}
				setHistory(response.history);
				setError(response.ok ? null : (response.error ?? "Could not load this card's history."));
			} catch (loadError) {
				if (latestRequestIdRef.current === requestId) {
					setError(loadError instanceof Error ? loadError.message : String(loadError));
				}
			} finally {
				if (latestRequestIdRef.current === requestId) {
					setIsLoading(false);
				}
			}
		})();
	}, [projectId, taskId]);

	return { history, isLoading, error };
}
