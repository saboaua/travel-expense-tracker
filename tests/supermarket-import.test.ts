import { mapHeaders, num, parsePlaces, splitGps } from "../src/lib/personal/supermarket-import";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("number with a comma", num("12,5186"), 12.5186);
eq("degree sign and spaces", num(" -70.0358° "), -70.0358);
eq("not a number", num("abc"), null);
eq("one GPS cell", splitGps("12.5186, -70.0358"), { lat: 12.5186, lng: -70.0358 });
eq("one GPS cell with a semicolon", splitGps("12.5186; -70.0358"), { lat: 12.5186, lng: -70.0358 });
eq("a lone number is not a point", splitGps("12.5"), null);

eq("headers in any case", mapHeaders(["NAME", "Latitude", "LONGITUDE", "Address"]).missing, []);
eq("lat and lng short names", mapHeaders(["Store", "Lat", "Lng"]).missing, []);
eq("a GPS column is enough", mapHeaders(["Name", "GPS"]).missing, []);
eq("missing columns are named", mapHeaders(["Name", "Latitude"]).missing, ["Latitude and Longitude (or one GPS column)"]);

const head = ["Name", "Latitude", "Longitude", "Address"];
const r = parsePlaces(head, [
  ["EXAMPLE Ling & Sons (delete this row)", 12.5, -70, ""],
  ["Ling & Sons", 12.5186, -70.0358, "Oranjestad"],
  ["Ling & Sons", 12.5186, -70.0358, "again"],
  ["Ling & Sons", "12,40", "-70,05", ""],
  ["Bad GPS", "x", 1, ""],
  ["Zero", 0, 0, ""],
  ["Too far", 95, 10, ""],
  ["", 12.5, -70, ""],
  [null, null, null, null],
]);
if ("error" in r) { fail++; console.error("FAIL parse", r.error); } else {
  eq("kept", r.rows.map((x) => x.name), ["Ling & Sons", "Ling & Sons"]);
  eq("second shop of the chain has its own point", r.rows[1].lat, 12.4);
  eq("address kept", r.rows[0].address, "Oranjestad");
  eq("skip counts", r.skipped, { noName: 1, badGps: 3, duplicate: 1, example: 1 });
  eq("blank rows are not counted", r.total, 8);
}
eq("one GPS column", (parsePlaces(["Name", "GPS"], [["Save More", "12.51, -70.02"]]) as { rows: { lat: number }[] }).rows[0].lat, 12.51);
eq("wrong file", "error" in (parsePlaces(["Item", "Price"], []) as object), true);

if (fail) process.exit(1);
console.log("PASS supermarket import");
