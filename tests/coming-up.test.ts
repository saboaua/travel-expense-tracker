import { buildComingUp } from "../src/lib/personal/coming-up";

let failures = 0;
const eq = (a: unknown, b: unknown, name: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) { failures++; console.log("  got", JSON.stringify(a)); } };

const today = "2026-11-09";
const sub = (id: string, name: string, next_payment: string, extra = {}) => ({ id, name, price: 20, currency: "USD", cycle: "monthly" as const, next_payment, trial_ends: null, status: "active" as const, split_count: 1, ...extra });

const items = buildComingUp({
  subs: [sub("s1", "Claude Pro Plan", "2026-11-12"), sub("s2", "Far away", "2026-12-25"), sub("s3", "Paused one", "2026-11-10", { status: "paused" })],
  clients: [{ id: "c1", customer_id: "k1", plan: "Premium", expire_date: "2026-11-15" }, { id: "c2", customer_id: "k2", plan: "Basic", expire_date: "2026-12-30" }, { id: "c3", customer_id: "k1", plan: "Basic", expire_date: "2026-11-05" }, { id: "c4", customer_id: "k2", plan: "Basic", expire_date: "2026-10-01" }],
  customerNames: { k1: "Maria Lopez" },
  trips: [{ id: "t1", name: "Miami Conference", start_date: "2026-11-21" }, { id: "t2", name: "Past trip", start_date: "2026-11-01" }, { id: "t3", name: "Next year", start_date: "2027-03-01" }],
}, today);

eq(items.map((i) => i.key), ["iptv-c3", "sub-s1", "iptv-c1", "trip-t1"], "soonest first; far, paused, old and past items are left out");
eq(items.find((i) => i.key === "sub-s1")?.label, "In 3 days", "a payment in 3 days");
eq(items.find((i) => i.key === "sub-s1")?.tone, "red", "3 days or less is red");
eq(items.find((i) => i.key === "iptv-c3")?.label, "Ended 4 days ago", "a client that just ended is shown");
eq(items.find((i) => i.key === "iptv-c1")?.title, "Maria Lopez", "client name is used");
eq(items.find((i) => i.key === "trip-t1")?.tone, "plain", "12 days away is plain");
eq(buildComingUp({ subs: [sub("a", "Today", "2026-11-09"), sub("b", "Tomorrow", "2026-11-10")] }, today).map((i) => i.label), ["Today", "Tomorrow"], "today and tomorrow wording");
eq(buildComingUp({ subs: Array.from({ length: 9 }, (_, i) => sub(`x${i}`, `S${i}`, `2026-11-${String(10 + i).padStart(2, "0")}`)) }, today).length, 5, "at most five");
eq(buildComingUp({}, today), [], "nothing passed means nothing shown");
eq(buildComingUp({ subs: [sub("t", "Trial", "2027-01-01", { trial_ends: "2026-11-11" })] }, today)[0]?.subtitle, "Free trial ends", "a free trial is named");

console.log(failures ? `${failures} failed` : "coming-up: all checks passed");
process.exit(failures ? 1 : 0);
