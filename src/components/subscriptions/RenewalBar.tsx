import { cn } from "@/lib/utils";
import { renewalProgress, type Sub } from "@/lib/subscriptions";

/** The bar that fills until the renewal: green while far, amber inside a week, red inside three days. */
export function RenewalBar({ s, today }: { s: Sub; today: string }) {
  const p = renewalProgress(s, today);
  if (!p) return null;
  const tone = p.daysLeft <= 3 ? "bg-red-600" : p.daysLeft <= 7 ? "bg-amber-500" : "bg-primary";
  const text = p.daysLeft === 0 ? "Renews today" : p.daysLeft === 1 ? "Renews tomorrow" : `${p.daysLeft} days to renewal`;
  return (
    <span className="mt-1.5 block" data-testid="renewal-bar">
      <span role="progressbar" aria-label={`${s.name}: ${text}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} className="block h-2 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(p.pct, 3)}%` }} />
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
    </span>
  );
}
