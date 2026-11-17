import { fuelTotalRow, groceryTotalRow, isDest, isTotalOnly, topNames } from "../src/lib/personal/quick-targets";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("most used first, newest wins ties", topNames(["Cost-U-Less", "Super Food", "super food", "Ling", "Cost-U-Less", null, " "]), ["Cost-U-Less", "Super Food", "Ling"]);
eq("limit", topNames(["a", "b", "c"], 2), ["a", "b"]);
eq("nothing", topNames([]), []);
eq("spaces collapse", topNames(["Super   Food", "super food"]), ["Super Food"]);

eq("isDest", [isDest("fuel"), isDest("x")], [true, false]);

eq("grocery total", groceryTotalRow({ store: "  Super Food  Plaza ", date: "2026-11-17", amount: 220.004, currency: "AWG" }), { store: "Super Food Plaza", purchase_date: "2026-11-17", total: 220, currency: "AWG", notes: null });
eq("grocery needs a store", groceryTotalRow({ store: " ", date: "2026-11-17", amount: 5, currency: "AWG" }), null);
eq("grocery needs an amount", groceryTotalRow({ store: "X", date: "2026-11-17", amount: 0, currency: "AWG" }), null);
eq("fuel total only", fuelTotalRow({ date: "2026-11-17", amount: 60, currency: "AWG", usd: 33.5195, station: "Delta" }), { fill_date: "2026-11-17", unit: "L", quantity: null, price_per_unit: null, amount: 60, currency: "AWG", amount_usd: 33.52, station: "Delta" });
eq("fuel with litres", (fuelTotalRow({ date: "2026-11-17", amount: 60, currency: "AWG", usd: 33.52, station: "", quantity: 30 }) as { price_per_unit: number; station: null }).price_per_unit, 2);
eq("fuel needs an amount", fuelTotalRow({ date: "2026-11-17", amount: 0, currency: "AWG", usd: 0, station: "" }), null);

const withItems = new Set(["a"]);
eq("total only", [isTotalOnly({ id: "a" }, withItems), isTotalOnly({ id: "b" }, withItems), isTotalOnly({ id: "c", prices_only: true }, withItems)], [false, true, false]);

if (fail) process.exit(1);
