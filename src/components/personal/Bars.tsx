import { Money } from "@/components/ui/money";

/** Simple horizontal bar list (no chart library needed). Each amount is shown in the one amount style. */
export function Bars({
  rows,
  currency,
}: {
  rows: { label: string; value: number }[];
  currency: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="truncate pr-2">{r.label}</span>
            <span className="shrink-0 text-sm"><Money amount={r.value} currency={currency} /></span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
