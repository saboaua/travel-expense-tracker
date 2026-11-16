import { planCardText } from "../src/lib/plans";
import { userReference, priceFor, monthsFree, offeredPeriods, parseSettings, renewedEndsOn, parseReceived } from "../src/lib/payments";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("reference", userReference("4f1c2e9a-0000-4000-8000-000000000001"), "LIF-4F1C2");
eq("same every time", userReference("4f1c2e9a-0000-4000-8000-000000000001"), userReference("4f1c2e9a-0000-4000-8000-000000000001"));
eq("price monthly", priceFor({ monthly_price: 12, yearly_price: 120 }, "monthly"), 12);
eq("price yearly", priceFor({ monthly_price: 12, yearly_price: 120 }, "yearly"), 120);
eq("2 months free", monthsFree({ monthly_price: 12, yearly_price: 120 }), 2);
eq("no discount", monthsFree({ monthly_price: 12, yearly_price: 144 }), 0);
eq("no price, no discount", monthsFree({ monthly_price: 0, yearly_price: 0 }), 0);

const ok = parseSettings({ monthly_price: "12,50", yearly_price: 120, currency: "awg", instructions: " Use the reference. ", accounts: [{ bank: "Aruba Bank", name: "Lifolio", number: "123", currency: "" }, { bank: "", number: "" }] });
eq("settings ok", ok.ok && ok.value, { currency: "AWG", monthly_price: 12.5, yearly_price: 120, accounts: [{ bank: "Aruba Bank", name: "Lifolio", number: "123", currency: "AWG" }], instructions: "Use the reference.", btc_enabled: false, btc_quote_minutes: 30, btc_confirmations: 2 });
eq("btc settings", parseSettings({ monthly_price: 1, yearly_price: 1, btc_enabled: true, btc_quote_minutes: "45", btc_confirmations: 0 }).ok && (parseSettings({ monthly_price: 1, yearly_price: 1, btc_enabled: true, btc_quote_minutes: "45", btc_confirmations: 0 }) as { value: { btc_enabled: boolean; btc_quote_minutes: number; btc_confirmations: number } }).value.btc_quote_minutes, 45);
eq("btc minutes too low", parseSettings({ monthly_price: 1, yearly_price: 1, btc_quote_minutes: 2 }).ok, false);
eq("btc confirmations too high", parseSettings({ monthly_price: 1, yearly_price: 1, btc_confirmations: 20 }).ok, false);
eq("settings bad price", parseSettings({ monthly_price: "abc", yearly_price: 1 }).ok, false);
eq("settings half account", parseSettings({ monthly_price: 1, yearly_price: 1, accounts: [{ bank: "CMB", number: "" }] }).ok, false);
eq("settings too many", parseSettings({ monthly_price: 1, yearly_price: 1, accounts: Array.from({ length: 7 }, () => ({ bank: "x", number: "1" })) }).ok, false);

eq("new plan from today", renewedEndsOn("monthly", "2026-11-15", null), "2026-12-15");
eq("expired plan from today", renewedEndsOn("yearly", "2026-11-15", "2026-10-01"), "2027-11-15");
eq("early renewal keeps days left", renewedEndsOn("monthly", "2026-11-15", "2026-11-25"), "2026-12-25");

eq("received ok", parseReceived({ amount: "120", paid_on: "2026-11-15", method: "cmb", reference: " LIF-1 ", note: "" }, "AWG"), { ok: true, value: { amount: 120, paid_on: "2026-11-15", method: "cmb", reference: "LIF-1", note: null } });
eq("received no amount", parseReceived({ amount: "", paid_on: "2026-11-15" }, "AWG").ok, false);
eq("received bad date", parseReceived({ amount: 5, paid_on: "x" }, "AWG").ok, false);

eq("card free", planCardText({ isAdmin: false, row: null, today: "2026-11-15" }).title, "Free plan");
eq("card pro", planCardText({ isAdmin: false, row: { period: "yearly", ends_on: "2027-11-15" }, today: "2026-11-15" }), { title: "Pro, yearly", sub: "Until 2027-11-15 · 365 days left", pro: true, admin: false });
eq("card no end", planCardText({ isAdmin: false, row: { period: "gift", ends_on: null }, today: "2026-11-15" }).sub, "No end date");
eq("card ended", planCardText({ isAdmin: false, row: { period: "monthly", ends_on: "2026-10-01" }, today: "2026-11-15" }).title, "Free plan");
eq("card admin", planCardText({ isAdmin: true, row: null, today: "2026-11-15" }).title, "Pro, admin access");

eq("both plans offered", offeredPeriods({ monthly_price: 12, yearly_price: 120 }), ["monthly", "yearly"]);
eq("no yearly price", offeredPeriods({ monthly_price: 12, yearly_price: 0 }), ["monthly"]);
eq("no monthly price", offeredPeriods({ monthly_price: 0, yearly_price: 120 }), ["yearly"]);
eq("no prices", offeredPeriods({ monthly_price: 0, yearly_price: 0 }), []);

console.log(fail ? `${fail} FAILED` : "payments: all checks passed");
process.exit(fail ? 1 : 0);
