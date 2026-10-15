import { useCallback, useEffect, useRef, useState } from "react";

import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import { mergeProjectsOverview, type ProjectsOverviewData } from "@/utils/projects-overview";
import { useUnmount } from "@/utils/react-use";

/**
 * How long to gather change notices before reloading. A running agent reports several times a
 * second; this turns that into a few small reloads of the projects that changed, not one each.
 */
export const PROJECTS_OVERVIEW_RELOAD_DELAY_MS = 300;

interface UseProjectsOverviewInput {
	enabled: boolean;
	/** Per-project counters from the runtime stream; a bump means that project changed. */
	invalidationVersions: Record<string, number>;
	/** The registered projects. A change in the set (one added or removed) reloads everything. */
	projectIds: readonly string[];
}

export interface UseProjectsOverviewResult {
	data: ProjectsOverviewData | null;
	isLoading: boolean;
	error: string | null;
	reload: () => void;
}

export function useProjectsOverview({
	enabled,
	invalidationVersions,
	projectIds,
}: UseProjectsOverviewInput): UseProjectsOverviewResult {
	const [data, setData] = useState<ProjectsOverviewData | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const seenVersionsRef = useRef<Record<string, number>>({});
	const pendingProjectIdsRef = useRef(new Set<string>());
	const reloadTimerRef = useRef<number | null>(null);
	// Reloads run one after another, so a slow full reload can never land after, and erase, a
	// partial one that started later.
	const queueRef = useRef<Promise<void>>(Promise.resolve());
	const isActiveRef = useRef(enabled);
	isActiveRef.current = enabled;

	const load = useCallback((requestedProjectIds: string[] | null) => {
		queueRef.current = queueRef.current.then(async () => {
			if (!isActiveRef.current) {
				return;
			}
			if (!requestedProjectIds) {
				setIsLoading(true);
			}
			try {
				const update = await getRuntimeTrpcClient(null).projects.overview.query(
					requestedProjectIds ? { projectIds: requestedProjectIds } : undefined,
				);
				if (!isActiveRef.current) {
					return;
				}
				setData((current) => mergeProjectsOverview(current, update, requestedProjectIds));
				setError(null);
			} catch (loadError) {
				if (isActiveRef.current) {
					setError(loadError instanceof Error ? loadError.message : String(loadError));
				}
			} finally {
				if (!requestedProjectIds) {
					setIsLoading(false);
				}
			}
		});
	}, []);

	const clearReloadTimer = useCallback(() => {
		if (reloadTimerRef.current !== null) {
			window.clearTimeout(reloadTimerRef.current);
			reloadTimerRef.current = null;
		}
		pendingProjectIdsRef.current.clear();
	}, []);

	const reload = useCallback(() => {
		clearReloadTimer();
		load(null);
	}, [clearReloadTimer, load]);

	const projectSetKey = [...projectIds].sort().join("\n");

	// Everything, on open and whenever a project is added or removed. What changed before that is
	// covered by the full reload, so it counts as seen.
	useEffect(() => {
		if (!enabled) {
			clearReloadTimer();
			return;
		}
		seenVersionsRef.current = invalidationVersions;
		reload();
		// invalidationVersions is read, not tracked: the next effect handles its changes.
	}, [enabled, projectSetKey, reload, clearReloadTimer]);

	useEffect(() => {
		if (!enabled) {
			return;
		}
		const seen = seenVersionsRef.current;
		for (const [projectId, version] of Object.entries(invalidationVersions)) {
			if (seen[projectId] !== version) {
				pendingProjectIdsRef.current.add(projectId);
			}
		}
		seenVersionsRef.current = invalidationVersions;
		if (pendingProjectIdsRef.current.size === 0 || reloadTimerRef.current !== null) {
			return;
		}
		reloadTimerRef.current = window.setTimeout(() => {
			reloadTimerRef.current = null;
			const changed = [...pendingProjectIdsRef.current];
			pendingProjectIdsRef.current.clear();
			load(changed);
		}, PROJECTS_OVERVIEW_RELOAD_DELAY_MS);
	}, [enabled, invalidationVersions, load]);

	useUnmount(() => {
		isActiveRef.current = false;
		clearReloadTimer();
	});

	return { data, isLoading, error, reload };
}
