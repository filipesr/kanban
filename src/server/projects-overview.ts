// Builds the cross-project overview: every card of every registered project, flattened, with
// the live state of its session. Read-only by design -- it reads boards through workspace-state
// and sessions from whatever this runtime already holds in memory, and never starts a terminal
// manager or an SDK session for a project nobody has opened.
import type {
	RuntimeBoardData,
	RuntimeProjectsOverviewCard,
	RuntimeProjectsOverviewCardStatus,
	RuntimeProjectsOverviewProject,
	RuntimeProjectsOverviewRequest,
	RuntimeProjectsOverviewResponse,
	RuntimeTaskSessionSummary,
} from "../core/api-contract";
import { resolveLiveTaskColumn, resolveProjectName } from "../core/live-task-column";
import type { RuntimeWorkspaceIndexEntry } from "../state/workspace-state";
import { describeReviewRequest, isAwaitingAnswer } from "./review-request-detail";

/**
 * A card's conclusion can be pages of markdown. The overview shows a few lines of it; the card
 * itself, one click away, has the whole text.
 */
const MAX_ACTIVITY_TEXT_LENGTH = 600;

export interface ProjectsOverviewDependencies {
	listProjects: () => Promise<RuntimeWorkspaceIndexEntry[]>;
	loadBoard: (workspaceId: string) => Promise<RuntimeBoardData>;
	loadPersistedSessions: (workspaceId: string) => Promise<Record<string, RuntimeTaskSessionSummary>>;
	/** Sessions this runtime already holds for the project. Must not create any. */
	listLiveSessions: (workspaceId: string) => RuntimeTaskSessionSummary[];
	warn?: (message: string) => void;
}

function pickNewestSessions(
	persisted: Record<string, RuntimeTaskSessionSummary>,
	live: RuntimeTaskSessionSummary[],
): Map<string, RuntimeTaskSessionSummary> {
	const byTaskId = new Map<string, RuntimeTaskSessionSummary>(Object.entries(persisted));
	for (const summary of live) {
		const existing = byTaskId.get(summary.taskId);
		// Live wins ties: memory is never behind what it last wrote to disk.
		if (!existing || existing.updatedAt <= summary.updatedAt) {
			byTaskId.set(summary.taskId, summary);
		}
	}
	return byTaskId;
}

export function resolveOverviewCardStatus(
	summary: RuntimeTaskSessionSummary | undefined,
): RuntimeProjectsOverviewCardStatus | null {
	if (!summary) {
		return null;
	}
	if (summary.state === "awaiting_review" && isAwaitingAnswer(summary)) {
		return "awaiting_answer";
	}
	return summary.state;
}

function clipActivityText(text: string | null | undefined): string | null {
	const trimmed = text?.trim();
	if (!trimmed) {
		return null;
	}
	return trimmed.length > MAX_ACTIVITY_TEXT_LENGTH ? `${trimmed.slice(0, MAX_ACTIVITY_TEXT_LENGTH - 1)}…` : trimmed;
}

function resolveActivityText(
	summary: RuntimeTaskSessionSummary | undefined,
	status: RuntimeProjectsOverviewCardStatus | null,
): string | null {
	if (!summary || status === null || status === "idle") {
		return null;
	}
	if (status === "running") {
		return clipActivityText(summary.latestHookActivity?.activityText);
	}
	return clipActivityText(describeReviewRequest(summary));
}

function toOverviewCards(
	projectId: string,
	board: RuntimeBoardData,
	sessionsByTaskId: Map<string, RuntimeTaskSessionSummary>,
): RuntimeProjectsOverviewCard[] {
	const cards: RuntimeProjectsOverviewCard[] = [];
	for (const column of board.columns) {
		for (const card of column.cards) {
			const summary = sessionsByTaskId.get(card.id);
			const status = resolveOverviewCardStatus(summary);
			cards.push({
				projectId,
				taskId: card.id,
				column: resolveLiveTaskColumn(column.id, summary),
				title: card.title ?? card.prompt,
				tags: card.tags ?? [],
				category: card.category?.trim() || null,
				priority: card.priority ?? null,
				source: card.source ?? null,
				agentId: summary?.agentId ?? card.agentId ?? null,
				createdAt: card.createdAt,
				updatedAt: card.updatedAt,
				status,
				pendingQuestion: status === "awaiting_answer" && summary ? (describeReviewRequest(summary) ?? null) : null,
				activityText: status === "awaiting_answer" ? null : resolveActivityText(summary, status),
				sessionUpdatedAt: summary?.updatedAt ?? null,
			});
		}
	}
	return cards;
}

async function loadProjectCards(
	deps: ProjectsOverviewDependencies,
	project: RuntimeWorkspaceIndexEntry,
): Promise<RuntimeProjectsOverviewCard[]> {
	let board: RuntimeBoardData;
	try {
		board = await deps.loadBoard(project.workspaceId);
	} catch (error) {
		// One unreadable board must not blank the whole overview; the project still lists, empty.
		const message = error instanceof Error ? error.message : String(error);
		deps.warn?.(`Could not read the board of ${project.repoPath} for the overview: ${message}`);
		return [];
	}
	let persistedSessions: Record<string, RuntimeTaskSessionSummary> = {};
	try {
		persistedSessions = await deps.loadPersistedSessions(project.workspaceId);
	} catch {
		// Cards without session state are still worth showing.
	}
	const sessionsByTaskId = pickNewestSessions(persistedSessions, deps.listLiveSessions(project.workspaceId));
	return toOverviewCards(project.workspaceId, board, sessionsByTaskId);
}

export async function buildProjectsOverview(
	deps: ProjectsOverviewDependencies,
	request?: RuntimeProjectsOverviewRequest,
): Promise<RuntimeProjectsOverviewResponse> {
	const requestedIds = request?.projectIds ? new Set(request.projectIds) : null;
	const projects = (await deps.listProjects()).filter(
		(project) => !requestedIds || requestedIds.has(project.workspaceId),
	);
	const cardsByProject = await Promise.all(projects.map(async (project) => await loadProjectCards(deps, project)));
	const overviewProjects: RuntimeProjectsOverviewProject[] = projects
		.map((project) => ({
			id: project.workspaceId,
			name: resolveProjectName(project.repoPath),
			path: project.repoPath,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
	return {
		projects: overviewProjects,
		cards: cardsByProject.flat(),
	};
}
