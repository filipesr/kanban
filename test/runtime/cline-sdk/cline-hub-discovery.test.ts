import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findRunningHubDiscovery } from "../../../src/cline-sdk/cline-hub-discovery";

const LIVE_PID = 111;
const DEAD_PID = 222;

function record(overrides: { port: number; pid?: number; updatedAt?: string }) {
	return {
		hubId: `hub_${overrides.port}`,
		protocolVersion: "v1",
		authToken: `token-${overrides.port}`,
		host: "127.0.0.1",
		port: overrides.port,
		url: `ws://127.0.0.1:${overrides.port}/hub`,
		pid: overrides.pid,
		startedAt: "2026-10-14T19:42:22.421Z",
		updatedAt: overrides.updatedAt ?? "2026-10-14T19:42:22.421Z",
	};
}

// A hub started from a CLI built from source does not write `locks/hub/production.json`: it
// writes an owner-scoped record under `locks/hub/owners/`, named after a hash of its build id.
// Kanban cannot compute that hash, so it has to find the record, and it must skip the ones a
// dead hub left behind.
describe("findRunningHubDiscovery", () => {
	let dataDir: string;
	const isPidAlive = (pid: number) => pid === LIVE_PID;

	const writeRecord = async (relativePath: string, value: unknown) => {
		const path = join(dataDir, "locks", "hub", relativePath);
		await mkdir(join(path, ".."), { recursive: true });
		await writeFile(path, JSON.stringify(value));
	};

	beforeEach(async () => {
		dataDir = await mkdtemp(join(tmpdir(), "kanban-hub-discovery-"));
	});

	afterEach(async () => {
		await rm(dataDir, { recursive: true, force: true });
	});

	it("finds a hub that wrote an owner-scoped record, as a source-built CLI does", async () => {
		await writeRecord("owners/hub-248c54bd3a2d.json", record({ port: 25466, pid: LIVE_PID }));

		const found = await findRunningHubDiscovery({ dataDir, buildEnv: "production", isPidAlive, env: {} });

		expect(found).toEqual({ url: "ws://127.0.0.1:25466/hub", authToken: "token-25466" });
	});

	it("prefers the build env's own record when its hub is alive", async () => {
		await writeRecord("production.json", record({ port: 1000, pid: LIVE_PID }));
		await writeRecord("owners/hub-aaa.json", record({ port: 2000, pid: LIVE_PID }));

		const found = await findRunningHubDiscovery({ dataDir, buildEnv: "production", isPidAlive, env: {} });

		expect(found?.url).toBe("ws://127.0.0.1:1000/hub");
	});

	it("skips records left behind by a hub that is no longer running", async () => {
		await writeRecord("production.json", record({ port: 1000, pid: DEAD_PID }));
		await writeRecord("owners/hub-dead.json", record({ port: 2000, pid: DEAD_PID }));
		await writeRecord("owners/hub-live.json", record({ port: 3000, pid: LIVE_PID }));

		const found = await findRunningHubDiscovery({ dataDir, buildEnv: "production", isPidAlive, env: {} });

		expect(found?.url).toBe("ws://127.0.0.1:3000/hub");
	});

	it("picks the most recently updated of several live owner records", async () => {
		await writeRecord(
			"owners/hub-old.json",
			record({ port: 2000, pid: LIVE_PID, updatedAt: "2026-10-13T10:00:00.000Z" }),
		);
		await writeRecord(
			"owners/hub-new.json",
			record({ port: 3000, pid: LIVE_PID, updatedAt: "2026-10-15T10:00:00.000Z" }),
		);

		const found = await findRunningHubDiscovery({ dataDir, buildEnv: "production", isPidAlive, env: {} });

		expect(found?.url).toBe("ws://127.0.0.1:3000/hub");
	});

	it("returns nothing when no hub is running", async () => {
		await writeRecord("owners/hub-dead.json", record({ port: 2000, pid: DEAD_PID }));

		await expect(
			findRunningHubDiscovery({ dataDir, buildEnv: "production", isPidAlive, env: {} }),
		).resolves.toBeUndefined();
	});

	it("returns nothing, without throwing, when the locks directory does not exist", async () => {
		await expect(
			findRunningHubDiscovery({ dataDir, buildEnv: "production", isPidAlive, env: {} }),
		).resolves.toBeUndefined();
	});

	it("honours CLINE_HUB_DISCOVERY_PATH, as the SDK does", async () => {
		await writeRecord("owners/hub-live.json", record({ port: 3000, pid: LIVE_PID }));
		await writeRecord("custom.json", record({ port: 4000, pid: LIVE_PID }));

		const found = await findRunningHubDiscovery({
			dataDir,
			buildEnv: "production",
			isPidAlive,
			env: { CLINE_HUB_DISCOVERY_PATH: join(dataDir, "locks", "hub", "custom.json") },
		});

		expect(found?.url).toBe("ws://127.0.0.1:4000/hub");
	});
});
