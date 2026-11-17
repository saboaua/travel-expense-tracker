import { convertPrice, convertQty, fillupSub, fuelCurrency, fuelMonths, fuelSummary, L_PER_GAL, monthBack, parsePositive, solveFillup, type FuelRow } from "../src/lib/personal/fuel";
import { spentByArea, budgetView, cleanLimits, BUDGET_AREAS } from "../src/lib/personal/budget";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// any two give the third
eq("total and price give the amount", solveFillup({ total: 50, price: 2.15, qty: null }), { total: 50, price: 2.15, qty: 23.26, worked: "qty" });
eq("total and amount give the price", solveFillup({ total: 50, price: null, qty: 23.26 }), { total: 50, price: 2.15, qty: 23.26, worked: "price" });
eq("price and amount give the total", solveFillup({ total: null, price: 4.89, qty: 10.2 }), { total: 49.88, price: 4.89, qty: 10.2, worked: "total" });
eq("only the total is fine", solveFillup({ total: 80, price: null, qty: null }), { total: 80, price: null, qty: null, worked: null });
eq("the total wins when all three are given", (solveFillup({ total: 50, price: 2, qty: 10 }) as { total: number }).total, 50);
eq("only a price is not enough", "error" in solveFillup({ total: null, price: 2.15, qty: null }), true);
eq("nothing is not enough", "error" in solveFillup({ total: null, price: null, qty: null }), true);

// units
eq("gallons to litres", Math.round(convertQty(10, "gal", "L") * 1000) / 1000, Math.round(10 * L_PER_GAL * 1000) / 1000);
eq("same unit is unchanged", convertQty(7, "L", "L"), 7);
eq("a price per litre is per gallon times 3.785", Math.round(convertPrice(2, "L", "gal") * 100) / 100, 7.57);
eq("a price per gallon back to litres", Math.round(convertPrice(7.57, "gal", "L") * 100) / 100, 2);
eq("comma decimal", parsePositive("2,15"), 2.15);
eq("zero is not a price", parsePositive("0"), null);
eq("words are not a number", parsePositive("abc"), null);

// the line under a fill-up
eq("amount and price", fillupSub({ quantity: 23.26, price_per_unit: 2.15, unit: "L", currency: "AWG" }), "23.26 L · AWG 2.15 per L");
eq("gallons", fillupSub({ quantity: 10.2, price_per_unit: 4.89, unit: "gal", currency: "USD" }), "10.2 gal · USD 4.89 per gal");
eq("total only", fillupSub({ quantity: null, price_per_unit: null, unit: "L", currency: "AWG" }), "Total only");

// month totals
const row = (id: string, date: string, amount: number, q: number | null, unit: "L" | "gal" = "L", currency = "AWG"): FuelRow => ({ id, fill_date: date, unit, quantity: q, price_per_unit: null, amount, currency, amount_usd: currency === "USD" ? amount : null, station: null });
const rows = [row("a", "2026-11-16", 50, 23.26), row("b", "2026-11-11", 80, null), row("c", "2026-11-06", 46.65, 21.4), row("d", "2026-10-20", 90, 40)];
const s = fuelSummary(rows.slice(0, 3), "AWG", "L");
eq("total", s?.total, 176.65);
eq("count", s?.count, 3);
eq("litres bought skip total-only fill-ups", s?.volume, 44.7);
eq("average price uses only fill-ups with an amount", s?.avgPrice, Math.round((96.65 / 44.66) * 100) / 100);
eq("nothing gives null", fuelSummary([], "AWG", "L"), null);
eq("a USD fill-up is converted at the peg", fuelSummary([row("x", "2026-11-01", 10, null, "L", "USD")], "AWG", "L")?.total, 17.9);
eq("gallons shown in litres", fuelSummary([row("g", "2026-11-01", 40, 10, "gal")], "AWG", "L")?.volume, 37.9);
eq("last months, newest first", fuelMonths(rows, "AWG").map((m) => [m.month, m.total]), [["2026-11-01", 176.65], ["2026-10-01", 90]]);
eq("month back", monthBack("2026-02-10", 3), "2025-11-01");
eq("currency is the one used more", fuelCurrency([{ currency: "USD" }, { currency: "USD" }, { currency: "AWG" }]), "USD");

// the budget
eq("fuel is a budget area after quick spend", BUDGET_AREAS.map((a) => a.key), ["groceries", "utilities", "quick", "fuel", "house"]);
eq("a fuel limit is kept", cleanLimits({ fuel: "300" }), { fuel: 300 });
const by = spentByArea({ groceries: [], utilities: [], spends: [], projects: [], fuel: [{ amount: 50, currency: "AWG" }, { amount: 10, currency: "USD", amount_usd: 10 }] }, "AWG");
eq("fuel adds up in the budget currency", by.fuel, 67.9);
const v = budgetView({ month: null, amount: 1000, currency: "AWG", limits: {}, alert_at_80: false }, by, "2026-11-12");
eq("fuel counts toward what you spent", v.spent, 67.9);

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("PASS fuel");
