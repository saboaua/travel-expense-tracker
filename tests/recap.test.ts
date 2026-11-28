import { RECAP_DAYS, SAVING_MIN, biggestChange, buildRecap, couldHaveSaved, inRecapWindow, monthEnd, monthName, monthOf, previousMonth, recapMonth, recapState, totalOf } from "../src/lib/personal/recap";
import { buildProducts } from "../src/lib/personal/price-compare";
import type { TrackerRow } from "../src/lib/personal/grocery";
import { pushMessage } from "../src/lib/push-text";
import { PUSH_PREF_KEYS, DEFAULT_PUSH_PREFS } from "../src/lib/push-prefs";
import { normalizeKinds } from "../src/lib/telegram-kinds";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// months
eq("monthOf", monthOf("2026-11-27"), "2026-11-01");
eq("previousMonth", previousMonth("2026-11-01"), "2026-10-01");
eq("previousMonth across the year", previousMonth("2026-01-01"), "2025-12-01");
eq("monthEnd", monthEnd("2026-10-01"), "2026-10-31");
eq("monthEnd leap year", monthEnd("2028-02-01"), "2028-02-29");
eq("monthEnd not a leap year", monthEnd("2026-02-01"), "2026-02-28");
eq("monthName", monthName("2026-10-01"), "October");
eq("recapMonth is the month that ended", recapMonth("2026-11-03"), "2026-10-01");
eq("recapMonth in January", recapMonth("2027-01-02"), "2026-12-01");
eq("window on the 1st", inRecapWindow("2026-11-01"), true);
eq("window on the last day", inRecapWindow(`2026-11-0${RECAP_DAYS}`), true);
eq("window closed after", inRecapWindow("2026-11-08"), false);
eq("window closed mid month", inRecapWindow("2026-11-27"), false);

// under or over
eq("state: under", recapState(2115, 2400), "under");
eq("state: exactly on budget is under", recapState(2400, 2400), "under");
eq("state: over", recapState(2500, 2400), "over");
eq("state: no budget", recapState(500, null), "none");
eq("state: zero budget counts as none", recapState(500, 0), "none");
eq("totalOf adds every area", totalOf({ groceries: 10.1, fuel: 5.2, house: undefined }), 15.3);

// biggest change
eq("change: groceries up 12%", biggestChange([["Groceries", 612], ["Fuel", 100]], [["Groceries", 546], ["Fuel", 100]]), { area: "Groceries", thisMonth: 612, lastMonth: 546, pct: 12, up: true });
eq("change: down", biggestChange([["Fuel", 60]], [["Fuel", 100]])?.up, false);
eq("change: small percent is skipped", biggestChange([["Groceries", 1050]], [["Groceries", 1000]]), null);
eq("change: small money is skipped", biggestChange([["Quick spend", 70]], [["Quick spend", 55]]), null);
eq("change: tiny base is skipped", biggestChange([["Fuel", 200]], [["Fuel", 20]]), null);
eq("change: biggest move in money wins", biggestChange([["A", 200], ["B", 450]], [["A", 100], ["B", 300]])?.area, "B");
eq("change: an area that disappeared counts", biggestChange([], [["Fuel", 100]])?.pct, -100);

// buildRecap
const base = { month: "2026-10-01", currency: "AWG", lastAreas: [] as [string, number][], saving: null };
eq("recap: nothing spent", buildRecap({ ...base, spent: 0, budget: 2400, areas: [] }), null);
const under = buildRecap({ ...base, spent: 2115, budget: 2400, areas: [["Fuel", 100], ["Groceries", 612]] })!;
eq("recap: under budget", [under.state, under.gap, under.usedPct, under.label], ["under", 285, 88, "October"]);
eq("recap: areas biggest first", under.areas.map((a) => a[0]), ["Groceries", "Fuel"]);
const over = buildRecap({ ...base, spent: 2600, budget: 2400, areas: [["Groceries", 2600]] })!;
eq("recap: over budget caps the bar", [over.state, over.gap, over.usedPct], ["over", 200, 100]);
const none = buildRecap({ ...base, spent: 500, budget: null, areas: [["Groceries", 500]] })!;
eq("recap: no budget", [none.state, none.budget, none.gap, none.usedPct], ["none", null, 0, 0]);
eq("recap: zero areas dropped", buildRecap({ ...base, spent: 5, budget: null, areas: [["Fuel", 0], ["Groceries", 5]] })!.areas, [["Groceries", 5]]);

// could have saved: built the same way the Price tracker builds products
const row = (store: string, date: string, price: number, qty: number, name = "Milk 1L", noted = false): TrackerRow => ({ name, normalized_name: name.toLowerCase(), category: "Dairy", unit_price: price, quantity: qty, line_total: price * qty, noted, receipt: { store, purchase_date: date, currency: "AWG" } });
const products = (rows: TrackerRow[]) => buildProducts(rows, []).products;
const milk = [row("Super Food", "2026-10-05", 12, 2), row("Ling", "2026-10-20", 8, 1)];
eq("saving: bought at the dearer store", couldHaveSaved(products(milk), "2026-10-01", "AWG"), { amount: 8, items: 1 });
eq("saving: another month is not counted", couldHaveSaved(products(milk), "2026-09-01", "AWG"), null);
eq("saving: bought at the cheapest store", couldHaveSaved(products([row("Ling", "2026-10-20", 8, 1), row("Super Food", "2026-09-05", 12, 1)]), "2026-10-01", "AWG"), null);
eq("saving: a noted price is not a purchase", couldHaveSaved(products([row("Super Food", "2026-10-05", 12, 2, "Milk 1L", true), row("Ling", "2026-10-20", 8, 1)]), "2026-10-01", "AWG"), null);
eq("saving: other currency is left out", couldHaveSaved(products(milk), "2026-10-01", "USD"), null);
eq("saving: below the minimum is not worth a line", couldHaveSaved(products([row("Super Food", "2026-10-05", 8.5, 1), row("Ling", "2026-10-20", 8, 1)]), "2026-10-01", "AWG"), null);
eq("saving: minimum is sane", SAVING_MIN > 0, true);
eq("saving: nothing at all", couldHaveSaved([], "2026-10-01", "AWG"), null);

// the phone message never carries an amount
const msg = (item: string, label = "October") => pushMessage("recap", { item, label }, "details", "2026-11-01").body;
eq("message: under", msg("under"), "Your October recap is ready. You finished under budget.");
eq("message: over", msg("over"), "Your October recap is ready. You went over budget.");
eq("message: no budget", msg("none"), "Your October recap is ready.");
eq("message: no month falls back to the generic words", msg("under", ""), "Your monthly recap is ready.");
eq("message: private style is generic", pushMessage("recap", { item: "under", label: "October" }, "private", "2026-11-01").body, "Your monthly recap is ready.");
eq("message: no digits at all", /\d/.test(msg("over")), false);

// the alert has its own switch, on for the phone and off for Telegram until chosen
eq("switch exists", (PUSH_PREF_KEYS as readonly string[]).includes("recap"), true);
eq("switch on by default", DEFAULT_PUSH_PREFS.recap, true);
eq("telegram: off until chosen", normalizeKinds(null, { trip_reminders: true, admin_alerts: true }).recap, false);

if (fail) { console.error(`${fail} recap test(s) failed`); process.exit(1); }
console.log("recap tests passed");
