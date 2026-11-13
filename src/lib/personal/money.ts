/** Converting between the two currencies Personal totals are shown in. AWG is pegged: 1 USD = 1.79 AWG. */
import { AWG_PER_USD } from "@/lib/personal/dashboard";

export type BudgetCurrency = "AWG" | "USD";
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Between AWG and USD only; any other currency has to come with its USD amount. Null when it cannot be converted. */
export function convert(amount: number, from: string, to: BudgetCurrency, usd?: number | null): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  let inUsd: number | null = null;
  if (from === "USD") inUsd = amount;
  else if (from === "AWG") inUsd = amount / AWG_PER_USD;
  else if (usd != null && Number.isFinite(usd)) inUsd = usd;
  if (inUsd == null) return null;
  return to === "USD" ? inUsd : inUsd * AWG_PER_USD;
}

/** The currency to show a set of amounts in: AWG or USD, whichever more entries use (a tie, or neither, gives AWG). */
export function dominantCurrency(rows: { currency: string }[] | null | undefined): BudgetCurrency {
  const list = rows ?? [];
  const usd = list.filter((r) => r.currency === "USD").length, awg = list.filter((r) => r.currency === "AWG").length;
  return usd > awg ? "USD" : "AWG";
}

/** How many entries are in the other currency from `to`, for the small "converted at the fixed rate" note. */
export function convertedCount(rows: { currency: string }[] | null | undefined, to: BudgetCurrency): number {
  return (rows ?? []).filter((r) => (r.currency === "AWG" || r.currency === "USD") && r.currency !== to).length;
}
