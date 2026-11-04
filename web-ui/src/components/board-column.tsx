import { Droppable } from "@hello-pangea/dnd";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Plus, Trash2 } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { BoardCard } from "@/components/board-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ColumnIndicator } from "@/components/ui/column-indicator";
import type { RuntimeTaskSessionSummary } from "@/runtime/types";
import { isCardDropDisabled, type ProgrammaticCardMoveInFlight } from "@/state/drag-rules";
import type { BoardCard as BoardCardModel, BoardColumnId, BoardColumn as BoardColumnModel } from "@/types";

export function BoardColumn({
	column,
	taskSessions,
	onCreateTask,
	onStartTask,
	onStartAllTasks,
	onClearTrash,
	onEditTask,
	onSaveTitle,
	onCommitTask,
	onOpenPrTask,
	onCancelAutomaticTaskAction,
	onMoveToTrashTask,
	onRestoreFromTrashTask,
	commitTaskLoadingById,
	openPrTaskLoadingById,
	moveToTrashLoadingById,
	onCardClick,
	activeDragTaskId,
	activeDragSourceColumnId,
	programmaticCardMoveInFlight,
	onDependencyPointerDown,
	onDependencyPointerEnter,
	dependencySourceTaskId,
	dependencyTargetTaskId,
	isDependencyLinking,
	workspacePath,
	defaultClineModelId,
	isCollapsed = false,
	onCollapsedChange,
}: {
	column: BoardColumnModel;
	taskSessions: Record<string, RuntimeTaskSessionSummary>;
	onCreateTask?: () => void;
	onStartTask?: (taskId: string) => void;
	onStartAllTasks?: () => void;
	onClearTrash?: () => void;
	onEditTask?: (card: BoardCardModel) => void;
	onSaveTitle?: (taskId: string, title: string) => void;
	onCommitTask?: (taskId: string) => void;
	onOpenPrTask?: (taskId: string) => void;
	onCancelAutomaticTaskAction?: (taskId: string) => void;
	onMoveToTrashTask?: (taskId: string) => void;
	onRestoreFromTrashTask?: (taskId: string) => void;
	commitTaskLoadingById?: Record<string, boolean>;
	openPrTaskLoadingById?: Record<string, boolean>;
	moveToTrashLoadingById?: Record<string, boolean>;
	onCardClick?: (card: BoardCardModel) => void;
	activeDragTaskId?: string | null;
	activeDragSourceColumnId?: BoardColumnId | null;
	programmaticCardMoveInFlight?: ProgrammaticCardMoveInFlight | null;
	onDependencyPointerDown?: (taskId: string, event: ReactMouseEvent<HTMLElement>) => void;
	onDependencyPointerEnter?: (taskId: string) => void;
	dependencySourceTaskId?: string | null;
	dependencyTargetTaskId?: string | null;
	isDependencyLinking?: boolean;
	workspacePath?: string | null;
	defaultClineModelId?: string | null;
	isCollapsed?: boolean;
	/** Makes the column collapsible: it folds into a narrow strip that still takes dropped cards. */
	onCollapsedChange?: (collapsed: boolean) => void;
}): React.ReactElement {
	const canCreate = column.id === "backlog" && onCreateTask;
	const canStartAllTasks = column.id === "backlog" && onStartAllTasks;
	const canClearTrash = column.id === "trash" && onClearTrash;
	const cardDropType = "CARD";
	const isDropDisabled = isCardDropDisabled(column.id, activeDragSourceColumnId ?? null, {
		activeDragTaskId,
		programmaticCardMoveInFlight,
	});
	const collapseSide = column.id === "trash" ? "right" : "left";

	if (onCollapsedChange && isCollapsed) {
		return (
			<CollapsedBoardColumn
				column={column}
				cardDropType={cardDropType}
				isDropDisabled={isDropDisabled}
				collapseSide={collapseSide}
				onExpand={() => onCollapsedChange(false)}
			/>
		);
	}

	const createTaskButtonText = (
		<span className="inline-flex items-center gap-1.5">
			<span>Create task</span>
			<span aria-hidden className="text-text-secondary">
				(c)
			</span>
		</span>
	);

	return (
		<section
			data-column-id={column.id}
			className="flex flex-col min-w-0 min-h-0 bg-surface-1 rounded-lg overflow-hidden border border-border"
			style={{
				flex: "1 1 0",
			}}
		>
			<div className="flex flex-col min-h-0" style={{ flex: "1 1 0" }}>
				<div
					className="flex items-center justify-between"
					style={{
						height: 40,
						padding: "0 12px",
					}}
				>
					<div className="flex items-center gap-2">
						<ColumnIndicator columnId={column.id} />
						<span className="font-semibold text-sm">{column.title}</span>
						<span className="text-text-secondary text-xs">{column.cards.length}</span>
					</div>
					<div className="flex items-center gap-0.5">
						{canStartAllTasks ? (
							<Button
								icon={<Play size={14} />}
								variant="ghost"
								size="sm"
								onClick={onStartAllTasks}
								disabled={column.cards.length === 0}
								aria-label="Start all backlog tasks"
								title={column.cards.length > 0 ? "Start all backlog tasks" : "Backlog is empty"}
							/>
						) : null}
						{canClearTrash ? (
							<Button
								icon={<Trash2 size={14} />}
								variant="ghost"
								size="sm"
								className="text-status-red hover:text-status-red"
								onClick={onClearTrash}
								disabled={column.cards.length === 0}
								aria-label="Clear done"
								title={column.cards.length > 0 ? "Clear done items permanently" : "Done is empty"}
							/>
						) : null}
						{onCollapsedChange ? (
							<Button
								icon={collapseSide === "right" ? <PanelRightClose size={14} /> : <PanelLeftClose size={14} />}
								variant="ghost"
								size="sm"
								onClick={() => onCollapsedChange(true)}
								aria-label={`Collapse ${column.title}`}
								title={`Collapse ${column.title}`}
							/>
						) : null}
					</div>
				</div>

				<Droppable droppableId={column.id} type={cardDropType} isDropDisabled={isDropDisabled}>
					{(cardProvided) => (
						<div ref={cardProvided.innerRef} {...cardProvided.droppableProps} className="kb-column-cards">
							{canCreate ? (
								<Button
									icon={<Plus size={14} />}
									aria-label="Create task"
									fill
									onClick={onCreateTask}
									style={{ marginBottom: 6, flexShrink: 0 }}
								>
									{createTaskButtonText}
								</Button>
							) : null}

							{column.cards.map((card, index) => (
								<BoardCard
									key={card.id}
									card={card}
									index={index}
									columnId={column.id}
									sessionSummary={taskSessions[card.id]}
									onStart={onStartTask}
									onMoveToTrash={onMoveToTrashTask}
									onRestoreFromTrash={onRestoreFromTrashTask}
									onCommit={onCommitTask}
									onOpenPr={onOpenPrTask}
									onCancelAutomaticAction={onCancelAutomaticTaskAction}
									isCommitLoading={commitTaskLoadingById?.[card.id] ?? false}
									isOpenPrLoading={openPrTaskLoadingById?.[card.id] ?? false}
									isMoveToTrashLoading={moveToTrashLoadingById?.[card.id] ?? false}
									onDependencyPointerDown={onDependencyPointerDown}
									onDependencyPointerEnter={onDependencyPointerEnter}
									isDependencySource={dependencySourceTaskId === card.id}
									isDependencyTarget={dependencyTargetTaskId === card.id}
									isDependencyLinking={isDependencyLinking}
									workspacePath={workspacePath}
									defaultClineModelId={defaultClineModelId}
									onSaveTitle={onSaveTitle}
									onClick={() => {
										if (column.id === "backlog") {
											onEditTask?.(card);
											return;
										}
										onCardClick?.(card);
									}}
								/>
							))}
							{cardProvided.placeholder}
						</div>
					)}
				</Droppable>
			</div>
		</section>
	);
}

