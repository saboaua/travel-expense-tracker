import type { CategorySlice } from "@/lib/reports";

export const SLICE_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"];

/** Donut + legend with percentages. Pure SVG, stroke segments on a circle of circumference 100. */
export function CategoryDonut({ slices, total, fmt }: { slices: CategorySlice[]; total: number; fmt: (n: number) => string }) {
  if (slices.length === 0) return <p className="text-sm text-muted-foreground">No spending in this period.</p>;

  let offset = 25; // start at 12 o'clock
  const R = 15.91549430918954;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-0" role="img" aria-label="Spending by category">
          <circle cx="21" cy="21" r={R} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
          {slices.map((s, i) => {
            const len = Math.max(s.pct, 0);
            const el = (
              <circle
                key={s.category}
                cx="21"
                cy="21"
                r={R}
                fill="none"
                stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
                strokeWidth="5"
                strokeDasharray={`${Math.max(len - 0.6, 0)} ${100 - Math.max(len - 0.6, 0)}`}
                strokeDashoffset={offset}
              />
            );
            offset -= len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-bold leading-tight">{fmt(total)}</span>
          <span className="text-xs text-muted-foreground">total</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {slices.map((s, i) => (
          <li key={s.category} className="flex items-center gap-3 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{s.category}</span>
            <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">{s.pct}%</span>
            <span className="w-24 shrink-0 text-right font-medium tabular-nums">{fmt(s.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
