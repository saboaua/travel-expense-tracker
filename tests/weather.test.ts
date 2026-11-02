// Run with: npx tsx tests/weather.test.ts
import { fetchWeather, formatTemp, parseCoords, skyKind, usesFahrenheit } from "../src/lib/weather";

let failed = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) failed++;
};

// Mocked providers (same JSON shapes the real APIs return)
const calls: string[] = [];
const mock = (async (url: string) => {
  calls.push(url);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  if (url.includes("open-meteo")) return json({ current: { temperature_2m: 30.6, weather_code: 2, is_day: 1 }, daily: { precipitation_probability_max: [19.6] } });
  if (url.includes("bigdatacloud")) return json({ city: "", locality: "Oranjestad", countryCode: "AW" });
  return new Response("{}", { status: 404 });
}) as unknown as typeof fetch;

(async () => {
  const w = await fetchWeather(12.52, -70.03, {}, mock);
  eq(w, { city: "Oranjestad", countryCode: "AW", tempC: 30.6, code: 2, isDay: true, rainChance: 20 }, "weather + place name from provider payloads");
  eq(calls.some((u) => u.includes("latitude=12.52&longitude=-70.03")), true, "coordinates passed to forecast");

  calls.length = 0;
  const ip = await fetchWeather(12.52, -70.03, { city: "Oranjestad", countryCode: "AW" }, mock);
  eq(ip.city, "Oranjestad", "IP hint city used");
  eq(calls.some((u) => u.includes("bigdatacloud")), false, "no reverse geocode when city is known");

  const bad = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
  let threw = false;
  try { await fetchWeather(1, 1, {}, bad); } catch { threw = true; }
  eq(threw, true, "provider error rejects");

  const geoDown = (async (url: string) =>
    url.includes("bigdatacloud") ? new Response("x", { status: 500 }) : new Response(JSON.stringify({ current: { temperature_2m: 5, weather_code: 71, is_day: 0 }, daily: { precipitation_probability_max: [null] } }))) as unknown as typeof fetch;
  const g = await fetchWeather(60, 10, {}, geoDown);
  eq([g.city, g.rainChance, g.isDay], [null, null, false], "place lookup failure still returns weather");

  eq(formatTemp(30.6, false), "31°C", "celsius rounding");
  eq(formatTemp(30, true), "86°F", "fahrenheit conversion");
  eq([usesFahrenheit("US"), usesFahrenheit("AW"), usesFahrenheit(null)], [true, false, false], "fahrenheit countries");
  eq(skyKind(0).kind, "clear", "code 0"); eq(skyKind(2).kind, "partly", "code 2"); eq(skyKind(63).kind, "rain", "code 63");
  eq(skyKind(81).kind, "rain", "code 81"); eq(skyKind(73).kind, "snow", "code 73"); eq(skyKind(95).kind, "storm", "code 95"); eq(skyKind(45).kind, "fog", "code 45");
  eq(parseCoords("12.5234", "-70.0271"), { lat: 12.52, lon: -70.03 }, "coords rounded");
  eq(parseCoords("91", "0"), null, "lat out of range");
  eq(parseCoords("abc", "0"), null, "not a number");
  eq(parseCoords(null, null), null, "missing");
  eq(parseCoords("", ""), null, "empty");
  process.exit(failed ? 1 : 0);
})();
