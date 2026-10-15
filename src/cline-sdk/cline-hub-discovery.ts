import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { readHubDiscovery } from "@clinebot/core";

/** The SDK's own override for where the hub discovery record lives. */
const HUB_DISCOVERY_ENV = "CLINE_HUB_DISCOVERY_PATH";

export interface RunningHubDiscovery {
	url: string;
	authToken: string;
}

export interface FindRunningHubDiscoveryOptions {
	/** The Cline data dir, `~/.cline/data` unless overridden. */
	dataDir: string;
	/** Kanban's own build env, which names the record a hub of the same build writes. */
	buildEnv: string;
	isPidAlive?: (pid: number) => boolean;
	env?: NodeJS.ProcessEnv;
}

function defaultIsPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: the process exists, it just belongs to someone else.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function listOwnerRecordPaths(ownersDir: string): Promise<string[]> {
	try {
		const names = await readdir(ownersDir);
		return names.filter((name) => name.endsWith(".json")).map((name) => join(ownersDir, name));
	} catch {
		return [];
	}
}

/**
 * Finds the hub that is running right now, wherever it wrote its discovery record.
 *
 * Why not just read `locks/hub/<buildEnv>.json`: only a production CLI writes that. A CLI run
 * from source scopes its hub by build id and writes `locks/hub/owners/hub-<hash>.json`, a name
 * Kanban cannot compute. Reading only the production path left Kanban publishing to nobody
 * whenever the hub came from a source checkout, silently, because a missing hub is normal.
 *
 * A record outlives the hub that wrote it, so one whose pid is gone is skipped rather than
 * trusted: connecting to it only fails, and would hide a live hub further down the list.
 */
export async function findRunningHubDiscovery(
	options: FindRunningHubDiscoveryOptions,
): Promise<RunningHubDiscovery | undefined> {
	const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
	const env = options.env ?? process.env;
	const hubLocksDir = join(options.dataDir, "locks", "hub");

	const overridePath = env[HUB_DISCOVERY_ENV]?.trim();
	const ownerPaths = overridePath ? [] : await listOwnerRecordPaths(join(hubLocksDir, "owners"));
	const primaryPath = overridePath || join(hubLocksDir, `${options.buildEnv}.json`);

	const [primary, ...owners] = await Promise.all([primaryPath, ...ownerPaths].map((path) => readHubDiscovery(path)));
	// The build env's own record first; among owner records, the most recently updated hub.
	const candidates = [
		primary,
		...owners.sort((left, right) => (right?.updatedAt ?? "").localeCompare(left?.updatedAt ?? "")),
	];

	const running = candidates.find(
		(record) => record !== undefined && (record.pid === undefined || isPidAlive(record.pid)),
	);
	return running ? { url: running.url, authToken: running.authToken } : undefined;
}
