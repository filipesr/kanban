import { useMemo, useState } from "react";

import type { RuntimeStatisticsGranularity, RuntimeStatisticsRequest } from "@/runtime/types";
import { coarsestUsefulGranularity, type DashboardRangePreset, resolveDashboardRange } from "@/utils/dashboard-period";

export interface DashboardFilters {
	projectId: string | null;
	granularity: RuntimeStatisticsGranularity;
	range: DashboardRangePreset;
}

export interface UseDashboardFiltersResult {
	filters: DashboardFilters;
	setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
	/** The statistics request the filters describe, cut in the viewer's time zone. */
	request: RuntimeStatisticsRequest;
}

const VIEWER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useDashboardFilters(initial: Partial<DashboardFilters> = {}): UseDashboardFiltersResult {
	const [filters, setFilters] = useState<DashboardFilters>({
		projectId: null,
		granularity: "day",
		range: "30d",
		...initial,
	});

	const request = useMemo<RuntimeStatisticsRequest>(() => {
		const { from, to } = resolveDashboardRange(filters.range, Date.now());
		return {
			projectId: filters.projectId,
			granularity: coarsestUsefulGranularity(filters.range, filters.granularity),
			from,
			to,
			timeZone: VIEWER_TIME_ZONE,
		};
	}, [filters]);

	return {
		filters,
		setFilter: (key, value) => setFilters((current) => ({ ...current, [key]: value })),
		request,
	};
}
