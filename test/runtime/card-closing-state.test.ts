import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildCardClosingActions, resolveCardClosingState } from "../../src/server/card-closing-state";
import { createGitTestEnv } from "../utilities/git-env";
import { createTempDir } from "../utilities/temp-dir";

function git(cwd: string, args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", env: createGitTestEnv() });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
	}
	return result.stdout.trim();
}

const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

/** A repository on `main` with an upstream, and a detached task worktree, as Kanban creates them. */
function setup(): { repo: string; worktree: string } {
	const remoteDir = createTempDir("closing-remote-");
	const repoDir = createTempDir("closing-repo-");
	const worktreeDir = createTempDir("closing-wt-");
	cleanups.push(remoteDir.cleanup, repoDir.cleanup, worktreeDir.cleanup);
	git(remoteDir.path, ["init", "--bare", "-b", "main"]);
	git(repoDir.path, ["init", "-b", "main"]);
	writeFileSync(join(repoDir.path, "a.txt"), "a\n");
	git(repoDir.path, ["add", "."]);
	git(repoDir.path, ["commit", "-m", "base"]);
	git(repoDir.path, ["remote", "add", "origin", remoteDir.path]);
	git(repoDir.path, ["push", "-u", "origin", "main"]);
	const worktree = join(worktreeDir.path, "wt");
	git(repoDir.path, ["worktree", "add", "--detach", worktree, "main"]);
	return { repo: repoDir.path, worktree };
}

function commitInWorktree(worktree: string): string {
	writeFileSync(join(worktree, "b.txt"), "b\n");
	git(worktree, ["add", "."]);
	git(worktree, ["commit", "-m", "task"]);
	return git(worktree, ["rev-parse", "HEAD"]);
}

describe("resolveCardClosingState", () => {
	it("offers integrate for uncommitted changes in the worktree", async () => {
		const { repo, worktree } = setup();
		writeFileSync(join(worktree, "b.txt"), "b\n");
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: "integrate",
			unintegratedCommits: 0,
		});
	});

	it("offers integrate for a commit not yet in base, and counts it", async () => {
		const { repo, worktree } = setup();
		commitInWorktree(worktree);
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: "integrate",
			unintegratedCommits: 1,
		});
	});

	// The default commit template cherry-picks, which gives the commit a new hash on base.
	it("treats a cherry-picked commit as integrated and offers push", async () => {
		const { repo, worktree } = setup();
		const taskCommit = commitInWorktree(worktree);
		git(repo, ["cherry-pick", taskCommit]);
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: "push",
			unintegratedCommits: 0,
		});
	});

	it("offers nothing once base is pushed", async () => {
		const { repo, worktree } = setup();
		expect(await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" })).toEqual({
			next: null,
			unintegratedCommits: 0,
		});
	});

	it("offers no push when base is not the branch checked out in the repository", async () => {
		const { repo, worktree } = setup();
		writeFileSync(join(repo, "c.txt"), "c\n");
		git(repo, ["add", "."]);
		git(repo, ["commit", "-m", "local"]);
		git(repo, ["checkout", "-b", "other"]);
		const state = await resolveCardClosingState({ worktreePath: worktree, repoPath: repo, baseRef: "main" });
		expect(state.next).toBeNull();
	});

	// Not knowing is not the same as nothing pending: a bare Concluir would discard the
	// worktree's commits without asking.
	it("reports an unknown state when git cannot read the worktree", async () => {
		const { repo } = setup();
		const notARepo = createTempDir("closing-not-a-repo-");
		cleanups.push(notARepo.cleanup);
		expect(await resolveCardClosingState({ worktreePath: notARepo.path, repoPath: repo, baseRef: "main" })).toEqual({
			next: null,
			unintegratedCommits: 0,
			unknown: true,
		});
	});

	it("degrades to nothing when the worktree is gone", async () => {
		const { repo } = setup();
		expect(
			await resolveCardClosingState({ worktreePath: "/nonexistent/wt", repoPath: repo, baseRef: "main" }),
		).toEqual({
			next: null,
			unintegratedCommits: 0,
		});
	});
});

describe("buildCardClosingActions", () => {
	it("names the card's base on integrate and always offers Concluir", () => {
		expect(buildCardClosingActions({ next: "integrate", unintegratedCommits: 0 }, "develop")).toEqual([
			{ id: "integrate", label: "Integrar na develop" },
			{ id: "done", label: "Concluir" },
		]);
	});

	it("asks before discarding commits", () => {
		expect(buildCardClosingActions({ next: "integrate", unintegratedCommits: 2 }, "main")[1]).toEqual({
			id: "done",
			label: "Concluir",
			confirm: "2 commits não integrados serão descartados.",
		});
		expect(buildCardClosingActions({ next: "integrate", unintegratedCommits: 1 }, "main")[1]?.confirm).toBe(
			"1 commit não integrado será descartado.",
		);
	});

	it("asks before Concluir when it could not tell what would be lost", () => {
		expect(buildCardClosingActions({ next: null, unintegratedCommits: 0, unknown: true }, "main")).toEqual([
			{ id: "done", label: "Concluir", confirm: "Não consegui verificar se há trabalho não integrado." },
		]);
	});

	// A card whose agent is gone cannot receive the commit prompt; the button would be refused
	// every time it is tapped.
	it("does not offer integrate to a card that cannot receive it", () => {
		expect(
			buildCardClosingActions({ next: "integrate", unintegratedCommits: 1 }, "main", { canIntegrate: false }),
		).toEqual([{ id: "done", label: "Concluir", confirm: "1 commit não integrado será descartado." }]);
	});

	it("offers push, then only Concluir", () => {
		expect(
			buildCardClosingActions({ next: "push", unintegratedCommits: 0 }, "main").map((action) => action.id),
		).toEqual(["push", "done"]);
		expect(buildCardClosingActions({ next: null, unintegratedCommits: 0 }, "main")).toEqual([
			{ id: "done", label: "Concluir" },
		]);
	});
});
