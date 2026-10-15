import type {
	RuntimeBoardColumnId,
	RuntimeBoardData,
	RuntimeProjectTaskCounts,
	RuntimeStatisticsCounts,
	RuntimeStatisticsDuration,
	RuntimeStatisticsGranularity,
	RuntimeTaskSessionSummary,
} from "./api-contract";
import { resolveLiveTaskColumn } from "./live-task-column";
import { periodKeyOf } from "./period-buckets";
import type { RuntimeTaskEvent } from "./task-events";

/**
 * Turns one project's event log, board and git history into period counts and raw durations.
 *
 * The log only knows what happened since it started. A stay in a column whose start predates the
 * log has no known length and is left out; the creation and completion of older cards are
 * recovered from the board itself (a card's `createdAt`, and the `updatedAt` of a card already
 * in Done), which is as far back as the board remembers.
 */

export interface StatisticsWindow {
	from: number;
	to: number;
	granularity: RuntimeStatisticsGranularity;
	timeZone: string;
	now: number;
}

export interface CommitStat {
	at: number;
	filesChanged: number;
	filesCreated: number;
	additions: number;
	deletions: number;
}

export interface ProjectStatisticsInput {
	events: RuntimeTaskEvent[];
	board: RuntimeBoardData;
	sessions: Map<string, Pick<RuntimeTaskSessionSummary, "state">>;
	commits: CommitStat[];
}

export interface StatisticsDurations {
	leadTime: number[];
	inProgress: number[];
	inReview: number[];
	agentRun: number[];
}

export interface ProjectStatisticsAccumulator {
	buckets: Map<string, RuntimeStatisticsCounts>;
	totals: RuntimeStatisticsCounts;
	wip: RuntimeProjectTaskCounts;
	durations: StatisticsDurations;
	flowDataSince: number | null;
}

export function createEmptyCounts(): RuntimeStatisticsCounts {
	return {
		created: 0,
		started: 0,
		reviewed: 0,
		completed: 0,
		commits: 0,
		filesChanged: 0,
		filesCreated: 0,
		additions: 0,
		deletions: 0,
		agentWorkMs: 0,
	};
}

export function createEmptyWip(): RuntimeProjectTaskCounts {
	return { backlog: 0, in_progress: 0, review: 0, trash: 0 };
}

export function createEmptyDurations(): StatisticsDurations {
	return { leadTime: [], inProgress: [], inReview: [], agentRun: [] };
}

const COUNT_KEYS = Object.keys(createEmptyCounts()) as Array<keyof RuntimeStatisticsCounts>;

/** Adds only the counters, so a target carrying more fields (a bucket's key) keeps them intact. */
export function addCounts(target: RuntimeStatisticsCounts, source: RuntimeStatisticsCounts): void {
	for (const key of COUNT_KEYS) {
		target[key] += source[key];
	}
}

export function summarizeDurations(values: number[]): RuntimeStatisticsDuration {
	if (values.length === 0) {
		return { count: 0, meanMs: null, medianMs: null };
	}
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	const median =
		sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
	return {
		count: sorted.length,
		meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
		medianMs: median,
	};
}

const ENTRY_COUNTER: Partial<Record<RuntimeBoardColumnId, "started" | "reviewed" | "completed">> = {
	in_progress: "started",
	review: "reviewed",
	trash: "completed",
};

class ProjectStatisticsCollector {
	readonly buckets = new Map<string, RuntimeStatisticsCounts>();
	readonly totals = createEmptyCounts();
	readonly durations = createEmptyDurations();
	/** `counter:taskId:period`, so a card bouncing in and out of a column counts once per period. */
	private readonly countedEntries = new Set<string>();

	constructor(private readonly window: StatisticsWindow) {}

	inWindow(at: number): boolean {
		return at >= this.window.from && at <= this.window.to;
	}

	add(at: number, counter: keyof RuntimeStatisticsCounts, amount = 1): void {
		if (!this.inWindow(at)) {
			return;
		}
		const key = periodKeyOf(at, this.window.granularity, this.window.timeZone);
		let bucket = this.buckets.get(key);
		if (!bucket) {
			bucket = createEmptyCounts();
			this.buckets.set(key, bucket);
		}
		bucket[counter] += amount;
		this.totals[counter] += amount;
	}

	addEntry(at: number, taskId: string, column: RuntimeBoardColumnId): void {
		const counter = ENTRY_COUNTER[column];
		if (!counter || !this.inWindow(at)) {
			return;
		}
		const dedupeKey = `${counter}:${taskId}:${periodKeyOf(at, this.window.granularity, this.window.timeZone)}`;
		if (this.countedEntries.has(dedupeKey)) {
			return;
		}
		this.countedEntries.add(dedupeKey);
		this.add(at, counter);
	}

	addStay(column: RuntimeBoardColumnId, enteredAt: number, leftAt: number): void {
		if (!this.inWindow(leftAt)) {
			return;
		}
		if (column === "in_progress") {
			this.durations.inProgress.push(leftAt - enteredAt);
		} else if (column === "review") {
			this.durations.inReview.push(leftAt - enteredAt);
		}
	}
}

