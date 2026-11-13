import { summarizePersonal } from "../src/lib/personal/summary";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

eq("empty", summarizePersonal([], []), { grocery: null, projects: { count: 0, spent: 0, currency: "USD" }, trips: { count: 0, spent: 0, currency: "USD" } });
eq("null input", summarizePersonal(null, undefined), { grocery: null, projects: { count: 0, spent: 0, currency: "USD" }, trips: { count: 0, spent: 0, currency: "USD" } });
eq("grocery most-used currency", summarizePersonal([{ total: "10.10", currency: "AWG" }, { total: 20.2, currency: "AWG" }, { total: 500, currency: "USD" }], []).grocery, { currency: "AWG", total: 925.3, count: 3 });
eq("grocery in one currency, USD entries converted at the peg", summarizePersonal([{ total: 10, currency: "AWG" }, { total: 20, currency: "USD" }], [], "USD").grocery, { currency: "USD", total: 25.59, count: 2 });
const projects = [
  { kind: "home_project", personal_expenses: [{ amount_usd: 100.5 }, { amount_usd: "49.5" }] },
  { kind: "home_project", personal_expenses: [] },
  { kind: "personal_trip", personal_expenses: [{ amount_usd: 300 }, { amount_usd: null }] },
  { kind: "personal_trip", personal_expenses: null },
];
const s = summarizePersonal([], projects);
eq("home projects", s.projects, { count: 2, spent: 150, currency: "USD" });
eq("project spending in the hub currency", summarizePersonal([], projects, "AWG").projects, { count: 2, spent: 268.5, currency: "AWG" });
eq("personal trips", s.trips, { count: 2, spent: 300, currency: "USD" });
eq("float rounding", summarizePersonal([{ total: 0.1, currency: "USD" }, { total: 0.2, currency: "USD" }], []).grocery?.total, 0.3);
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
