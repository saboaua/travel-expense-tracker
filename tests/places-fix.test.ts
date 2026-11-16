import { filterPlaces, inAruba, readFix, readPoint, viewPlaces, type PlaceRow } from "../src/lib/personal/places-fix";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("Oranjestad is in Aruba", inAruba(12.5186, -70.0358), true);
eq("a typo in the latitude is not", inAruba(52.5186, -70.0358), false);
eq("a flipped sign is not", inAruba(12.5186, 70.0358), false);

eq("two numbers", readPoint("12.5412", "-70.0268"), { lat: 12.5412, lng: -70.0268 });
eq("a comma as the decimal", readPoint("12,5412", "-70,0268"), { lat: 12.5412, lng: -70.0268 });
eq("both pasted into the first box", readPoint("12.5412, -70.0268", ""), { lat: 12.5412, lng: -70.0268 });
eq("both pasted into the second box", readPoint("", "12.5412, -70.0268"), { lat: 12.5412, lng: -70.0268 });
eq("rounded to 6 decimals", readPoint("12.123456789", "-70.1"), { lat: 12.123457, lng: -70.1 });
eq("not a number", "error" in readPoint("abc", "-70"), true);
eq("latitude out of range", "error" in readPoint("95", "-70"), true);
eq("longitude out of range", "error" in readPoint("12", "-190"), true);
eq("0, 0 is refused", "error" in readPoint("0", "0"), true);
eq("empty is refused", "error" in readPoint("", ""), true);

const rows: PlaceRow[] = [
  { id: "1", name: "Super Food Plaza", address: "Oranjestad", lat: 12.5301, lng: -70.0261, fixed: true },
  { id: "2", name: "Ling & Sons Noord", address: "Noord", lat: 52.5186, lng: -70.0358 },
  { id: "3", name: "Cost-U-Less", address: "Oranjestad", lat: 12.5186, lng: -70.0358 },
  { id: "4", name: "Ling & Sons Sasaki", address: null, lat: 12.5186, lng: -70.0358 },
];
const v = viewPlaces(rows);
eq("fine place has no flag", [v[0].flag, v[0].sameAs, v[0].fixed], [null, null, true]);
eq("outside Aruba is flagged", v[1].flag, "outside");
eq("same point names the other shop", [v[2].flag, v[2].sameAs, v[3].flag, v[3].sameAs], ["same", "Ling & Sons Sasaki", "same", "Cost-U-Less"]);
eq("an unset fixed column is false", viewPlaces([{ id: "9", name: "X", address: null, lat: 12.5, lng: -70 }])[0].fixed, false);
eq("filter outside", filterPlaces(v, "", "outside").map((p) => p.id), ["2"]);
eq("filter same", filterPlaces(v, "", "same").map((p) => p.id), ["3", "4"]);
eq("filter fixed", filterPlaces(v, "", "fixed").map((p) => p.id), ["1"]);
eq("search by name", filterPlaces(v, "ling", "all").map((p) => p.id), ["2", "4"]);
eq("search by address", filterPlaces(v, "noord", "all").map((p) => p.id), ["2"]);
eq("search and filter together", filterPlaces(v, "ling", "same").map((p) => p.id), ["4"]);

eq("a good fix", readFix({ name: " Ling & Sons Noord ", address: " ", lat: "12.5412", lng: "-70.0268" }), { ok: true, name: "Ling & Sons Noord", address: null, lat: 12.5412, lng: -70.0268 });
eq("name is needed", readFix({ name: "  ", lat: 12.5, lng: -70 }).ok, false);
eq("name too long", readFix({ name: "x".repeat(121), lat: 12.5, lng: -70 }).ok, false);
eq("address too long", readFix({ name: "A", address: "x".repeat(201), lat: 12.5, lng: -70 }).ok, false);
eq("bad point", readFix({ name: "A", lat: "x", lng: -70 }).ok, false);
eq("empty body", readFix(null).ok, false);

if (fail) process.exit(1);
console.log("places-fix tests passed");
