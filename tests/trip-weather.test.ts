import { fetchTripDays, findPlace, forecastWindow, placeQueries, weatherTip, type TripDay } from "../src/lib/trip-weather";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

// which days to show
eq(forecastWindow("2026-11-17", "2026-11-20", "2026-11-11"), { status: "ok", start: "2026-11-17", end: "2026-11-20" }, "a trip next week: exactly the trip dates");
eq(forecastWindow("2026-11-18", "2026-12-10", "2026-11-11"), { status: "ok", start: "2026-11-18", end: "2026-11-24" }, "a long trip: the first 7 days");
eq(forecastWindow("2026-11-17", "2026-11-20", "2026-11-19"), { status: "ok", start: "2026-11-19", end: "2026-11-20" }, "in progress: today to the end");
eq(forecastWindow("2026-11-17", "2026-11-20", "2026-11-21"), { status: "past" }, "finished trip: nothing");
eq(forecastWindow("2026-11-17", null, "2026-11-17"), { status: "ok", start: "2026-11-17", end: "2026-11-17" }, "no end date: the start day");
eq(forecastWindow("2026-12-21", "2026-12-25", "2026-11-11"), { status: "early", opensOn: "2026-12-06" }, "too far ahead: says when it opens");
eq(forecastWindow("2026-11-26", "2026-11-30", "2026-11-11"), { status: "ok", start: "2026-11-26", end: "2026-11-26" }, "the forecast reaches 16 days: later days are left out");
eq(forecastWindow("2026-11-27", "2026-11-30", "2026-11-11"), { status: "early", opensOn: "2026-11-12" }, "first day just out of reach");
eq(forecastWindow("2026-11-20", "2026-11-15", "2026-11-11"), { status: "ok", start: "2026-11-20", end: "2026-11-20" }, "an end before the start counts as one day");

// place search spellings
eq(placeQueries("Panama City, Panama"), ["Panama City, Panama", "Panama City", "Panama"], "full text, then first part, then last part");
eq(placeQueries("  Panama "), ["Panama"], "one word");
eq(placeQueries(""), [], "empty");

const geo = (results: unknown) => new Response(JSON.stringify({ results }), { status: 200 });
(async () => {
  const seen: string[] = [];
  const f1 = (async (u: string | URL | Request) => { seen.push(String(u)); return String(u).includes("Panama%20City%2C") ? geo(undefined) : geo([{ name: "Panama City", country_code: "PA", latitude: 8.9936, longitude: -79.5197 }]); }) as typeof fetch;
  eq(await findPlace("Panama City, Panama", f1), { name: "Panama City", countryCode: "PA", lat: 8.99, lon: -79.52 }, "falls back to the first part when the full text finds nothing");
  eq(seen.length, 2, "two searches were needed");
  eq(await findPlace("Nowhereville", (async () => geo(undefined)) as typeof fetch), null, "nothing found");
  eq(await findPlace("Panama", (async () => new Response("no", { status: 500 })) as typeof fetch), null, "search down: null, no crash");

  let url = "";
  const f2 = (async (u: string | URL | Request) => { url = String(u); return new Response(JSON.stringify({ daily: { time: ["2026-11-17", "2026-11-18", "2026-11-19"], weather_code: [61, 95, null], temperature_2m_max: [31.2, 32, 30], temperature_2m_min: [24, 24.4, null], precipitation_probability_max: [60, 70.4, 20] } }), { status: 200 }); }) as typeof fetch;
  const days = await fetchTripDays({ name: "Panama City", countryCode: "PA", lat: 8.99, lon: -79.52 }, "2026-11-17", "2026-11-19", f2);
  eq(days, [{ date: "2026-11-17", code: 61, hi: 31.2, lo: 24, rain: 60 }, { date: "2026-11-18", code: 95, hi: 32, lo: 24.4, rain: 70 }], "days parsed; a day with a missing temperature is left out");
  eq(/start_date=2026-11-17&end_date=2026-11-19/.test(url), true, "asks only for the trip dates");

  // the sentence on top
  const d = (date: string, rain: number): TripDay => ({ date, code: 61, hi: 31, lo: 24, rain });
  eq(weatherTip([d("2026-11-17", 60), d("2026-11-18", 70), d("2026-11-19", 80), d("2026-11-20", 60)]), "Pack a rain jacket: rain likely on all 4 days", "rain every day");
  eq(weatherTip([d("2026-11-18", 70), d("2026-11-19", 80), d("2026-11-20", 30)]), "Pack a rain jacket: rain likely on 2 of 3 days", "rain some days");
  eq(weatherTip([d("2026-11-18", 20), d("2026-11-19", 80)]), "Rain likely on Thursday", "one rainy day is named");
  eq(weatherTip([d("2026-11-19", 80), d("2026-11-20", 10)], "2026-11-19"), "Rain likely today", "one rainy day that is today");
  eq(weatherTip([d("2026-11-18", 10), d("2026-11-19", 20)]), null, "dry: no sentence");
  eq(weatherTip([d("2026-11-18", 90)]), "Rain likely", "a one-day trip");
  eq(weatherTip([]), null, "no days");

  if (failed) { console.log(`${failed} failed`); process.exit(1); }
  console.log("trip-weather: all checks passed");
})();
