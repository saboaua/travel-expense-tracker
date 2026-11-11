import { extractGroceryWithAi, resetWorkingModel } from "../src/lib/ocr-ai";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const answer = (text: string, finishReason = "STOP") =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }), { status: 200, headers: { "content-type": "application/json" } });

const FULL = JSON.stringify({ store: "Shop", date: null, total: 6, currency: "USD", items: [
  { name: "Milk", quantity: 1, unit_price: 2, line_total: 2, category: "Dairy & Eggs" },
  { name: "Bread", quantity: 1, unit_price: 4, line_total: 4, category: "Bakery" },
] });
const CUT = FULL.slice(0, FULL.indexOf('"name":"Bread"') + 12); // cut inside the second item
const img = { data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
const realFetch = globalThis.fetch;

(async () => {
  process.env.GEMINI_API_KEY = "test";
  delete process.env.OCR_MODEL;

  // cut off once, complete on the second try with a bigger budget
  resetWorkingModel();
  const budgets: number[] = [];
  let n = 0;
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    budgets.push(JSON.parse(String(init?.body)).generationConfig.maxOutputTokens);
    return n++ === 0 ? answer(CUT, "MAX_TOKENS") : answer(FULL);
  }) as typeof fetch;
  let r = await extractGroceryWithAi(img, {});
  eq(r.items.map((i) => i.name), ["Milk", "Bread"], "cut-off answer: second try returns every item");
  eq([budgets.length, budgets[1] > budgets[0]], [2, true], "cut-off answer: second try has a bigger output budget");

  // cut off both times: the complete items of the cut answer are still kept
  resetWorkingModel();
  globalThis.fetch = (async () => answer(CUT, "MAX_TOKENS")) as typeof fetch;
  r = await extractGroceryWithAi(img, {});
  eq([r.items.map((i) => i.name), r.total], [["Milk"], 6], "always cut off: keeps the items that were complete");

  // unreadable once (no JSON), fine the second time
  resetWorkingModel();
  n = 0;
  globalThis.fetch = (async () => (n++ === 0 ? answer("Sorry, I cannot help") : answer(FULL))) as typeof fetch;
  r = await extractGroceryWithAi(img, {});
  eq(r.items.length, 2, "no JSON once: asks again");

  // never JSON: fails so the on-device reader takes over
  resetWorkingModel();
  globalThis.fetch = (async () => answer("nothing")) as typeof fetch;
  let msg = "";
  try { await extractGroceryWithAi(img, {}); } catch (e) { msg = (e as Error).message; }
  eq(msg, "AI OCR returned no JSON", "never JSON: error, so basic OCR is used");

  globalThis.fetch = realFetch;
  console.log(failed ? `${failed} FAILED` : "all retry checks passed");
  process.exit(failed ? 1 : 0);
})();
