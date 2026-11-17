import { priceGlance } from "../src/lib/personal/prices-glance";
import type { TrackerRow } from "../src/lib/personal/grocery";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const now = new Date("2026-11-17T12:00:00Z");
const row = (name: string, store: string, price: number, date: string): TrackerRow => ({
  name, normalized_name: name.toLowerCase(), category: "Food", unit_price: price, quantity: 1, unit: null, line_total: price,
  receipt: { store, purchase_date: date, currency: "AWG" },
});

eq(priceGlance([], [], [], now), { tracker: null, best: null }, "no receipts: nothing to show");

const rows = [
  row("Milk 1L", "Super Food", 3.49, "2026-10-01"), row("Milk 1L", "Super Food", 3.79, "2026-11-10"),
  row("Eggs 12", "Cost-U-Less", 7.2, "2026-10-02"), row("Eggs 12", "Cost-U-Less", 6.45, "2026-11-11"),
  row("Rice 2kg", "Ling", 5.9, "2026-11-05"), row("Rice 2kg", "Super Food", 7.1, "2026-11-12"),
];
const g = priceGlance(rows, [], [], now);
eq([g.tracker?.currency, g.tracker?.items, g.tracker?.up, g.tracker?.down], ["AWG", 3, 1, 1], "counts what went up and what got cheaper, in the main currency");
eq([g.tracker?.riser?.name, g.tracker?.riser?.pct, g.tracker?.faller?.name, g.tracker?.faller?.pct], ["Milk 1 L", 9, "Eggs 12", 10], "the biggest riser and faller are named with their percent");
eq((g.tracker?.saveTotal ?? 0) > 0, true, "rice is cheaper at the other store: a saving is counted");
eq(g.best, null, "no shopping list: no best store");

const list = [{ product_key: "x", qty: 1 }];
eq(priceGlance(rows, [], list, now).best, null, "a list item that is not a tracked product is ignored");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("prices-glance: all checks passed");
