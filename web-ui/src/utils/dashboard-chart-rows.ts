import type { RuntimeStatisticsBucket, RuntimeStatisticsGranularity } from "@/runtime/types";
import { formatPeriodLabel } from "@/utils/dashboard-period";

export interface DashboardChartRow extends RuntimeStatisticsBucket {
	label: string;
}

function isEmptyBucket(bucket: RuntimeStatisticsBucket): boolean {
	return (
		bucket.created + bucket.started + bucket.reviewed + bucket.completed + bucket.commits + bucket.agentWorkMs === 0
	);
}

/**
 * The periods as chart rows. With `trimLeadingEmpty`, periods before the first one with any
 * activity are dropped -- an all-time range starts at the epoch, and decades of empty months
 * would squeeze the real history into a corner.
 */
export function toDashboardChartRows(
	buckets: RuntimeStatisticsBucket[],
	granularity: RuntimeStatisticsGranularity,
	options: { trimLeadingEmpty?: boolean } = {},
): DashboardChartRow[] {
	const firstActive = options.trimLeadingEmpty ? buckets.findIndex((bucket) => !isEmptyBucket(bucket)) : 0;
	const visible = firstActive < 0 ? buckets.slice(-1) : buckets.slice(firstActive);
	return visible.map((bucket) => ({ ...bucket, label: formatPeriodLabel(bucket.key, granularity) }));
}
