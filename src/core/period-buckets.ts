import type { RuntimeStatisticsGranularity } from "./api-contract";

/**
 * Cuts time into the viewer's days, weeks and months. Periods are named by their first calendar
 * day in the viewer's zone (`YYYY-MM-DD`) and stepped as calendar dates, never as fixed numbers
 * of milliseconds, so a DST change cannot shift an event into the neighbouring day.
 * Weeks start on Monday (ISO 8601).
 */

const formatterByZone = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatterByZone.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
		formatterByZone.set(timeZone, formatter);
	}
	return formatter;
}

/** The zone itself when the runtime knows it, UTC otherwise. */
export function resolveTimeZone(timeZone: string): string {
	try {
		formatterFor(timeZone);
		return timeZone;
	} catch {
		return "UTC";
	}
}

interface CalendarDate {
	year: number;
	month: number;
	day: number;
}

function localDate(timestamp: number, timeZone: string): CalendarDate {
	const parts = formatterFor(timeZone).formatToParts(new Date(timestamp));
	const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
	return { year: value("year"), month: value("month"), day: value("day") };
}

function toUtcDate({ year, month, day }: CalendarDate): Date {
	return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcDate(date: Date): CalendarDate {
	return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function formatKey({ year, month, day }: CalendarDate): string {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function startOfPeriod(date: CalendarDate, granularity: RuntimeStatisticsGranularity): CalendarDate {
	if (granularity === "month") {
		return { ...date, day: 1 };
	}
	if (granularity === "week") {
		const utc = toUtcDate(date);
		const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
		utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
		return fromUtcDate(utc);
	}
	return date;
}

function nextPeriod(start: CalendarDate, granularity: RuntimeStatisticsGranularity): CalendarDate {
	const utc = toUtcDate(start);
	if (granularity === "month") {
		utc.setUTCMonth(utc.getUTCMonth() + 1);
	} else {
		utc.setUTCDate(utc.getUTCDate() + (granularity === "week" ? 7 : 1));
	}
	return fromUtcDate(utc);
}

/** The key of the period containing `timestamp`. */
export function periodKeyOf(timestamp: number, granularity: RuntimeStatisticsGranularity, timeZone: string): string {
	return formatKey(startOfPeriod(localDate(timestamp, timeZone), granularity));
}

/** Every period key from the one containing `from` to the one containing `to`, in order. */
export function listPeriodKeys(
	from: number,
	to: number,
	granularity: RuntimeStatisticsGranularity,
	timeZone: string,
): string[] {
	const last = periodKeyOf(to, granularity, timeZone);
	const keys: string[] = [];
	let current = startOfPeriod(localDate(from, timeZone), granularity);
	// Bounded, in case a caller passes a range of centuries by day.
	for (let guard = 0; guard < 5_000; guard += 1) {
		const key = formatKey(current);
		if (key > last) {
			break;
		}
		keys.push(key);
		current = nextPeriod(current, granularity);
	}
	return keys;
}
