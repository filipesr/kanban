import type { RuntimeBoardColumnId } from "@/runtime/types";

const MINUTE_MS = 60_000;

const COLUMN_NAMES: Record<RuntimeBoardColumnId, string> = {
	backlog: "Backlog",
	in_progress: "In progress",
	review: "Review",
	trash: "Done",
};

export function formatHistoryDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / MINUTE_MS);
	if (totalMinutes < 1) {
		return "< 1 min";
	}
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) {
		return `${minutes} min`;
	}
	return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatColumnName(id: RuntimeBoardColumnId): string {
	return COLUMN_NAMES[id];
}

export function formatHistoryTime(at: number): string {
	return new Date(at).toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}
