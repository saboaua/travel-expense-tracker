import { directionsUrl, hotelOf } from "../src/lib/hotel";

const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};

eq(hotelOf(null), null, "no row");
eq(hotelOf({ hotel_name: " ", hotel_address: "" }), null, "blank fields mean no hotel");
eq(hotelOf({ hotel_name: "Courtyard Marriott", hotel_address: "Multiplaza Mall, Ave. Israel, Panama" }), { name: "Courtyard Marriott", address: "Multiplaza Mall, Ave. Israel, Panama" }, "name and address");
eq(hotelOf({ hotel_name: null, hotel_address: "Calle 52, Panama" }), { name: "Calle 52, Panama", address: null }, "address alone becomes the name");
eq(
  directionsUrl({ name: "Courtyard Marriott", address: "Multiplaza Mall, Ave. Israel, Panama" }),
  "https://www.google.com/maps/dir/?api=1&destination=Courtyard%20Marriott%2C%20Multiplaza%20Mall%2C%20Ave.%20Israel%2C%20Panama",
  "directions link",
);
eq(directionsUrl({ name: "Hotel X", address: null }), "https://www.google.com/maps/dir/?api=1&destination=Hotel%20X", "name only");
