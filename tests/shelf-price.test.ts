import { distanceLabel, nearestShops, readShelfStatus, seenBy, SHELF_FIELDS, shelfArgs, suggestedShop } from "../src/lib/personal/shelf-price";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { failed++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } else console.log(`PASS ${msg}`); };

const me = { lat: 12.5186, lng: -70.0358 };
const shops = [
  { id: "1", name: "Ling & Sons", lat: 12.5205, lng: -70.0358 },
  { id: "2", name: "Super Food Plaza", lat: 12.51867, lng: -70.0358 },
  { id: "3", name: "Super Food Plaza", lat: 12.51868, lng: -70.03581 },
  { id: "4", name: "Do it Aruba", lat: 12.5195, lng: -70.0358 },
  { id: "5", name: "Far Market", lat: 12.60, lng: -70.0358 },
];
const near = nearestShops(me, shops, 3);
eq(near.map((s) => s.name), ["Super Food Plaza", "Do it Aruba", "Ling & Sons"], "closest first, a shop listed twice counts once");
eq(suggestedShop(near)?.name, "Super Food Plaza", "a shop within 300 m is suggested");
eq(suggestedShop(nearestShops(me, shops.slice(0, 1).map((s) => ({ ...s, lat: 12.53 })))), null, "nothing is suggested when the closest is far");
eq(nearestShops(me, [{ id: "x", name: "  ", lat: 1, lng: 1 }, { id: "y", name: "Bad", lat: NaN, lng: 1 }]), [], "places without a name or position are ignored");
eq([distanceLabel(0.08), distanceLabel(0.34), distanceLabel(1.14)], ["80 m", "340 m", "1.1 km"], "distance reads as metres under a kilometre");

const a = shelfArgs({ shop: "Super Food Plaza", product: "Smartfood popcorn white cheddar 6.75oz", size: "", price: 5.789, currency: "awg", country: "AW", sale: false });
eq(a && [a.p_store_key, a.p_product_name, a.p_size, a.p_price, a.p_currency, a.p_sale], ["superfoodplaza", "Smartfood popcorn white cheddar", "191 g", 5.79, "AWG", false], "the size is read from the name, the price rounded");
eq(a && Object.keys(a).sort(), [...SHELF_FIELDS].sort(), "only the allowed fields are sent");
const same = shelfArgs({ shop: "Ling and Sons", product: "SMARTFOOD WHITE CHEDDAR POPCORN", size: "6.75 oz", price: 5.9, currency: "AWG", country: "AW", sale: false });
eq(a?.p_product_key === same?.p_product_key, true, "the same product in another wording and size spelling has the same key");
eq(shelfArgs({ shop: "x", product: "Oreo", size: "", price: 0, currency: "AWG", country: null, sale: false }), null, "no price, nothing to send");
eq(shelfArgs({ shop: "", product: "Oreo", size: "", price: 2, currency: "AWG", country: null, sale: false }), null, "no shop, nothing to send");
eq(shelfArgs({ shop: "x", product: "Oreo", size: "", price: 2, currency: "AWG", country: null, sale: true }, true)?.p_force, true, "a second look can be confirmed");
eq(["ok", "off", "limit", "check", "weird", null].map(readShelfStatus), ["ok", "off", "limit", "check", "invalid", "invalid"], "unknown answers are treated as invalid");
eq([seenBy(1), seenBy(2), seenBy(3)], ["New for this shop", "Seen by 1 other shopper", "Seen by 2 other shoppers"], "your own price is not counted");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("shelf-price: all checks passed");
