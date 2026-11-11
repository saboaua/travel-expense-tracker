import { extractGroceryChecked, resetWorkingModel } from "../src/lib/ocr-ai";

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

  // first reading misreads 3.10 as 8.10; the second look fixes it
  resetWorkingModel();
  const prompts: string[] = [];
  let n = 0;
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    prompts.push(body.contents[0].parts[1].text);
    return n++ === 0
      ? answer({ store: "Shop", total: 5.59, items: [item("Milk", 2.49), item("Bread", 8.1)] })
      : answer({ store: "Shop", total: 5.59, items: [item("Milk", 2.49), item("Bread", 3.1)] });
  }) as typeof fetch;
  let r = await extractGroceryChecked(img, {});
  eq([r.refined, r.items.map((i) => i.line_total), r.check?.ok], [true, [2.49, 3.1], true], "numbers did not add up: second look fixes the price");
  eq([prompts.length, prompts[1].includes("add up to 10.59"), prompts[1].includes('"line_total":8.1')], [2, true, true], "the second look is told the problem and shown the first reading");

  // a receipt that adds up is read once
  resetWorkingModel();
  prompts.length = 0;
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    prompts.push(JSON.parse(String(init?.body)).contents[0].parts[1].text);
    return answer({ store: "Shop", total: 5.59, items: [item("Milk", 2.49), item("Bread", 3.1)] });
  }) as typeof fetch;
  r = await extractGroceryChecked(img, {});
  eq([prompts.length, r.refined ?? false, r.check?.ok], [1, false, true], "adds up: no second look");

  // second look is worse: the first reading stays
  resetWorkingModel();
  n = 0;
  globalThis.fetch = (async () => (n++ === 0
    ? answer({ store: "Shop", total: 5.59, items: [item("Milk", 2.49), item("Bread", 8.1)] })
    : answer({ store: "Shop", total: 5.59, items: [item("Milk", 9.49), item("Bread", 8.1)] }))) as typeof fetch;
  r = await extractGroceryChecked(img, {});
  eq([r.refined ?? false, r.items.map((i) => i.line_total)], [false, [2.49, 8.1]], "second look no better: first reading kept");

  // second look fails outright: first reading kept
  resetWorkingModel();
  n = 0;
  globalThis.fetch = (async () => (n++ === 0 ? answer({ store: "Shop", total: 5.59, items: [item("Milk", 2.49), item("Bread", 8.1)] }) : new Response("{}", { status: 401 }))) as typeof fetch;
  r = await extractGroceryChecked(img, {});
  eq([r.refined ?? false, r.items.length, r.check?.ok], [false, 2, false], "second look errors: first reading kept, flagged not ok");

  // subtotal and tax are read from the receipt
  resetWorkingModel();
  globalThis.fetch = (async () => answer({ store: "Shop", total: 5.93, subtotal: 5.59, tax: 0.34, items: [item("Milk", 2.49), item("Bread", 3.1)] })) as typeof fetch;
  r = await extractGroceryChecked(img, {});
  eq([r.subtotal, r.tax, r.check?.ok], [5.59, 0.34, true], "subtotal and tax explain the total");

  globalThis.fetch = realFetch;
  console.log(failed ? `${failed} FAILED` : "all AI check tests passed");
  process.exit(failed ? 1 : 0);
})();
