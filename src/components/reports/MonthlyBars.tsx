import { MONTH_SHORT } from "@/lib/reports";

/** 12-month bar chart in plain markup (no chart library): fast, accessible and print friendly. */
export function MonthlyBars({
  values,
  focusIndex,
  fmt,
  futureFrom,
}: {
  values: number[];
  focusIndex: number;
  fmt: (n: number) => string;
  /** Months at or after this index are in the future (drawn dashed) */
  futureFrom?: number;
}) {
  const max = Math.max(...values, 0);
  return (
    <div>
      <div className="flex h-44 items-end gap-1.5 sm:gap-2" role="img" aria-label="Spending by month">
        {values.map((v, i) => {
          const future = futureFrom != null && i >= futureFrom;
          const h = max > 0 ? Math.max((v / max) * 100, v > 0 ? 3 : 0) : 0;
          return (
            <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`${MONTH_SHORT[i]}: ${fmt(v)}`}>
              {v > 0 && (
                <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background group-hover:block">
                  {fmt(v)}
                </span>
              )}
              {v > 0 ? (
                <div
                  className={`w-full rounded-t-md transition-opacity group-hover:opacity-80 ${i === focusIndex ? "bg-primary" : "bg-primary/35"}`}
                  style={{ height: `${h}%` }}
                />
              ) : (
                <div className={`w-full rounded-t-sm border-t-2 ${future ? "border-dashed border-muted" : "border-muted"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {MONTH_SHORT.map((m, i) => (
          <span key={m} className={`flex-1 text-center text-[10px] sm:text-xs ${i === focusIndex ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            <span className="sm:hidden">{m[0]}</span>
            <span className="hidden sm:inline">{m}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
