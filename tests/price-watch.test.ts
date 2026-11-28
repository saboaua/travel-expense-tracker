import { cheapest, decide, hitsMessage, lastPaid, ownOffers, readWatch, ruleMet, ruleWords, type Watch, type WatchOffer } from "../src/lib/personal/price-watch";
import { buildProducts } from "../src/lib/personal/price-compare";
import type { TrackerRow } from "../src/lib/personal/grocery";
import { DEFAULT_LIMITS, parseLimits, proComparison, readLimits, watchesStatus, limitsRow } from "../src/lib/limits";
import { pushMessage } from "../src/lib/push-text";
import { DEFAULT_PUSH_PREFS, PUSH_PREF_KEYS } from "../src/lib/push-prefs";
import { normalizeKinds } from "../src/lib/telegram-kinds";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const watch = (o: Partial<Watch> = {}): Watch => ({ id: "w1", product_key: "k", name: "Gouda 500g", currency: "AWG", rule: "below_last", target: 12, paused: false, last_alert_price: null, last_alert_store: null, ...o });
const offer = (store: string, price: number, source: WatchOffer["source"] = "own"): WatchOffer => ({ store, price, source });

// the two rules
eq("below_last: cheaper counts", ruleMet("below_last", 12, 11.99), true);
eq("below_last: the same price does not", ruleMet("below_last", 12, 12), false);
eq("at_or_below: the same price counts", ruleMet("at_or_below", 12, 12), true);
eq("at_or_below: dearer does not", ruleMet("at_or_below", 12, 12.01), false);
const f = (n: number) => `AWG ${n.toFixed(2)}`;
eq("words: below_last", ruleWords({ rule: "below_last", target: 3.99 }, f), "Waiting for under AWG 3.99");
eq("words: at_or_below", ruleWords({ rule: "at_or_below", target: 3.8 }, f), "Waiting for AWG 3.80 or less");

// reading rows
eq("read: good row", readWatch({ id: "a", product_key: "k", name: "Milk", currency: "AWG", rule: "at_or_below", target: "3.8", paused: false, last_alert_price: null })?.target, 3.8);
eq("read: bad rule", readWatch({ id: "a", product_key: "k", name: "Milk", rule: "nope", target: 3 }), null);
eq("read: no target", readWatch({ id: "a", product_key: "k", name: "Milk", rule: "below_last", target: 0 }), null);
eq("read: nothing", readWatch(null), null);
eq("read: paused and last alert", (({ paused, last_alert_price }) => [paused, last_alert_price])(readWatch({ id: "a", product_key: "k", name: "Milk", rule: "below_last", target: 5, paused: true, last_alert_price: "4.5" })!), [true, 4.5]);

// the cheapest offer
eq("cheapest: lowest wins", cheapest([offer("A", 5), offer("B", 4), offer("C", 6)])?.store, "B");
eq("cheapest: tie goes to the first name", cheapest([offer("Zed", 4), offer("Ace", 4)])?.store, "Ace");
eq("cheapest: nothing", cheapest([]), null);
eq("cheapest: zero and negative prices are ignored", cheapest([offer("A", 0), offer("B", -1)]), null);

// the decision
eq("decide: not met, nothing said before", decide(watch(), [offer("A", 13)]).action, "none");
eq("decide: met, first time", decide(watch(), [offer("A", 11.5)]).action, "alert");
eq("decide: names the cheapest", (decide(watch(), [offer("A", 11.5), offer("B", 11)]) as { offer: WatchOffer }).offer.store, "B");
eq("decide: the same price is not announced twice", decide(watch({ last_alert_price: 11.5 }), [offer("A", 11.5)]).action, "none");
eq("decide: a lower price is announced again", decide(watch({ last_alert_price: 11.5 }), [offer("A", 10.9)]).action, "alert");
eq("decide: a higher price that still meets the rule is not", decide(watch({ last_alert_price: 11 }), [offer("A", 11.8)]).action, "none");
eq("decide: back above the rule resets", decide(watch({ last_alert_price: 11 }), [offer("A", 12.5)]).action, "reset");
eq("decide: reset first, then announced again the next time", decide(watch({ last_alert_price: null }), [offer("A", 11)]).action, "alert");
eq("decide: no offers at all changes nothing", decide(watch({ last_alert_price: 11 }), []).action, "none");
eq("decide: at_or_below meets on equal", decide(watch({ rule: "at_or_below", target: 12 }), [offer("A", 12)]).action, "alert");

