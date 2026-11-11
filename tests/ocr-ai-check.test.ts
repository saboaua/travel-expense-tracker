import { extractGroceryChecked, recheckGroceryWithAi, resetWorkingModel } from "../src/lib/ocr-ai";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const answer = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] }), { status: 200, headers: { "content-type": "application/json" } });
const item = (name: string, line_total: number) => ({ name, quantity: 1, unit_price: line_total, line_total, category: "Other" });
const img = { data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
const realFetch = globalThis.fetch;

(async () => {
  process.env.GEMINI_API_KEY = "test";
  delete process.env.OCR_MODEL;

  const WRONG = { store: "Shop", total: 5.59, items: [item("Milk", 2.49), item("Bread", 8.1)] };
  const FIXED = { store: "Shop", total: 5.59, items: [item("Milk", 2.49), item("Bread", 3.1)] };

  // the first read is one request and is checked without any waiting
  resetWorkingModel();
  const prompts: string[] = [];
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    prompts.push(JSON.parse(String(init?.body)).contents[0].parts[1].text);
    return answer(WRONG);
  }) as typeof fetch;
  let r = await extractGroceryChecked(img, {});
  eq([prompts.length, r.refined ?? false, r.check?.ok, r.check?.issues[0]], [1, false, false, "The items add up to 10.59, 5.00 more than the receipt total."], "first read: one request, problem reported, no second look inside it");

  // second look: told the problem, shown the first reading, returns a better one
  resetWorkingModel();
  prompts.length = 0;
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    prompts.push(JSON.parse(String(init?.body)).contents[0].parts[1].text);
    return answer(FIXED);
  }) as typeof fetch;
  const first = await extractGroceryChecked(img, {}).then((x) => ({ ...x, items: WRONG.items.map((i) => ({ ...i, category: "Other", unit: null })) }));
  prompts.length = 0;
  let better = await recheckGroceryWithAi(img, {}, first);
  eq([better?.refined, better?.items.map((i) => i.line_total), better?.check?.ok], [true, [2.49, 3.1], true], "second look fixes the price");
  eq([prompts.length, prompts[0].includes("add up to 10.59"), prompts[0].includes('"line_total":8.1')], [1, true, true], "second look is told the problem and shown the first reading");

  // a receipt that adds up gets no second look at all
  resetWorkingModel();
  prompts.length = 0;
  better = await recheckGroceryWithAi(img, {}, { ...first, items: FIXED.items.map((i) => ({ ...i, category: "Other", unit: null })) });
  eq([better, prompts.length], [null, 0], "adds up: nothing is asked");

  // second look no better, or failing: nothing is offered
  resetWorkingModel();
  globalThis.fetch = (async () => answer({ store: "Shop", total: 5.59, items: [item("Milk", 9.49), item("Bread", 8.1)] })) as typeof fetch;
  eq(await recheckGroceryWithAi(img, {}, first), null, "second look no better: nothing offered");
  resetWorkingModel();
  globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  eq(await recheckGroceryWithAi(img, {}, first), null, "second look errors: nothing offered");

  // subtotal and tax are read from the receipt
  resetWorkingModel();
  globalThis.fetch = (async () => answer({ store: "Shop", total: 5.93, subtotal: 5.59, tax: 0.34, items: [item("Milk", 2.49), item("Bread", 3.1)] })) as typeof fetch;
  r = await extractGroceryChecked(img, {});
  eq([r.subtotal, r.tax, r.check?.ok], [5.59, 0.34, true], "subtotal and tax explain the total");

  globalThis.fetch = realFetch;
  console.log(failed ? `${failed} FAILED` : "all AI check tests passed");
  process.exit(failed ? 1 : 0);
})();
