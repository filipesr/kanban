import { getRuntimeAgentCatalogEntry } from "@runtime-agent-catalog";
import type { ReactElement } from "react";

import { formatHistoryDuration, formatHistoryTime } from "@/components/detail-panels/done-card-history-format";
import type { RuntimeTaskHistory } from "@/runtime/types";

/** The facts a finished card can still tell; one it does not know is left out, never shown as unknown. */
export function DoneCardHistoryFacts({ history }: { history: RuntimeTaskHistory }): ReactElement | null {
	const { facts } = history;
	const agentLabel = history.agentId ? (getRuntimeAgentCatalogEntry(history.agentId)?.label ?? history.agentId) : null;
	const entries: Array<[string, string]> = [];
	if (agentLabel) {
		entries.push(["Agent", agentLabel]);
	}
	if (facts.durationMs !== null) {
		entries.push(["Duration", formatHistoryDuration(facts.durationMs)]);
	}
	if (facts.questionCount !== null) {
		entries.push(["Questions", String(facts.questionCount)]);
	}
	if (facts.finishedAt !== null) {
		entries.push(["Finished", formatHistoryTime(facts.finishedAt)]);
	}
	if (facts.messageCount > 0) {
		entries.push(["Messages", String(facts.messageCount)]);
	}
	if (entries.length === 0) {
		return null;
	}

	return (
		<dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-border bg-surface-1 px-3 py-2.5 text-xs">
			{entries.map(([label, value]) => (
				<div key={label} className="flex min-w-0 gap-1.5">
					<dt className="text-text-tertiary">{label}</dt>
					<dd className="m-0 truncate text-text-secondary">{value}</dd>
				</div>
			))}
		</dl>
	);
}
