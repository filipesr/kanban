import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadGitCommitStats, parseNumstatLog } from "../../../src/workspace/git-stats";
import { createGitTestEnv } from "../../utilities/git-env";
import { createTempDir } from "../../utilities/temp-dir";

describe("parseNumstatLog", () => {
	it("counts files, lines and created files per commit, binaries without lines", () => {
		const output = [
			"\x1eaaa\x1f1700000000",
			"",
			"3\t1\tsrc/a.ts",
			"-\t-\tlogo.png",
			"10\t0\tsrc/new.ts",
			" create mode 100644 logo.png",
			" create mode 100644 src/new.ts",
			"\x1ebbb\x1f1690000000",
			"",
			"0\t4\tsrc/{old => renamed}.ts",
			" delete mode 100644 gone.ts",
		].join("\n");
		expect(parseNumstatLog(output)).toEqual([
			{ hash: "aaa", at: 1_700_000_000_000, filesChanged: 3, filesCreated: 2, additions: 13, deletions: 1 },
			{ hash: "bbb", at: 1_690_000_000_000, filesChanged: 1, filesCreated: 0, additions: 0, deletions: 4 },
		]);
	});

	it("keeps a commit that changed no file", () => {
		expect(parseNumstatLog("\x1eccc\x1f1700000000\n")).toEqual([
			{ hash: "ccc", at: 1_700_000_000_000, filesChanged: 0, filesCreated: 0, additions: 0, deletions: 0 },
		]);
	});
});

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", env: createGitTestEnv() });
	if (result.status !== 0) {
		throw new Error(result.stderr);
	}
	return result.stdout.trim();
}

function commitFile(repo: string, name: string, content: string): void {
	writeFileSync(join(repo, name), content);
	git(repo, "add", name);
	git(repo, "commit", "-q", "-m", `edit ${name}`);
}

describe("loadGitCommitStats", () => {
	it("reads only the new commits when HEAD moved forward, and everything again after a rewrite", async () => {
		const repo = createTempDir("kanban-git-stats-");
		const cacheDir = createTempDir("kanban-git-stats-cache-");
		const cachePath = join(cacheDir.path, "git-stats.json");
		try {
			git(repo.path, "init", "-q");
			commitFile(repo.path, "a.txt", "one\n");
			expect(await loadGitCommitStats(repo.path, cachePath)).toHaveLength(1);

			commitFile(repo.path, "a.txt", "one\ntwo\n");
			// A commit only the cache knows: if the second read rescanned history, it would vanish.
			const cache = JSON.parse(readFileSync(cachePath, "utf8")) as { commits: unknown[] };
			cache.commits.push({
				hash: "only-in-cache",
				at: 1,
				filesChanged: 0,
				filesCreated: 0,
				additions: 0,
				deletions: 0,
			});
			writeFileSync(cachePath, JSON.stringify(cache));
			const extended = await loadGitCommitStats(repo.path, cachePath);
			expect(extended.map((commit) => commit.hash)).toContain("only-in-cache");
			expect(extended[0]).toMatchObject({ filesChanged: 1, filesCreated: 0, additions: 1, deletions: 0 });

			git(repo.path, "commit", "-q", "--amend", "-m", "rewritten");
			const rescanned = await loadGitCommitStats(repo.path, cachePath);
			expect(rescanned.map((commit) => commit.hash)).not.toContain("only-in-cache");
			expect(rescanned).toHaveLength(2);
		} finally {
			repo.cleanup();
			cacheDir.cleanup();
		}
	});

	it("has nothing for a repository without commits", async () => {
		const repo = createTempDir("kanban-git-stats-empty-");
		try {
			git(repo.path, "init", "-q");
			expect(await loadGitCommitStats(repo.path, join(repo.path, "cache.json"))).toEqual([]);
		} finally {
			repo.cleanup();
		}
	});
});