function CollapsedBoardColumn({
	column,
	cardDropType,
	isDropDisabled,
	collapseSide,
	onExpand,
}: {
	column: BoardColumnModel;
	cardDropType: string;
	isDropDisabled: boolean;
	collapseSide: "left" | "right";
	onExpand: () => void;
}): React.ReactElement {
	return (
		<section
			data-column-id={column.id}
			data-collapsed="true"
			className="flex flex-col shrink-0 w-10 min-h-0 bg-surface-1 rounded-lg overflow-hidden border border-border"
		>
			{/* Still a drop target, so a card can be dragged into the column without unfolding it. */}
			<Droppable droppableId={column.id} type={cardDropType} isDropDisabled={isDropDisabled}>
				{(cardProvided, snapshot) => (
					<div
						ref={cardProvided.innerRef}
						{...cardProvided.droppableProps}
						className={cn("flex flex-1 min-h-0 flex-col", snapshot.isDraggingOver && "bg-surface-3")}
					>
						<button
							type="button"
							onClick={onExpand}
							aria-label={`Expand ${column.title}`}
							title={`Expand ${column.title}`}
							className="flex flex-1 min-h-0 cursor-pointer flex-col items-center gap-2 border-none bg-transparent py-3 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
						>
							{collapseSide === "right" ? <PanelRightOpen size={14} /> : <PanelLeftOpen size={14} />}
							<ColumnIndicator columnId={column.id} />
							<span className="text-xs">{column.cards.length}</span>
							<span className="font-semibold text-sm text-text-primary [writing-mode:vertical-rl]">
								{column.title}
							</span>
						</button>
						<div className="h-0 overflow-hidden">{cardProvided.placeholder}</div>
					</div>
				)}
			</Droppable>
		</section>
	);
}
