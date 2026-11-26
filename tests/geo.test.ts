import { lastFix, rememberFix, getFix } from "../src/lib/geo";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
let asked = 0;
Object.defineProperty(globalThis, "navigator", { value: { geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => { asked++; setTimeout(() => ok({ coords: { latitude: 12.5, longitude: -70 } }), 5); } } }, configurable: true });

(async () => {
  eq("nothing known yet", lastFix(), null);
  // two screens ask at once: one question
  const [a, b] = await Promise.all([getFix(), getFix()]);
  eq("one question for two screens", asked, 1);
  eq("both get the place", [a?.lat, b?.lng], [12.5, -70]);
  // the next screen is not asked at all
  const c = await getFix();
  eq("a recent fix is used without asking", [asked, c?.lat], [1, 12.5]);
  // an old fix is not used
  eq("an old fix is dropped", lastFix(10 * 60_000, Date.now() + 11 * 60_000), null);
  store.set("lifolio:last-fix", "{nonsense");
  eq("a broken fix is ignored", lastFix(), null);
  rememberFix(95, 0);
  eq("an impossible place is ignored", lastFix(), null);
  console.log(fail ? `${fail} FAILED` : "geo: all checks passed");
  process.exit(fail ? 1 : 0);
})();