interface CardTrail {
	createdAt: number | null;
	column: RuntimeBoardColumnId | null;
	/** Null while the current stay began before the log did. */
	enteredAt: number | null;
	everCompletedInLog: boolean;
}

function collectCardFlow(collector: ProjectStatisticsCollector, events: RuntimeTaskEvent[], board: RuntimeBoardData) {
	const trails = new Map<string, CardTrail>();
	const trailOf = (taskId: string): CardTrail => {
		let trail = trails.get(taskId);
		if (!trail) {
			trail = { createdAt: null, column: null, enteredAt: null, everCompletedInLog: false };
			trails.set(taskId, trail);
		}
		return trail;
	};
	const enter = (taskId: string, trail: CardTrail, column: RuntimeBoardColumnId, at: number) => {
		trail.column = column;
		trail.enteredAt = at;
		collector.addEntry(at, taskId, column);
		if (column === "trash") {
			trail.everCompletedInLog = true;
			if (trail.createdAt !== null && collector.inWindow(at)) {
				collector.durations.leadTime.push(at - trail.createdAt);
			}
		}
	};
	const leave = (trail: CardTrail, at: number) => {
		if (trail.column && trail.enteredAt !== null) {
			collector.addStay(trail.column, trail.enteredAt, at);
		}
		trail.column = null;
		trail.enteredAt = null;
	};

	for (const event of events) {
		if (event.type === "session_state_changed") {
			continue;
		}
		const trail = trailOf(event.taskId);
		trail.createdAt ??= event.card.createdAt;
		if (event.type === "card_created") {
			enter(event.taskId, trail, event.column, event.at);
		} else if (event.type === "card_moved") {
			leave(trail, event.at);
			enter(event.taskId, trail, event.to, event.at);
		} else {
			leave(trail, event.at);
		}
	}

	// Creation dates come from every card known to the board or the log; a card deleted long
	// before the log began is the only one lost.
	const createdAtByTaskId = new Map<string, number>();
	for (const [taskId, trail] of trails) {
		if (trail.createdAt !== null) {
			createdAtByTaskId.set(taskId, trail.createdAt);
		}
	}
	for (const column of board.columns) {
		for (const card of column.cards) {
			createdAtByTaskId.set(card.id, card.createdAt);
			// Finished before the log existed: its last update is the best date there is.
			if (column.id === "trash" && !trails.get(card.id)?.everCompletedInLog) {
				collector.addEntry(card.updatedAt, card.id, "trash");
			}
		}
	}
	for (const createdAt of createdAtByTaskId.values()) {
		collector.add(createdAt, "created");
	}
}

function collectAgentWork(
	collector: ProjectStatisticsCollector,
	events: RuntimeTaskEvent[],
	sessions: ProjectStatisticsInput["sessions"],
	now: number,
) {
	const runningSince = new Map<string, number>();
	for (const event of events) {
		if (event.type !== "session_state_changed") {
			continue;
		}
		const startedAt = runningSince.get(event.taskId);
		if (startedAt !== undefined && event.to !== "running") {
			runningSince.delete(event.taskId);
			const duration = event.at - startedAt;
			collector.add(event.at, "agentWorkMs", duration);
			if (collector.inWindow(event.at)) {
				collector.durations.agentRun.push(duration);
			}
		} else if (event.to === "running" && startedAt === undefined) {
			runningSince.set(event.taskId, event.at);
		}
	}
	// A run still going counts up to now, but only if the session really is still running: a
	// run whose end was never logged (the runtime stopped mid-run) has no known length.
	for (const [taskId, startedAt] of runningSince) {
		if (sessions.get(taskId)?.state === "running") {
			collector.add(now, "agentWorkMs", now - startedAt);
		}
	}
}

function collectCommits(collector: ProjectStatisticsCollector, commits: CommitStat[]) {
	for (const commit of commits) {
		collector.add(commit.at, "commits");
		collector.add(commit.at, "filesChanged", commit.filesChanged);
		collector.add(commit.at, "filesCreated", commit.filesCreated);
		collector.add(commit.at, "additions", commit.additions);
		collector.add(commit.at, "deletions", commit.deletions);
	}
}

function countWip(board: RuntimeBoardData, sessions: ProjectStatisticsInput["sessions"]): RuntimeProjectTaskCounts {
	const wip = createEmptyWip();
	for (const column of board.columns) {
		for (const card of column.cards) {
			wip[resolveLiveTaskColumn(column.id, sessions.get(card.id))] += 1;
		}
	}
	return wip;
}

export function collectProjectStatistics(
	input: ProjectStatisticsInput,
	window: StatisticsWindow,
): ProjectStatisticsAccumulator {
	const collector = new ProjectStatisticsCollector(window);
	collectCardFlow(collector, input.events, input.board);
	collectAgentWork(collector, input.events, input.sessions, window.now);
	collectCommits(collector, input.commits);
	return {
		buckets: collector.buckets,
		totals: collector.totals,
		wip: countWip(input.board, input.sessions),
		durations: collector.durations,
		flowDataSince: input.events[0]?.at ?? null,
	};
}
