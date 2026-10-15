// Builds the statistics dashboard: card flow from each project's event log, current columns from
// its board, and code changes from its git history, cut into the viewer's days, weeks or months.
// Read-only, like the overview: it never starts a session or a terminal for a project.
import type {
	RuntimeBoardData,
	RuntimeStatisticsBucket,
	RuntimeStatisticsProject,
	RuntimeStatisticsRequest,
	RuntimeStatisticsResponse,
	RuntimeTaskSessionSummary,
} from "../core/api-contract";
import { resolveProjectName } from "../core/live-task-column";
import { listPeriodKeys, resolveTimeZone } from "../core/period-buckets";
import type { RuntimeTaskEvent } from "../core/task-events";
import {
	addCounts,
	type CommitStat,
	collectProjectStatistics,
	createEmptyCounts,
	createEmptyDurations,
	createEmptyWip,
	type ProjectStatisticsAccumulator,
	type StatisticsWindow,
	summarizeDurations,
} from "../core/task-flow-statistics";
import type { RuntimeWorkspaceIndexEntry } from "../state/workspace-state";
import { pickNewestSessions } from "./projects-overview";

export interface StatisticsDependencies {
	listProjects: () => Promise<RuntimeWorkspaceIndexEntry[]>;
	loadBoard: (workspaceId: string) => Promise<RuntimeBoardData>;
	loadPersistedSessions: (workspaceId: string) => Promise<Record<string, RuntimeTaskSessionSummary>>;
	/** Sessions this runtime already holds for the project. Must not create any. */
	listLiveSessions: (workspaceId: string) => RuntimeTaskSessionSummary[];
	loadEvents: (workspaceId: string) => Promise<RuntimeTaskEvent[]>;
	loadCommits: (project: RuntimeWorkspaceIndexEntry) => Promise<CommitStat[]>;
	now?: () => number;
	warn?: (message: string) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function collectProject(
	deps: StatisticsDependencies,
	project: RuntimeWorkspaceIndexEntry,
	window: StatisticsWindow,
): Promise<{ project: RuntimeStatisticsProject; accumulator: ProjectStatisticsAccumulator }> {
	// Each source fails alone: an unreadable board or a broken repository leaves the rest standing.
	const [board, persistedSessions, events, commits] = await Promise.all([
		deps.loadBoard(project.workspaceId).catch((error: unknown): RuntimeBoardData => {
			deps.warn?.(`Could not read the board of ${project.repoPath} for statistics: ${errorMessage(error)}`);
			return { columns: [], dependencies: [] };
		}),
		deps.loadPersistedSessions(project.workspaceId).catch(() => ({})),
		deps.loadEvents(project.workspaceId).catch((error: unknown): RuntimeTaskEvent[] => {
			deps.warn?.(`Could not read the event log of ${project.repoPath}: ${errorMessage(error)}`);
			return [];
		}),
		deps
			.loadCommits(project)
			.then((value) => ({ value, error: null }))
			.catch((error: unknown) => ({ value: [] as CommitStat[], error: errorMessage(error) })),
	]);
	const sessions = pickNewestSessions(persistedSessions, deps.listLiveSessions(project.workspaceId));
	const accumulator = collectProjectStatistics({ events, board, sessions, commits: commits.value }, window);
	return {
		accumulator,
		project: {
			id: project.workspaceId,
			name: resolveProjectName(project.repoPath),
			path: project.repoPath,
			totals: accumulator.totals,
			wip: accumulator.wip,
			flowDataSince: accumulator.flowDataSince,
			gitError: commits.error,
		},
	};
}

export async function buildStatistics(
	deps: StatisticsDependencies,
	request: RuntimeStatisticsRequest,
): Promise<RuntimeStatisticsResponse> {
	const now = deps.now?.() ?? Date.now();
	const timeZone = resolveTimeZone(request.timeZone);
	const from = Math.min(request.from, request.to);
	const to = Math.max(request.from, request.to);
	const window: StatisticsWindow = { from, to, granularity: request.granularity, timeZone, now };

	const projects = (await deps.listProjects()).filter(
		(project) => !request.projectId || project.workspaceId === request.projectId,
	);
	const collected = await Promise.all(projects.map(async (project) => await collectProject(deps, project, window)));

	const buckets: RuntimeStatisticsBucket[] = listPeriodKeys(from, to, request.granularity, timeZone).map((key) => ({
		key,
		...createEmptyCounts(),
	}));
	const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
	const totals = createEmptyCounts();
	const wip = createEmptyWip();
	const durations = createEmptyDurations();
	let flowDataSince: number | null = null;
	for (const { accumulator } of collected) {
		for (const [key, counts] of accumulator.buckets) {
			const bucket = bucketByKey.get(key);
			if (bucket) {
				addCounts(bucket, counts);
			}
		}
		addCounts(totals, accumulator.totals);
		for (const column of Object.keys(wip) as Array<keyof typeof wip>) {
			wip[column] += accumulator.wip[column];
		}
		for (const kind of Object.keys(durations) as Array<keyof typeof durations>) {
			durations[kind].push(...accumulator.durations[kind]);
		}
		if (accumulator.flowDataSince !== null) {
			flowDataSince =
				flowDataSince === null ? accumulator.flowDataSince : Math.min(flowDataSince, accumulator.flowDataSince);
		}
	}

	const openCards = wip.backlog + wip.in_progress + wip.review;
	return {
		granularity: request.granularity,
		timeZone,
		from,
		to,
		generatedAt: now,
		flowDataSince,
		projects: collected.map(({ project }) => project).sort((left, right) => left.name.localeCompare(right.name)),
		buckets,
		totals,
		wip,
		rates: {
			completionRate: totals.created > 0 ? totals.completed / totals.created : null,
			reviewShare: openCards > 0 ? wip.review / openCards : null,
		},
		durations: {
			leadTime: summarizeDurations(durations.leadTime),
			inProgress: summarizeDurations(durations.inProgress),
			inReview: summarizeDurations(durations.inReview),
			agentRun: summarizeDurations(durations.agentRun),
		},
	};
}
