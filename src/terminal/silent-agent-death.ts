/**
 * A task agent that dies before printing anything leaves nothing to go on.
 *
 * This happened in practice: cards went to review with `exitCode: 1`, `lastOutputAt: null` and no
 * hook activity, and the only way to learn what was launched was to patch the spawn by hand and
 * reproduce. The pty buffer is the sole record of a startup failure, and it dies with the session.
 *
 * So this is the one case worth a line on stderr: a non-zero exit with no output at all. A
 * session that printed something has left its own evidence, and a clean exit is not a failure.
 */

export interface SilentAgentDeath {
	taskId: string;
	binary: string;
	args: readonly string[];
	cwd: string;
	exitCode: number | null;
	sawOutput: boolean;
}

/** The argument carrying the task prompt can be thousands of characters; the shape is enough. */
function summarizeArgs(args: readonly string[]): string {
	return args.map((arg) => (arg.length > 60 ? `${arg.slice(0, 57)}...` : arg)).join(" ");
}

export function describeSilentAgentDeath(death: SilentAgentDeath): string | undefined {
	if (death.sawOutput || death.exitCode === 0 || death.exitCode === null) {
		return undefined;
	}
	return [
		`Agent session ${death.taskId} exited with code ${death.exitCode} without producing any output.`,
		`  binary: ${death.binary}`,
		`  args:   ${summarizeArgs(death.args)}`,
		`  cwd:    ${death.cwd}`,
	].join("\n");
}
