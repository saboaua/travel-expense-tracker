/** Things bought online (Amazon, AliExpress, eBay…): which site, when it arrives, and what was spent by site. */
export const ONLINE_SITES = [
  { id: "amazon", label: "Amazon", color: "#f59e0b" },
  { id: "aliexpress", label: "AliExpress", color: "#ef4444" },
  { id: "ebay", label: "eBay", color: "#2563eb" },
  { id: "other", label: "Other", color: "#94a3b8" },
] as const;
export type OnlineSite = (typeof ONLINE_SITES)[number]["id"];

/** A saved value cleaned up; anything unknown is not online */
export const asSite = (v: string | null | undefined): OnlineSite | null => {
  const s = (v ?? "").trim().toLowerCase();
  return ONLINE_SITES.some((x) => x.id === s) ? (s as OnlineSite) : null;
};
export const siteLabel = (v: string | null | undefined): string => ONLINE_SITES.find((x) => x.id === asSite(v))?.label ?? "";
export const siteColor = (v: string | null | undefined): string => ONLINE_SITES.find((x) => x.id === asSite(v))?.color ?? "#94a3b8";

export type OnlineOrder = { id: string; store: string; purchase_date: string; total: number; currency: string; online_site?: string | null; arrives_on?: string | null };

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
/** Whole days from `today` to `iso` (negative when past) */
export const daysUntil = (iso: string, today: string): number => Math.round((day(iso) - day(today)) / 86400000);

/** Orders that have not arrived yet, soonest first */
export function onItsWay(rows: OnlineOrder[], today: string): (OnlineOrder & { days: number })[] {
  return rows
    .filter((r) => asSite(r.online_site) && r.arrives_on && r.arrives_on >= today)
    .map((r) => ({ ...r, days: daysUntil(r.arrives_on as string, today) }))
    .sort((a, b) => a.days - b.days);
}
export const arrivesText = (days: number): string => (days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`);

export type SiteTotal = { site: OnlineSite; total: number; orders: number };
/** Spent online in one month (YYYY-MM) in one currency, by site, largest first. Refunds are negative totals and count as they are. */
export function monthBySite(rows: OnlineOrder[], month: string, currency: string): { total: number; orders: number; sites: SiteTotal[] } {
  const by = new Map<OnlineSite, SiteTotal>();
  let total = 0, orders = 0;
  for (const r of rows) {
    const s = asSite(r.online_site);
    if (!s || r.currency !== currency || !r.purchase_date.startsWith(month)) continue;
    const t = Number(r.total) || 0;
    const cur = by.get(s) ?? { site: s, total: 0, orders: 0 };
    cur.total = Math.round((cur.total + t) * 100) / 100; cur.orders += 1;
    by.set(s, cur); total += t; orders += 1;
  }
  return { total: Math.round(total * 100) / 100, orders, sites: [...by.values()].sort((a, b) => b.total - a.total) };
}
/** The currency most used in that month's online orders */
export function mainCurrency(rows: OnlineOrder[], month: string): string | null {
  const n = new Map<string, number>();
  for (const r of rows) if (asSite(r.online_site) && r.purchase_date.startsWith(month)) n.set(r.currency, (n.get(r.currency) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The payment type a forwarded online order starts with. Credit card unless the person chose another. */
export const DEFAULT_ONLINE_PAID = "credit" as const;
export const onlinePaid = (v: unknown): "cash" | "debit" | "credit" => (v === "cash" || v === "debit" || v === "credit" ? v : DEFAULT_ONLINE_PAID);
