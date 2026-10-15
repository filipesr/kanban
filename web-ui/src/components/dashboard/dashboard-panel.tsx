import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

/** A titled panel of the dashboard grid. */
export function DashboardPanel({
	title,
	description,
	className,
	children,
}: {
	title: string;
	description?: string;
	className?: string;
	children: ReactNode;
}): React.ReactElement {
	return (
		<section className={cn("min-w-0 rounded-lg border border-border bg-surface-1 p-3", className)}>
			<h3 className="text-[13px] font-semibold text-text-primary">{title}</h3>
			{description ? <p className="mt-0.5 text-xs text-text-tertiary">{description}</p> : null}
			<div className="mt-3">{children}</div>
		</section>
	);
}
