/**
 * Price watches: "tell me when this product gets cheaper". Pure functions (no database), unit-tested.
 * The morning check and the screens both decide with these, so a watch means the same thing everywhere.
 *
 * Two rules, both fixed when the watch is made so the words on the list never move:
 *  - below_last: cheaper than `target`, which is what was last paid
 *  - at_or_below: `target` or less, a price the person chose
 * A price is announced once. It can be announced again when it drops further, or after the price has gone back above the rule.
 */
import { round2 } from "@/lib/personal/money";
import type { Product } from "@/lib/personal/price-compare";

export type WatchRule = "below_last" | "at_or_below";
export type Watch = {
  id: string;
  product_key: string;
  name: string;
  currency: string;
  rule: WatchRule;
  target: number;
  paused: boolean;
  last_alert_price: number | null;
  last_alert_store: string | null;
};
export type OfferSource = "own" | "online" | "community";
export type WatchOffer = { store: string; price: number; source: OfferSource };

export const WATCH_COLS = "id, product_key, name, currency, rule, target, paused, last_alert_price, last_alert_store";
/** A drop smaller than this is the same price (money is kept to cents). */
const SAME_PRICE = 0.004;

/** One database row as a watch, or null when it is not usable. */
export function readWatch(row: Record<string, unknown> | null | undefined): Watch | null {
  if (!row) return null;
  const target = Number(row.target);
  const rule = row.rule === "at_or_below" ? "at_or_below" : row.rule === "below_last" ? "below_last" : null;
  if (typeof row.id !== "string" || typeof row.product_key !== "string" || typeof row.name !== "string" || !rule || !(target > 0)) return null;
  const last = row.last_alert_price == null ? null : Number(row.last_alert_price);
  return {
    id: row.id, product_key: row.product_key, name: row.name, currency: typeof row.currency === "string" && row.currency ? row.currency : "AWG",
    rule, target: round2(target), paused: row.paused === true,
    last_alert_price: last != null && Number.isFinite(last) ? round2(last) : null,
    last_alert_store: typeof row.last_alert_store === "string" ? row.last_alert_store : null,
  };
}

/** True when this price is what the watch waits for. */
export const ruleMet = (rule: WatchRule, target: number, price: number): boolean => (rule === "below_last" ? price < target : price <= target);

/** "Waiting for under AWG 3.99" / "Waiting for AWG 3.80 or less" */
export const ruleWords = (w: Pick<Watch, "rule" | "target">, fmt: (n: number) => string): string =>
  w.rule === "below_last" ? `Waiting for under ${fmt(w.target)}` : `Waiting for ${fmt(w.target)} or less`;

/** What was last paid for the product: the latest purchase, or the latest noted price when nothing was bought. Null with no price at all. */
export function lastPaid(p: Pick<Product, "history">): { price: number; store: string; date: string } | null {
  const bought = p.history.filter((e) => !e.noted);
  const pool = bought.length ? bought : p.history;
  let best: { price: number; store: string; date: string } | null = null;
  for (const e of pool) if (!best || e.date >= best.date) best = { price: e.price, store: e.store, date: e.date };
  return best;
}

/**
 * The prices the person has seen at their own stores, newest per store, without old ones. The last purchase is left out: a
 * product they just bought cheaper is not news to them.
 */
export function ownOffers(p: Pick<Product, "history" | "stores">): WatchOffer[] {
  const bought = p.history.filter((e) => !e.noted);
  const lastBought = bought.reduce<string | null>((d, e) => (d == null || e.date > d ? e.date : d), null);
  const out: WatchOffer[] = [];
  for (const s of p.stores) {
    if (s.stale) continue;
    if (!s.latest.noted && lastBought != null && s.latest.date === lastBought) continue;
    if (s.latest.price > 0) out.push({ store: s.store, price: s.latest.price, source: "own" });
  }
  return out;
}

/** The lowest price on offer (a tie goes to the store named first alphabetically, so the same data always gives the same answer). */
export function cheapest(offers: WatchOffer[]): WatchOffer | null {
  let best: WatchOffer | null = null;
  for (const o of offers) {
    if (!(o.price > 0)) continue;
    if (!best || o.price < best.price - SAME_PRICE || (Math.abs(o.price - best.price) <= SAME_PRICE && o.store.localeCompare(best.store) < 0)) best = o;
  }
  return best;
}

export type WatchDecision = { action: "alert"; offer: WatchOffer } | { action: "reset" } | { action: "none"; offer: WatchOffer | null };

/**
 * What the morning check does for one watch:
 *  - alert: the rule is met and this price has not been announced yet (or is lower than the one that was)
 *  - reset: the rule is not met any more, so the next time it is met the person hears about it again
 *  - none: nothing to say. With no offers at all nothing changes: missing data must never reset a watch.
 */
export function decide(w: Watch, offers: WatchOffer[]): WatchDecision {
  const best = cheapest(offers.filter((o) => Number.isFinite(o.price)));
  if (!best) return { action: "none", offer: null };
  if (!ruleMet(w.rule, w.target, best.price)) return w.last_alert_price != null ? { action: "reset" } : { action: "none", offer: best };
  if (w.last_alert_price == null || best.price < w.last_alert_price - SAME_PRICE) return { action: "alert", offer: best };
  return { action: "none", offer: best };
}

/** The facts for the phone message: one product by name and store, or just how many. Never an amount. */
export function hitsMessage(hits: { name: string; store: string }[]): { item?: string; label?: string; count: number } {
  if (hits.length === 1) return { item: hits[0].name, label: hits[0].store, count: 1 };
  return { count: hits.length };
}
