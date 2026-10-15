// Per-commit change counts of a project's checked-out branch, for the statistics dashboard.
// Git keeps this history itself, so unlike card flow it is complete for the past; the cost is
// reading it, which is why the result is cached and only extended with the commits added since.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { lockedFileSystem } from "../fs/locked-file-system";
import { runGit } from "./git-utils";

const FIELD_SEPARATOR = "\x1f";
const RECORD_SEPARATOR = "\x1e";
const LOG_FORMAT = `${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%ct`;
const NUMSTAT_LINE = /^(\d+|-)\t(\d+|-)\t.+$/;
const CREATE_LINE = /^ create mode \d+ /;
const GIT_STATS_MAX_BUFFER_BYTES = 256 * 1024 * 1024;
const CACHE_VERSION = 1;
const CACHE_FILENAME = "git-stats.json";

export function getGitStatsCachePath(workspaceDirectoryPath: string): string {
	return join(workspaceDirectoryPath, CACHE_FILENAME);
}

export const gitCommitStatSchema = z.object({
	hash: z.string(),
	/** Committer time in ms: when the change landed on this branch, which for a cherry-pick is the integration. */
	at: z.number(),
	filesChanged: z.number(),
	filesCreated: z.number(),
	additions: z.number(),
	deletions: z.number(),
});
export type GitCommitStat = z.infer<typeof gitCommitStatSchema>;

const gitStatsCacheSchema = z.object({
	version: z.literal(CACHE_VERSION),
	headCommit: z.string(),
	commits: z.array(gitCommitStatSchema),
});
type GitStatsCache = z.infer<typeof gitStatsCacheSchema>;

/**
 * Parses `git log --numstat --summary` in {@link LOG_FORMAT}. Binary files count as changed with
 * no lines; a file shows as created only through its `create mode` summary line.
 */
export function parseNumstatLog(output: string): GitCommitStat[] {
	const commits: GitCommitStat[] = [];
	for (const record of output.split(RECORD_SEPARATOR)) {
		const lines = record.split("\n");
		const [hash, committedAt] = (lines[0] ?? "").split(FIELD_SEPARATOR);
		const seconds = Number(committedAt);
		if (!hash || !Number.isFinite(seconds)) {
			continue;
		}
		const commit: GitCommitStat = {
			hash,
			at: seconds * 1000,
			filesChanged: 0,
			filesCreated: 0,
			additions: 0,
			deletions: 0,
		};
		for (const line of lines.slice(1)) {
			const numstat = NUMSTAT_LINE.exec(line);
			if (numstat) {
				commit.filesChanged += 1;
				commit.additions += numstat[1] === "-" ? 0 : Number(numstat[1]);
				commit.deletions += numstat[2] === "-" ? 0 : Number(numstat[2]);
			} else if (CREATE_LINE.test(line)) {
				commit.filesCreated += 1;
			}
		}
		commits.push(commit);
	}
	return commits;
}

async function readCache(cachePath: string): Promise<GitStatsCache | null> {
	try {
		const parsed = gitStatsCacheSchema.safeParse(JSON.parse(await readFile(cachePath, "utf8")));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

async function logCommits(repoPath: string, range: string): Promise<GitCommitStat[]> {
	// Merges are left out: their diff repeats changes already counted on the commits they join.
	const result = await runGit(
		repoPath,
		["log", "--no-merges", "--numstat", "--summary", `--format=${LOG_FORMAT}`, range],
		{ maxBuffer: GIT_STATS_MAX_BUFFER_BYTES },
	);
	if (!result.ok) {
		throw new Error(result.error ?? `git log failed in ${repoPath}`);
	}
	return parseNumstatLog(result.stdout);
}

/**
 * Every non-merge commit reachable from the project's HEAD, newest first. Reuses the cache when
 * HEAD has only moved forward, reading just the new commits; a branch switch or a rewritten
 * history makes the cache unusable and the whole log is read again. A repository without commits
 * has no stats.
 */
export async function loadGitCommitStats(repoPath: string, cachePath: string): Promise<GitCommitStat[]> {
	const head = await runGit(repoPath, ["rev-parse", "--verify", "HEAD"]);
	if (!head.ok || !head.stdout) {
		return [];
	}
	const headCommit = head.stdout;
	const cache = await readCache(cachePath);
	if (cache?.headCommit === headCommit) {
		return cache.commits;
	}
	let commits: GitCommitStat[];
	const canExtend =
		cache !== null && (await runGit(repoPath, ["merge-base", "--is-ancestor", cache.headCommit, headCommit])).ok;
	if (cache && canExtend) {
		commits = [...(await logCommits(repoPath, `${cache.headCommit}..${headCommit}`)), ...cache.commits];
	} else {
		commits = await logCommits(repoPath, headCommit);
	}
	const nextCache: GitStatsCache = { version: CACHE_VERSION, headCommit, commits };
	await lockedFileSystem.writeTextFileAtomic(cachePath, JSON.stringify(nextCache));
	return commits;
}
