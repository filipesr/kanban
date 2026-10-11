import { NativeSelect } from "@/components/ui/native-select";
import type { RuntimeTaskPriority } from "@/runtime/types";
import type { CardAttributesDraft } from "@/utils/card-attributes-draft";

/**
 * The three attribute inputs, written once and used by both the create dialog and the card
 * detail panel. They take one draft and one setter rather than six props each: the dialog
 * already carries ninety, and three fields are not worth six more.
 */

const PRIORITY_OPTIONS: Array<{ value: RuntimeTaskPriority | ""; label: string }> = [
	{ value: "", label: "No priority" },
	{ value: "high", label: "High" },
	{ value: "medium", label: "Medium" },
	{ value: "low", label: "Low" },
];

const inputClassName =
	"h-7 rounded-md border border-border-bright bg-surface-2 px-2 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none";

export function CardAttributesFields({
	draft,
	onChange,
	disabled,
}: {
	draft: CardAttributesDraft;
	onChange: (next: CardAttributesDraft) => void;
	disabled?: boolean;
}): React.ReactElement {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<input
				aria-label="Tags"
				placeholder="tags, comma separated"
				value={draft.tags}
				disabled={disabled}
				onChange={(event) => onChange({ ...draft, tags: event.currentTarget.value })}
				className={inputClassName}
				style={{ width: "22ch", maxWidth: "100%" }}
			/>
			<input
				aria-label="Category"
				placeholder="category"
				value={draft.category}
				disabled={disabled}
				onChange={(event) => onChange({ ...draft, category: event.currentTarget.value })}
				className={inputClassName}
				style={{ width: "14ch", maxWidth: "100%" }}
			/>
			<NativeSelect
				aria-label="Priority"
				size="sm"
				value={draft.priority ?? ""}
				disabled={disabled}
				onChange={(event) =>
					onChange({
						...draft,
						// An empty choice means "no priority", which is a value in its own right: it
						// is how someone takes a priority back off a card.
						priority: (event.currentTarget.value || undefined) as RuntimeTaskPriority | undefined,
					})
				}
				style={{ width: "14ch", maxWidth: "100%" }}
			>
				{PRIORITY_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</NativeSelect>
		</div>
	);
}
