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
