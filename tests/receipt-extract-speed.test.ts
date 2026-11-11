import { extractGroceryReceipt, type LateUpdate } from "../src/lib/receipt-extract";

// The first reading must come back as soon as the AI answers, however slow the on-device reader or the second look are.
const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};
const item = (name: string, t: number) => ({ name, quantity: 1, unit_price: t, line_total: t, category: "Other", unit: null });
const scan = { store: "Shop", date: null, total: 5.59, currency: "USD", source: "ai", items: [item("Milk", 2.49), item("Bread", 8.1)] };
process.on("uncaughtException", () => {}); // tesseract cannot download its language file in this sandbox; the on-device reader is meant to fail quietly here
const realFetch = globalThis.fetch;
const modes: string[] = [];

(async () => {
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    const mode = String((init?.body as FormData).get("mode"));
    modes.push(mode);
    if (mode === "grocery") return new Response(JSON.stringify({ result: scan }), { status: 200 });
    await new Promise((r) => setTimeout(r, 3000)); // the second look is slow
    return new Response(JSON.stringify({ result: { ...scan, items: [item("Milk", 2.49), item("Bread", 3.1)] } }), { status: 200 });
  }) as typeof fetch;

  const later: LateUpdate[] = [];
  const t0 = Date.now();
  const r = await extractGroceryReceipt(new File([new Uint8Array([1, 2, 3])], "r.jpg", { type: "image/jpeg" }), { currency: "USD" }, (u) => later.push(u));
  const took = Date.now() - t0;
  eq([r.items.length, r.source, took < 1000], [2, "ai", true], `first reading returned without waiting (${took} ms)`);
  eq(r.check?.ok, false, "its problem is already known when it arrives");
  eq(modes, ["grocery", "grocery-recheck"], "the second look is requested only because the numbers do not add up");
  await new Promise((r2) => setTimeout(r2, 3500));
  const ai = later.find((u) => u.from === "ai");
  eq([ai?.alts, Object.keys(ai?.flags ?? {})], [{ 1: 3.1 }, ["1"]], "the second look arrives later as a suggestion for the row");
  eq(r.items[1].line_total, 8.1, "the value on the row is not changed by it");

  globalThis.fetch = realFetch;
  process.exit(process.exitCode ? 1 : 0);
})();
