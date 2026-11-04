import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import { ClineChatMessageItem } from "@/components/detail-panels/cline-chat-message-item";
import { ClineMarkdownContent } from "@/components/detail-panels/cline-markdown-content";
import { DoneCardHistoryFacts } from "@/components/detail-panels/done-card-history-facts";
import { formatColumnName, formatHistoryTime } from "@/components/detail-panels/done-card-history-format";
import { TaskImageStrip } from "@/components/task-image-strip";
import { Spinner } from "@/components/ui/spinner";
import { useTaskHistory } from "@/hooks/use-task-history";
import type { RuntimeTaskHistory } from "@/runtime/types";
import type { BoardCard } from "@/types";

/**
 * What a finished card was and how it went: the request and the outcome up front, the full
 * conversation and the card's moves folded away. Read-only; dragging the card back to Review is
 * what reopens it.
 */
export function DoneCardHistoryPanel({ projectId, card }: { projectId: string | null; card: BoardCard }): ReactElement {
	const { history, isLoading, error } = useTaskHistory({ projectId, taskId: card.id });

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-surface-0 px-4 py-4">
			{isLoading ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner size={20} />
				</div>
			) : error || !history ? (
				<p className="m-0 text-sm text-text-secondary">{error ?? "Could not load this card's history."}</p>
			) : (
				<DoneCardHistoryContent history={history} />
			)}
		</div>
	);
}

function DoneCardHistoryContent({ history }: { history: RuntimeTaskHistory }): ReactElement {
	const messageCount = history.runs.reduce((count, run) => count + run.messages.length, 0);

	return (
		<div className="flex flex-col gap-3">
			<HistoryBlock label="Request">
				{history.title ? <div className="mb-1 font-medium text-text-primary">{history.title}</div> : null}
				<div className="whitespace-pre-wrap break-words text-text-primary">{history.prompt}</div>
				{history.images && history.images.length > 0 ? (
					<TaskImageStrip images={history.images} className="mt-2" />
				) : null}
			</HistoryBlock>
			{history.outcome ? (
				<HistoryBlock label={history.outcome.kind === "result" ? "Result" : "Last reply"}>
					<ClineMarkdownContent content={history.outcome.text} />
				</HistoryBlock>
			) : null}
			<DoneCardHistoryFacts history={history} />
			<HistorySection label="Conversation" count={messageCount}>
				{history.runs.length === 0 ? (
					<p className="m-0 px-1 text-sm text-text-tertiary">No conversation was saved for this card.</p>
				) : (
					history.runs.map((run, index) => (
						<div key={`${index}-${run.startedAt ?? "unknown"}`} className="flex flex-col gap-2">
							{history.runs.length > 1 ? (
								<div className="border-b border-border pb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
									Run {index + 1}
									{run.startedAt !== null ? ` · ${formatHistoryTime(run.startedAt)}` : null}
								</div>
							) : null}
							{run.messages.map((message) => (
								<ClineChatMessageItem key={message.id} message={message} />
							))}
						</div>
					))
				)}
			</HistorySection>
			<HistorySection label="Card moves" count={history.movements.length}>
				<ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-text-secondary">
					{history.movements.map((movement, index) => (
						<li key={`${index}-${movement.at}-${movement.to}`}>
							{movement.from !== null
								? `${formatColumnName(movement.from)} → ${formatColumnName(movement.to)}`
								: index === 0
									? `Created in ${formatColumnName(movement.to)}`
									: // A card finished before the event log only knows that it ended in Done.
										`Moved to ${formatColumnName(movement.to)}`}
							<span className="text-text-tertiary"> · {formatHistoryTime(movement.at)}</span>
						</li>
					))}
				</ul>
			</HistorySection>
		</div>
	);
}

function HistoryBlock({ label, children }: { label: string; children: ReactNode }): ReactElement {
	return (
		<section className="rounded-md border border-border bg-surface-1 px-3 py-2.5 text-sm">
			<div className="mb-1 text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
			{children}
		</section>
	);
}

function HistorySection({
	label,
	count,
	children,
}: {
	label: string;
	count: number;
	children: ReactNode;
}): ReactElement {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
			<Collapsible.Trigger asChild>
				<button
					type="button"
					className="flex w-full cursor-pointer items-center gap-1 rounded-sm border-none bg-transparent px-1 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
				>
					{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
					<span>{label}</span>
					<span className="font-normal text-text-tertiary">{count}</span>
				</button>
			</Collapsible.Trigger>
			<Collapsible.Content className="flex flex-col gap-3 pt-2">{children}</Collapsible.Content>
		</Collapsible.Root>
	);
}