// products built the way the Price tracker builds them
const row = (store: string, date: string, price: number, name = "Gouda 500g", noted = false): TrackerRow => ({ name, normalized_name: name.toLowerCase(), category: "Dairy", unit_price: price, quantity: 1, line_total: price, noted, receipt: { store, purchase_date: date, currency: "AWG" } });
const product = (rows: TrackerRow[]) => buildProducts(rows, []).products[0];
const gouda = product([row("Ling", "2026-10-01", 14), row("Super Food", "2026-10-20", 12.5)]);
eq("lastPaid: the latest purchase", lastPaid(gouda), { price: 12.5, store: "Super Food", date: "2026-10-20" });
eq("lastPaid: a noted price is used only when nothing was bought", lastPaid(product([row("Ling", "2026-10-01", 9, "Gouda 500g", true)]))?.price, 9);
eq("lastPaid: bought beats noted", lastPaid(product([row("Ling", "2026-10-01", 14), row("Ling", "2026-10-25", 8, "Gouda 500g", true)]))?.price, 14);
eq("ownOffers: the last purchase is left out", ownOffers(gouda).map((o) => o.store), ["Ling"]);
eq("ownOffers: a noted price after the last purchase counts", ownOffers(product([row("Ling", "2026-10-01", 14), row("Super Food", "2026-10-20", 12.5), row("Ling", "2026-10-25", 11, "Gouda 500g", true)])).map((o) => `${o.store}:${o.price}`).sort(), ["Ling:11"]);
eq("ownOffers: one product bought once has no other store", ownOffers(product([row("Ling", "2026-10-01", 14)])), []);

// the message names at most one product and never carries an amount
eq("hits: one", hitsMessage([{ name: "Gouda 500g", store: "Ling" }]), { item: "Gouda 500g", label: "Ling", count: 1 });
eq("hits: several", hitsMessage([{ name: "A", store: "x" }, { name: "B", store: "y" }]), { count: 2 });
const msg = (d: Parameters<typeof pushMessage>[1], style: "details" | "private" = "details") => pushMessage("priceDrop", d, style, "2026-11-28").body;
eq("message: one product", msg({ count: 1, item: "Gouda 500g", label: "Super Food Plaza" }), "Gouda 500g is cheaper at Super Food Plaza now.");
eq("message: several", msg({ count: 3 }), "3 prices you watch dropped. Open the app to see them.");
eq("message: private style is generic", msg({ count: 1, item: "Gouda 500g", label: "Ling" }, "private"), "A price you watch dropped. Open the app to see it.");
eq("message: nothing to say is generic", msg({ count: 0 }), "A price you watch dropped. Open the app to see it.");
eq("message: no amount in the wording", /\d\.\d|AWG/.test(msg({ count: 1, item: "Gouda 500g", label: "Ling" })), false);
eq("switch exists and is on", [(PUSH_PREF_KEYS as readonly string[]).includes("priceDrops"), DEFAULT_PUSH_PREFS.priceDrops], [true, true]);
eq("telegram: off until chosen", normalizeKinds(null, { trip_reminders: true, admin_alerts: true }).priceDrops, false);

// the Free and Pro limit
const on = { ...DEFAULT_LIMITS, starts: { ...DEFAULT_LIMITS.starts, price_watches: "2026-01-01" } };
const FREE = { pro: false, admin: false }, PRO = { pro: true, admin: false }, ADMIN = { pro: false, admin: true };
eq("limit: defaults", [DEFAULT_LIMITS.free_price_watches, DEFAULT_LIMITS.pro_price_watches], [3, 30]);
eq("limit: free has room", watchesStatus(on, FREE, 2, "2026-11-28"), { limit: 3, count: 2, full: false });
eq("limit: free is full at the number", watchesStatus(on, FREE, 3, "2026-11-28").full, true);
eq("limit: pro holds more", watchesStatus(on, PRO, 3, "2026-11-28"), { limit: 30, count: 3, full: false });
eq("limit: admin has none", watchesStatus(on, ADMIN, 99, "2026-11-28").limit, null);
eq("limit: off before the start day", watchesStatus({ ...on, starts: { ...on.starts, price_watches: "2027-01-01" } }, FREE, 9, "2026-11-28").limit, null);
eq("limit: off when no start day", watchesStatus({ ...on, starts: { ...on.starts, price_watches: null } }, FREE, 9, "2026-11-28").limit, null);
const base = { free_ai_scans: 10, free_documents: 2, pro_documents: 100, free_shared_cards: 1, free_trip_papers: 3, pro_trip_papers: 50, free_projects: 2, pro_projects: 50 };
eq("limit: numbers are read", (parseLimits({ ...base, free_price_watches: 5, pro_price_watches: 40 }) as { value: typeof on }).value.pro_price_watches, 40);
eq("limit: pro below free is refused", parseLimits({ ...base, free_price_watches: 5, pro_price_watches: 3 }).ok, false);
eq("limit: not a number is refused", parseLimits({ ...base, free_price_watches: "x", pro_price_watches: 3 }).ok, false);
eq("limit: left out keeps the defaults", (parseLimits(base) as { value: typeof on }).value.free_price_watches, 3);
eq("limit: a missing column reads as the default", readLimits({ free_ai_scans: 7 }).free_price_watches, 3);
eq("limit: saved and read back", readLimits(limitsRow({ ...on, free_price_watches: 4, pro_price_watches: 12 })).pro_price_watches, 12);
eq("limit: shown on the Get Pro table", proComparison(on).some((r) => r.label === "Price watches" && r.free === "3" && r.pro === "30"), true);
eq("limit: not shown while off", proComparison({ ...on, starts: { ...on.starts, price_watches: null } }).some((r) => r.label === "Price watches"), false);

if (fail) { console.error(`${fail} price watch test(s) failed`); process.exit(1); }
console.log("price watch tests passed");
