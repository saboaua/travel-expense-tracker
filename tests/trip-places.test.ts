import { cityOf, distanceText, kmBetween, mapsUrl, overpassQuery, placeType, placesTrips, prominence, rankPlaces, type OsmElement } from "../src/lib/trip-places";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { failed++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } else console.log(`PASS ${msg}`); };

const c = { lat: 38.7223, lon: -9.1393 };
const el = (id: number, tags: Record<string, string>, dLat = 0.01): OsmElement => ({ type: "node", id, lat: c.lat + dLat, lon: c.lon, tags });

// things to do: well documented places first, then the closest
const things = rankPlaces("things", [
  el(1, { name: "Small gallery", tourism: "gallery" }, 0.001),
  el(2, { name: "Belém Tower", tourism: "attraction", wikidata: "Q1", wikipedia: "pt:Torre de Belém", website: "x" }, 0.02),
  el(3, { name: "Old wall", historic: "ruins", wikidata: "Q2" }, 0.005),
  el(4, { tourism: "attraction" }),
  el(5, { name: "belém tower", tourism: "attraction" }, 0.0),
], c);
eq(things.map((p) => p.name), ["Belém Tower", "Old wall", "Small gallery"], "best documented first, unnamed and duplicate names dropped");
eq(things[0].type, "Attraction", "the kind of place is shown");

// places to eat: a chain is not a visitor pick, a cuisine shows as the type
const eat = rankPlaces("eat", [
  el(10, { name: "Burger Chain", amenity: "restaurant", brand: "Burger Chain", "brand:wikidata": "Q9" }, 0.001),
  el(11, { name: "Cervejaria Ramiro", amenity: "restaurant", cuisine: "seafood", website: "x", opening_hours: "Tu-Su 12:00-24:00" }, 0.01),
  el(12, { name: "Corner cafe", amenity: "cafe" }, 0.002),
  el(13, { name: "Quick bites", amenity: "fast_food" }, 0.0005),
], c);
eq(eat.map((p) => p.name), ["Cervejaria Ramiro", "Corner cafe", "Burger Chain", "Quick bites"].slice(0, 4), "chains and fast food go last");
eq(eat[0].type, "Seafood", "a restaurant shows its cuisine");

// only the best 10
const many = Array.from({ length: 40 }, (_, i) => el(100 + i, { name: `Place ${i}`, tourism: "museum" }, i / 1000));
eq(rankPlaces("things", many, c).length, 10, "ten places at most");
eq(rankPlaces("things", many, c)[0].name, "Place 0", "equal places are ordered by distance");
eq(rankPlaces("things", [{ type: "way", id: 1, center: { lat: c.lat, lon: c.lon }, tags: { name: "Park view", tourism: "viewpoint" } }], c)[0].km, 0, "a way uses its centre");

eq(placeType({ amenity: "restaurant" }), "Restaurant", "a restaurant without a cuisine");
eq(placeType({ tourism: "viewpoint" }), "Viewpoint", "viewpoint");
eq(placeType({ shop: "x" }), "Place", "anything else is a place");
eq(prominence("eat", { brand: "X" }) < prominence("eat", {}), true, "a brand scores lower than a local place");
eq(Math.round(kmBetween(c, { lat: c.lat + 0.01, lon: c.lon }) * 100) / 100, 1.11, "distance in km");
eq([distanceText(0.04), distanceText(0.43), distanceText(1.26), distanceText(12.4)], ["50 m", "450 m", "1.3 km", "12 km"], "distance reads short");
eq(cityOf("Lisbon, Portugal"), "Lisbon", "the city is the first part");
eq(cityOf("Aruba"), "Aruba", "no comma keeps the text");
eq(/google\.com\/maps\/search/.test(mapsUrl({ name: "Café X", lat: 1.5, lng: 2.5 })) && /1\.5,2\.5/.test(mapsUrl({ name: "A", lat: 1.5, lng: 2.5 })), true, "a Maps link");
eq(/around:7000,38\.7223,-9\.1393/.test(overpassQuery("eat", c)) && /restaurant/.test(overpassQuery("eat", c)) && /attraction/.test(overpassQuery("things", c)), true, "map queries cover the radius and the kinds of place");

// which trips can show places
const T = (id: string, destination: string | null, start: string, end: string | null) => ({ id, name: id, destination, start, end });
eq(placesTrips([T("later", "Rome", "2026-12-20", "2026-12-25"), T("now", "Lisbon", "2026-11-20", "2026-11-25"), T("nodest", null, "2026-11-21", "2026-11-23"), T("over", "Paris", "2026-11-01", "2026-11-10"), T("soon", "Oslo", "2026-12-01", null)], "2026-11-22").map((t) => t.id), ["now", "soon", "later"], "ongoing first, then the soonest; no destination or ended trips are left out");
eq(placesTrips([T("blank", "  ", "2026-11-22", null)], "2026-11-22"), [], "a blank destination is not a destination");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("trip-places: all checks passed");
