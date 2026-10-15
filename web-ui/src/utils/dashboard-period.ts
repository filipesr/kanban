import type { RuntimeStatisticsGranularity } from "@/runtime/types";

export type DashboardRangePreset = "7d" | "30d" | "90d" | "12m" | "all";

export const DASHBOARD_RANGE_OPTIONS: Array<{ value: DashboardRangePreset; label: string }> = [
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
	{ value: "90d", label: "Last 90 days" },
	{ value: "12m", label: "Last 12 months" },
	{ value: "all", label: "All time" },
];

export const DASHBOARD_GRANULARITY_OPTIONS: Array<{ value: RuntimeStatisticsGranularity; label: string }> = [
	{ value: "day", label: "Day" },
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<Exclude<DashboardRangePreset, "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

export function isDashboardRangePreset(value: string): value is DashboardRangePreset {
	return DASHBOARD_RANGE_OPTIONS.some((option) => option.value === value);
}

export function isStatisticsGranularity(value: string): value is RuntimeStatisticsGranularity {
	return DASHBOARD_GRANULARITY_OPTIONS.some((option) => option.value === value);
}

/**
 * The range a preset covers, through the end of today -- not "now", so a reload triggered by a
 * later change still counts it without the range being recomputed. "All time" starts at the
 * epoch; by day that is decades of empty days, so all-time views are shown by month.
 */
export function resolveDashboardRange(preset: DashboardRangePreset, now: number): { from: number; to: number } {
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	const endOfToday = startOfToday.getTime() + DAY_MS - 1;
	if (preset === "all") {
		return { from: 0, to: endOfToday };
	}
	return { from: startOfToday.getTime() - (RANGE_DAYS[preset] - 1) * DAY_MS, to: endOfToday };
}

/** The finest granularity that keeps a preset readable (a year by day is 365 bars). */
export function coarsestUsefulGranularity(
	preset: DashboardRangePreset,
	granularity: RuntimeStatisticsGranularity,
): RuntimeStatisticsGranularity {
	if (preset === "all") {
		return "month";
	}
	if (preset === "12m" && granularity === "day") {
		return "week";
	}
	return granularity;
}

const SHORT_DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

/** A period key (`YYYY-MM-DD`, its first day) as an axis label. */
export function formatPeriodLabel(key: string, granularity: RuntimeStatisticsGranularity): string {
	const [year, month, day] = key.split("-").map(Number);
	const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
	return granularity === "month" ? MONTH.format(date) : SHORT_DAY.format(date);
}

export function formatDuration(ms: number | null): string {
	if (ms === null) {
		return "—";
	}
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) {
		return "<1m";
	}
	if (minutes < 60) {
		return `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 48) {
		const rest = minutes % 60;
		return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
	}
	const days = Math.floor(hours / 24);
	const restHours = hours % 24;
	return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatPercent(ratio: number | null): string {
	return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

const COMPACT = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function formatCount(value: number): string {
	return Math.abs(value) < 10_000 ? value.toLocaleString() : COMPACT.format(value);
}
