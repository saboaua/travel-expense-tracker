import { cn } from "@/lib/utils";

/**
 * The only two page widths on a desktop, so a page cannot pick its own:
 * wide (lists, dashboards, the trip page) and form (Profile, Settings, Checklist). Under 768px both are the full width.
 */
export const PAGE_WIDTH = {
  wide: "mx-auto w-full max-w-6xl",
  form: "mx-auto w-full max-w-4xl",
  /** A form that is one column: the same form width, with the content kept to a readable 672 px at the left edge. */
  formColumn: "mx-auto w-full max-w-4xl [&>*]:max-w-2xl",
} as const;

export type PageSize = "wide" | "form";

export function PageShell({ size, className, children }: { size: PageSize; className?: string; children: React.ReactNode }) {
  return <div className={cn(PAGE_WIDTH[size], "space-y-6 p-4 md:p-8", className)}>{children}</div>;
}
