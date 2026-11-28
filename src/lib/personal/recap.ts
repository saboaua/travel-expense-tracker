/**
 * The monthly recap: what a finished month looked like, in a few lines. Pure functions (no database), unit-tested.
 * The card on Personal and the full-month page show these lines; the phone message only says under or over budget and
 * never carries an amount.
 */
import { round2 } from "@/lib/personal/money";
import { sameStore } from "@/lib/personal/basket";
import type { Product } from "@/lib/personal/price-compare";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The card is shown on the first days of the new month. A close hides it for a week, so it can never come back inside this window. */
export const RECAP_DAYS = 7;
/** A category only counts as "changed" with at least this much last month, a move of this many percent and this much money. */
export const CHANGE_MIN_BASE = 50;
export const CHANGE_MIN_PCT = 10;
export const CHANGE_MIN_MONEY = 25;
/** A saving smaller than this is not worth a line. */
export const SAVING_MIN = 5;

/** "2026-11-27" -> "2026-11-01" */
export const monthOf = (day: string) => `${day.slice(0, 7)}-01`;

/** "2026-01-01" -> "2025-12-01" */
export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

/** The last day of a month ("2026-02-01" -> "2026-02-28"). */
export function monthEnd(month: string): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return `${month.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** "2026-10-01" -> "October" */
export const monthName = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? "";

/** The month the recap on this day is about: the one that just ended. */
export const recapMonth = (today: string) => previousMonth(monthOf(today));

/** True on the first RECAP_DAYS days of a month. */
export const inRecapWindow = (today: string) => Number(today.slice(8, 10)) <= RECAP_DAYS;

export type AreaAmount = [string, number];
export type Saving = { amount: number; items: number };
export type Change = { area: string; thisMonth: number; lastMonth: number; pct: number; up: boolean };
export type RecapState = "under" | "over" | "none";
export type Recap = {
  month: string;
  label: string;
  currency: string;
  spent: number;
  /** The budget that counted for the month, or null when there was none */
  budget: number | null;
  state: RecapState;
  /** How far under or over the budget (0 with no budget) */
  gap: number;
  /** Share of the budget used, 0 to 100 (0 with no budget) */
  usedPct: number;
  change: Change | null;
  saving: Saving | null;
  /** Every area with spending, biggest first */
  areas: AreaAmount[];
};

export const totalOf = (areas: Record<string, number | undefined>): number => round2(Object.values(areas).reduce<number>((t, v) => t + (v ?? 0), 0));

export function recapState(spent: number, budget: number | null): RecapState {
  if (budget == null || !(budget > 0)) return "none";
  return spent > budget ? "over" : "under";
}

/** The area that moved the most against the month before, when the move is big enough to mention. */
export function biggestChange(areas: AreaAmount[], last: AreaAmount[]): Change | null {
  const now = new Map(areas), before = new Map(last);
  let best: Change | null = null;
  for (const name of new Set([...now.keys(), ...before.keys()])) {
    const a = now.get(name) ?? 0, b = before.get(name) ?? 0;
    if (b < CHANGE_MIN_BASE) continue;
    const delta = a - b;
    const pct = Math.round((delta / b) * 100);
    if (Math.abs(delta) < CHANGE_MIN_MONEY || Math.abs(pct) < CHANGE_MIN_PCT) continue;
    if (!best || Math.abs(delta) > Math.abs(best.thisMonth - best.lastMonth)) best = { area: name, thisMonth: round2(a), lastMonth: round2(b), pct, up: delta > 0 };
  }
  return best;
}

/**
 * What the month's purchases would have cost if each had been bought where you have seen it cheaper (at a store you have
 * shopped at, with the price you saw by the end of that month). An estimate, so it only counts bought items, not price notes.
 */
export function couldHaveSaved(products: Product[], month: string, currency: string): Saving | null {
  const ym = month.slice(0, 7);
  let amount = 0, items = 0;
  for (const p of products) {
    if (p.currency !== currency) continue;
    const cheap = p.stores.find((s) => s.cheapest && !s.stale);
    if (!cheap) continue;
    let itemSaving = 0;
    for (const e of p.history) {
      if (e.noted || e.date.slice(0, 7) !== ym || sameStore(e.store, cheap.store)) continue;
      const diff = e.price - cheap.latest.price;
      if (diff > 0) itemSaving += diff * (e.qty > 0 ? e.qty : 1);
    }
    if (itemSaving > 0) { amount += itemSaving; items++; }
  }
  amount = round2(amount);
  return items > 0 && amount >= SAVING_MIN ? { amount, items } : null;
}

/** Puts the month together. Null when nothing was spent: there is nothing to recap. */
export function buildRecap(i: { month: string; currency: string; spent: number; budget: number | null; areas: AreaAmount[]; lastAreas: AreaAmount[]; saving: Saving | null }): Recap | null {
  const areas = i.areas.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!(i.spent > 0) && areas.length === 0) return null;
  const budget = i.budget != null && i.budget > 0 ? i.budget : null;
  const state = recapState(i.spent, budget);
  return {
    month: i.month, label: monthName(i.month), currency: i.currency,
    spent: round2(i.spent), budget, state,
    gap: budget == null ? 0 : round2(Math.abs(budget - i.spent)),
    usedPct: budget == null ? 0 : Math.min(100, Math.round((i.spent / budget) * 100)),
    change: biggestChange(areas, i.lastAreas),
    saving: i.saving,
    areas,
  };
}
