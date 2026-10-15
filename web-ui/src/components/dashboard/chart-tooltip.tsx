export interface ChartTooltipRow {
	label: string;
	/** Omitted for a detail row that belongs to no series. */
	color?: string;
	value: string;
}

/**
 * The hover card every dashboard chart shares. Values are in text ink; the colored swatch beside
 * each one carries the series identity.
 */
export function ChartTooltip({ title, rows }: { title: string; rows: ChartTooltipRow[] }): React.ReactElement {
	return (
		<div className="rounded-md border border-border-bright bg-surface-2 px-2.5 py-2 text-xs shadow-lg">
			<p className="mb-1 font-medium text-text-primary">{title}</p>
			{rows.map((row) => (
				<div key={row.label} className="flex items-center gap-2 text-text-secondary">
					<span
						className="h-2 w-2 shrink-0 rounded-sm"
						style={row.color ? { backgroundColor: row.color } : undefined}
					/>
					<span className="flex-1">{row.label}</span>
					<span className="font-medium tabular-nums text-text-primary">{row.value}</span>
				</div>
			))}
		</div>
	);
}

/** The legend under a multi-series chart: identity never rests on color alone. */
export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }): React.ReactElement {
	return (
		<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
			{items.map((item) => (
				<li key={item.label} className="flex items-center gap-1.5">
					<span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
					{item.label}
				</li>
			))}
		</ul>
	);
}

/** The datum under the pointer, from the index Recharts reports (a string, or nothing). */
export function datumAt<T>(data: readonly T[], activeIndex: unknown): T | null {
	const index = typeof activeIndex === "number" ? activeIndex : Number(activeIndex);
	return activeIndex === null || activeIndex === undefined || !Number.isInteger(index) ? null : (data[index] ?? null);
}
