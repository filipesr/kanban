import { existsSync } from "node:fs";

import type { RuntimeTaskSessionSummary } from "../core/api-contract";
import { probeGitWorkspaceState } from "../workspace/git-sync";
import { runGit } from "../workspace/git-utils";

/**
 * What is still missing for a finished card's work to reach its base branch, worked out from git.
 *
 * A task worktree is a detached HEAD: no branch belongs to the task, so a commit made there is
 * reachable only from that worktree, and moving the card to Done deletes it. Offering the next
 * step from where the notification is read is what keeps that work from being lost on the way.
 *
 * Derived, never remembered. A step done any other way -- a typed "faz o merge", the board's
 * Commit button -- still counts, and nothing is stored that could fall out of step with the
 * repository.
 */

export type CardClosingStep = "integrate" | "push";

export interface CardClosingState {
	next: CardClosingStep | null;
	/** Commits in the worktree whose change is not in base, which Concluir would discard. */
	unintegratedCommits: number;
	/**
	 * Git could not read the worktree, so what Concluir would discard is not known. Not the same
	 * as nothing pending: treated as nothing, it offers a bare Concluir over commits it never saw.
	 */
	unknown?: true;
}

export interface CardClosingAction {
	id: "integrate" | "push" | "done";
	label: string;
	/** Asked before acting, when acting would lose work. */
	confirm?: string;
}

const NOTHING_PENDING: CardClosingState = { next: null, unintegratedCommits: 0 };
const UNKNOWN: CardClosingState = { next: null, unintegratedCommits: 0, unknown: true };

/** `git cherry` compares by patch, not by hash, so a cherry-picked commit counts as integrated. */
async function countUnintegratedCommits(worktreePath: string, baseRef: string): Promise<number> {
	const result = await runGit(worktreePath, ["cherry", baseRef, "HEAD"]);
	if (!result.ok) {
		throw new Error(result.error ?? "git cherry failed.");
	}
	return result.stdout.split("\n").filter((line) => line.startsWith("+")).length;
}

async function isBasePushPending(repoPath: string, baseRef: string): Promise<boolean> {
	const probe = await probeGitWorkspaceState(repoPath);
	// Only the branch someone is on: pushing a base nobody has checked out is not this button.
	return probe.currentBranch === baseRef && probe.upstreamBranch !== null && probe.aheadCount > 0;
}

export async function resolveCardClosingState(input: {
	worktreePath: string | null;
	repoPath: string;
	baseRef: string;
}): Promise<CardClosingState> {
	try {
		if (!input.worktreePath || !input.baseRef || !existsSync(input.worktreePath)) {
			return NOTHING_PENDING;
		}
		const worktree = await probeGitWorkspaceState(input.worktreePath);
		const unintegratedCommits = await countUnintegratedCommits(input.worktreePath, input.baseRef);
		if (worktree.changedFiles > 0 || unintegratedCommits > 0) {
			return { next: "integrate", unintegratedCommits };
		}
		const pushPending = await isBasePushPending(input.repoPath, input.baseRef);
		return { next: pushPending ? "push" : null, unintegratedCommits: 0 };
	} catch {
		// An accessory: a notification never fails over this. It offers less, and asks before
		// Concluir, since it could not see what Concluir would discard.
		return UNKNOWN;
	}
}

/**
 * Whether a card's session can take the commit prompt. A terminal agent needs its process; a
 * native Cline session has none (`pid` is always null) and is reached as a chat message, which
 * the runtime can deliver to a persisted session by rebinding it.
 */
export function canReceiveTaskInput(session: Pick<RuntimeTaskSessionSummary, "agentId" | "pid">): boolean {
	return session.agentId === "cline" || session.pid !== null;
}

function describeDiscard(count: number): string {
	return count === 1
		? "1 commit não integrado será descartado."
		: `${count} commits não integrados serão descartados.`;
}

function describeConcluirRisk(state: CardClosingState): string | undefined {
	if (state.unknown) {
		return "Não consegui verificar se há trabalho não integrado.";
	}
	return state.unintegratedCommits > 0 ? describeDiscard(state.unintegratedCommits) : undefined;
}

export function buildCardClosingActions(
	state: CardClosingState,
	baseRef: string,
	options: {
		/** Whether the card's session can take the commit prompt; a dead one would refuse it forever. */
		canIntegrate?: boolean;
	} = {},
): CardClosingAction[] {
	const actions: CardClosingAction[] = [];
	if (state.next === "integrate" && options.canIntegrate !== false) {
		actions.push({ id: "integrate", label: `Integrar na ${baseRef}` });
	} else if (state.next === "push") {
		actions.push({ id: "push", label: "Push" });
	}
	const confirm = describeConcluirRisk(state);
	actions.push(confirm ? { id: "done", label: "Concluir", confirm } : { id: "done", label: "Concluir" });
	return actions;
}
