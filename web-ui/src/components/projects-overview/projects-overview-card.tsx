import { CircleAlert, CirclePause, Eye, Loader2, MessageCircleQuestion } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import type { RuntimeProjectsOverviewCard, RuntimeProjectsOverviewCardStatus } from "@/runtime/types";
import { formatCardDate, resolvePriorityTone, resolveVisibleTags } from "@/utils/card-attributes-display";
import { OVERVIEW_STATUS_LABEL, resolveProjectColor } from "@/utils/projects-overview";

const STATUS_PRESENTATION: Partial<Record<RuntimeProjectsOverviewCardStatus, { icon: ReactNode; className: string }>> =
	{
		running: { icon: <Loader2 size={12} className="animate-spin" />, className: "text-status-blue" },
		awaiting_answer: { icon: <MessageCircleQuestion size={12} />, className: "text-status-orange" },
		awaiting_review: { icon: <Eye size={12} />, className: "text-status-gold" },
		failed: { icon: <CircleAlert size={12} />, className: "text-status-red" },
		interrupted: { icon: <CirclePause size={12} />, className: "text-text-tertiary" },
	};

export function ProjectBadge({ projectId, name }: { projectId: string; name: string }): React.ReactElement {
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-text-secondary">
			<span
				aria-hidden
				className="size-2 shrink-0 rounded-full"
				style={{ backgroundColor: resolveProjectColor(projectId) }}
			/>
			<span className="truncate">{name}</span>
		</span>
	);
}

export function ProjectsOverviewCard({
	card,
	projectName,
	onOpen,
}: {
	card: RuntimeProjectsOverviewCard;
	projectName: string;
	onOpen: (card: RuntimeProjectsOverviewCard) => void;
}): React.ReactElement {
	const isDone = card.column === "trash";
	const isAsking = card.status === "awaiting_answer" && !isDone;
	const status = card.status ? STATUS_PRESENTATION[card.status] : undefined;
	const visibleTags = resolveVisibleTags(card.tags);
	const cardDate = formatCardDate(card.createdAt);

	return (
		<button
			type="button"
			data-overview-card={card.taskId}
			onClick={() => onOpen(card)}
			className={cn(
				"flex w-full shrink-0 cursor-pointer flex-col gap-1.5 rounded-md border bg-surface-2 p-2.5 text-left hover:bg-surface-3",
				"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
				isAsking ? "border-status-orange/60" : "border-border",
				isDone && "opacity-70",
			)}
		>
			<div className="flex items-center gap-1.5">
				<div className="min-w-0 flex-1">
					<ProjectBadge projectId={card.projectId} name={projectName} />
				</div>
				{cardDate ? <span className="shrink-0 text-[11px] text-text-tertiary">{cardDate}</span> : null}
			</div>
			<div className="line-clamp-2 text-[13px] font-medium text-text-primary">{card.title}</div>
			{card.priority || card.category || visibleTags.shown.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1">
					{card.priority ? (
						<span
							className={cn(
								"inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
								!isDone && resolvePriorityTone(card.priority) === "urgent"
									? "bg-status-orange/15 text-status-orange"
									: "bg-surface-3 text-text-tertiary",
							)}
						>
							{card.priority}
						</span>
					) : null}
					{card.category ? (
						<span className="inline-flex max-w-full items-center rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary">
							<span className="truncate">{card.category}</span>
						</span>
					) : null}
					{visibleTags.shown.map((tag) => (
						<span
							key={tag}
							className="inline-flex max-w-full items-center rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-text-secondary"
						>
							<span className="truncate">#{tag}</span>
						</span>
					))}
					{visibleTags.overflow > 0 ? (
						<span className="text-[11px] text-text-tertiary">+{visibleTags.overflow}</span>
					) : null}
				</div>
			) : null}
			{status && card.status && !isDone ? (
				<div className={cn("inline-flex items-center gap-1 text-[11px] font-medium", status.className)}>
					{status.icon}
					<span>{OVERVIEW_STATUS_LABEL[card.status]}</span>
				</div>
			) : null}
			{isAsking && card.pendingQuestion ? (
				<div className="line-clamp-4 whitespace-pre-line rounded border border-status-orange/30 bg-status-orange/10 px-2 py-1.5 text-[12px] text-text-primary">
					{card.pendingQuestion}
				</div>
			) : card.activityText && !isDone ? (
				<div className="line-clamp-2 text-[12px] text-text-tertiary">{card.activityText}</div>
			) : null}
		</button>
	);
}
