import { cn } from "@/lib/utils";

/** One calm grey block that pulses (and stays still for people who ask for less motion). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} />;
}

/** The frame every loading screen shares: same width and padding as the real pages, so nothing jumps when data arrives. */
export function PageSkeleton({ children, narrow = false, label = "Loading" }: { children: React.ReactNode; narrow?: boolean; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} data-testid="page-skeleton" className={cn("mx-auto space-y-4 p-4 md:p-8", narrow ? "max-w-2xl" : "max-w-6xl")}>
      {children}
    </div>
  );
}

/** The two-tab strip under business and personal pages. */
export function SkeletonTabs() {
  return (
    <div className="flex gap-2">
      <Skeleton className="h-9 w-24 rounded-full" />
      <Skeleton className="h-9 w-24 rounded-full" />
    </div>
  );
}

/** A page title, a line under it and an action button on the right. */
export function SkeletonHeader({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      {action && <Skeleton className="h-10 w-28 rounded-lg" />}
    </div>
  );
}

/** A row of summary numbers. */
export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <div className={cn("grid gap-3 sm:gap-4", count === 4 ? "grid-cols-2 lg:grid-cols-4" : count === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A chart card. */
export function SkeletonChart({ height = "h-56" }: { height?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-1 h-3 w-28" />
      <Skeleton className={cn("mt-4 w-full rounded-lg", height)} />
    </div>
  );
}

/** A list of rows inside one card: title and detail on the left, an amount on the right. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-card shadow-sm">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A grid of cards, such as loyalty cards. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="aspect-[1.6] w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** A form: labelled fields and a button. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}
