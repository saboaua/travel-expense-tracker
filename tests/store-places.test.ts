import { placeOptions, pickPlace, chosenPlaces, type PlaceLoc } from "../src/lib/personal/store-places";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const me = { lat: 12.52, lng: -70.03 };
const a: PlaceLoc = { id: "a", name: "Ling & Sons", lat: 12.5200, lng: -70.0300, source: "osm" };
const a2: PlaceLoc = { id: "a2", name: "Ling & Sons", lat: 12.5203, lng: -70.0300, source: "osm" }; // about 33 m from a
const far: PlaceLoc = { id: "far", name: "Ling & Sons", lat: 12.43, lng: -69.95, source: "osm" };
const other: PlaceLoc = { id: "o", name: "Cost-U-Less", lat: 12.52, lng: -70.03, source: "osm" };

// near duplicates merge
eq("merge", placeOptions("Ling & Sons", [a, a2, far, other], me).map((o) => o.id), ["a", "far"]);
// checked place wins the merge and ranks above OSM copies
const fixed: PlaceLoc = { id: "d", name: "Ling & Sons Food Market", lat: 12.5201, lng: -70.0301, source: "directory", fixed: true };
const withFixed = placeOptions("Ling & Sons", [a, fixed, far], me);
eq("fixed kept", withFixed.map((o) => o.id), ["d", "far"]);
eq("fixed chosen", withFixed.find((o) => o.chosen)?.id, "d");
// a far checked place still beats a nearer OSM copy
const farFixed: PlaceLoc = { ...far, id: "ff", fixed: true };
eq("far fixed wins", placeOptions("Ling & Sons", [a, farFixed], me).find((o) => o.chosen)?.id, "ff");
// your pick beats everything
eq("preferred", placeOptions("Ling & Sons", [a, { ...far, preferred: true }, fixed], me).find((o) => o.chosen)?.id, "far");
// nearest when nothing is picked or checked
eq("nearest", placeOptions("Ling & Sons", [far, a], me).find((o) => o.chosen)?.id, "a");
// no origin still works
eq("no origin", placeOptions("Ling & Sons", [a, far], null).length, 2);
eq("empty", pickPlace([]), null);
eq("map", chosenPlaces(["Ling & Sons", "Nope"], [a, far], me).get("Ling & Sons"), { lat: 12.52, lng: -70.03 });
eq("map missing", chosenPlaces(["Nope"], [a], me).size, 0);

console.log(fail ? `${fail} FAILED` : "store-places: all checks passed");
process.exit(fail ? 1 : 0);
