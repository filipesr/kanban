import { useCallback, useEffect, useRef, useState } from "react";

import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import type { RuntimeStatisticsRequest, RuntimeStatisticsResponse } from "@/runtime/types";
import { useUnmount } from "@/utils/react-use";

/**
 * How long to gather change notices before recomputing. Statistics read every event log and git
 * history in scope, so a running agent's several updates a second become one reload.
 */
export const PROJECT_STATISTICS_RELOAD_DELAY_MS = 2_000;

interface UseProjectStatisticsInput {
	request: RuntimeStatisticsRequest;
	/** Per-project counters from the runtime stream; a bump in scope means its numbers moved. */
	invalidationVersions: Record<string, number>;
}

export interface UseProjectStatisticsResult {
	data: RuntimeStatisticsResponse | null;
	isLoading: boolean;
	error: string | null;
	reload: () => void;
}

export function useProjectStatistics({
	request,
	invalidationVersions,
}: UseProjectStatisticsInput): UseProjectStatisticsResult {
	const [data, setData] = useState<RuntimeStatisticsResponse | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Only the latest request may land: a slow all-time query must not overwrite a newer week.
	const latestRequestIdRef = useRef(0);
	const reloadTimerRef = useRef<number | null>(null);
	const seenVersionsRef = useRef(invalidationVersions);
	const requestRef = useRef(request);
	requestRef.current = request;

	const load = useCallback(async () => {
		const requestId = latestRequestIdRef.current + 1;
		latestRequestIdRef.current = requestId;
		setIsLoading(true);
		try {
			const response = await getRuntimeTrpcClient(null).projects.statistics.query(requestRef.current);
			if (latestRequestIdRef.current === requestId) {
				setData(response);
				setError(null);
			}
		} catch (loadError) {
			if (latestRequestIdRef.current === requestId) {
				setError(loadError instanceof Error ? loadError.message : String(loadError));
			}
		} finally {
			if (latestRequestIdRef.current === requestId) {
				setIsLoading(false);
			}
		}
	}, []);

	const clearReloadTimer = useCallback(() => {
		if (reloadTimerRef.current !== null) {
			window.clearTimeout(reloadTimerRef.current);
			reloadTimerRef.current = null;
		}
	}, []);

	const reload = useCallback(() => {
		clearReloadTimer();
		void load();
	}, [clearReloadTimer, load]);

	const requestKey = JSON.stringify(request);
	useEffect(() => {
		reload();
	}, [requestKey, reload]);

	useEffect(() => {
		const seen = seenVersionsRef.current;
		seenVersionsRef.current = invalidationVersions;
		const scope = requestRef.current.projectId ?? null;
		const changed = Object.entries(invalidationVersions).some(
			([projectId, version]) => seen[projectId] !== version && (scope === null || scope === projectId),
		);
		if (!changed || reloadTimerRef.current !== null) {
			return;
		}
		reloadTimerRef.current = window.setTimeout(() => {
			reloadTimerRef.current = null;
			void load();
		}, PROJECT_STATISTICS_RELOAD_DELAY_MS);
	}, [invalidationVersions, load]);

	useUnmount(() => {
		latestRequestIdRef.current += 1;
		clearReloadTimer();
	});

	return { data, isLoading, error, reload };
}
