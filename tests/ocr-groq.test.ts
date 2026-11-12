import { aiOcrConfigured, extractDocumentWithAi, extractGroceryWithAi, extractReceiptWithAi, resetWorkingModel } from "../src/lib/ocr-ai";
import { groqBody, groqModels, readGroqAnswer, stripThinking } from "../src/lib/ocr-groq";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

const FULL = JSON.stringify({ store: "Shop", date: null, total: 6, currency: "USD", items: [
  { name: "Milk", quantity: 1, unit_price: 2, line_total: 2, category: "Dairy & Eggs" },
  { name: "Bread", quantity: 1, unit_price: 4, line_total: 4, category: "Bakery" },
] });
const gemini = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status: 200 });
const groq = (text: string, finish = "stop") => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: finish }] }), { status: 200 });
const img = { data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
const realFetch = globalThis.fetch;

type Seen = { url: string; init?: RequestInit };
function route(onGemini: () => Response, onGroq: (body: { model: string }) => Response, seen: Seen[]) {
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    seen.push({ url, init });
    if (url.includes("api.groq.com")) return onGroq(JSON.parse(String(init?.body)));
    return onGemini();
  }) as typeof fetch;
}
const groqCalls = (seen: Seen[]) => seen.filter((s) => s.url.includes("api.groq.com"));

// pure helpers
eq(stripThinking('<think>maybe {"a":1}</think>{"b":2}'), '{"b":2}', "thinking text is dropped");
eq(stripThinking('so {"a":1}'), 'so {"a":1}', "text without thinking is kept");
eq(readGroqAnswer({ choices: [{ message: { content: '{"x":1}' }, finish_reason: "length" }] }), { text: '{"x":1}', cut: true }, "cut-off answers are flagged");
const b = groqBody("m", "QUJD", "image/png", "read it", 6000);
eq([b.model, b.response_format, b.max_completion_tokens], ["m", { type: "json_object" }, 6000], "request: model, JSON mode, output budget");
eq((b.messages[0].content as { type: string; image_url?: { url: string } }[])[1].image_url?.url, "data:image/png;base64,QUJD", "request: the photo as a data URL");
delete process.env.GROQ_MODEL;
eq(groqModels(), ["qwen/qwen3.8-27b"], "default model");
process.env.GROQ_MODEL = " a/one , b/two ";
eq(groqModels(), ["a/one", "b/two"], "several models, in order");
delete process.env.GROQ_MODEL;

(async () => {
  process.env.GEMINI_API_KEY = "g";
  process.env.GROQ_API_KEY = "gsk_test";
  delete process.env.OCR_MODEL;

  // Gemini busy everywhere: Groq reads the grocery receipt
  resetWorkingModel();
  let seen: Seen[] = [];
  route(() => new Response("busy", { status: 503 }), () => groq(FULL), seen);
  let r = await extractGroceryWithAi(img, {});
  eq(r.items.map((i) => i.name), ["Milk", "Bread"], "Gemini busy: Groq's reading is used");
  eq(groqCalls(seen).length, 1, "Gemini busy: one call to Groq");
  const sent = groqCalls(seen)[0];
  eq((sent.init?.headers as Record<string, string>).authorization, "Bearer gsk_test", "Groq call carries the key");

  // Gemini fine: Groq is never called
  resetWorkingModel();
  seen = [];
  route(() => gemini(FULL), () => groq("{}"), seen);
  r = await extractGroceryWithAi(img, {});
  eq([r.items.length, groqCalls(seen).length], [2, 0], "Gemini answers: Groq is not called");

  // a single receipt also gets the backup
  resetWorkingModel();
  seen = [];
  route(() => new Response("no", { status: 500 }), () => groq(JSON.stringify({ merchant: "Cafe", total: 5, currency: "USD", date: null, category: null })), seen);
  const one = await extractReceiptWithAi(img, {});
  eq([one.merchant, one.amount], ["Cafe", 5], "single receipt: Groq backs it up");

  // thinking text before the JSON is ignored
  resetWorkingModel();
  seen = [];
  route(() => new Response("busy", { status: 503 }), () => groq(`<think>the total is {6}</think>${FULL}`), seen);
  r = await extractGroceryWithAi(img, {});
  eq(r.items.length, 2, "Groq answer with thinking text is parsed");

  // both fail: the error is Gemini's, so the message still points to the main reader
  resetWorkingModel();
  seen = [];
  route(() => new Response("busy", { status: 503 }), () => new Response("rate", { status: 429 }), seen);
  let msg = "";
  try { await extractGroceryWithAi(img, {}); } catch (e) { msg = (e as Error).message; }
  eq(/503/.test(msg), true, "both fail: Gemini's reason is reported");

  // Groq model gone: the next configured model is tried
  process.env.GROQ_MODEL = "old/model,new/model";
  resetWorkingModel();
  seen = [];
  const tried: string[] = [];
  route(() => new Response("busy", { status: 503 }), (body) => { tried.push(body.model); return body.model === "old/model" ? new Response("gone", { status: 404 }) : groq(FULL); }, seen);
  r = await extractGroceryWithAi(img, {});
  eq([tried, r.items.length], [["old/model", "new/model"], 2], "retired Groq model: the next one answers");
  delete process.env.GROQ_MODEL;

  // a refused Groq key stops at once (no point trying another model)
  process.env.GROQ_MODEL = "a/one,b/two";
  resetWorkingModel();
  seen = [];
  route(() => new Response("busy", { status: 503 }), () => new Response("bad key", { status: 401 }), seen);
  try { await extractGroceryWithAi(img, {}); } catch { /* expected */ }
  eq(groqCalls(seen).length, 1, "refused key: one attempt only");
  delete process.env.GROQ_MODEL;

  // passports and tickets are never sent to Groq
  resetWorkingModel();
  seen = [];
  route(() => new Response("busy", { status: 503 }), () => groq("{}"), seen);
  let docErr = "";
  try { await extractDocumentWithAi(img); } catch (e) { docErr = (e as Error).message; }
  eq([docErr !== "", groqCalls(seen).length], [true, 0], "documents: Gemini only, nothing goes to Groq");

  // no Gemini key: Groq is the reader
  delete process.env.GEMINI_API_KEY;
  resetWorkingModel();
  seen = [];
  route(() => new Response("no", { status: 500 }), () => groq(FULL), seen);
  eq(aiOcrConfigured(), true, "only a Groq key counts as configured");
  r = await extractGroceryWithAi(img, {});
  eq([r.items.length, seen.every((s) => s.url.includes("api.groq.com"))], [2, true], "no Gemini key: Groq reads, Gemini is never asked");

  // no keys at all
  delete process.env.GROQ_API_KEY;
  eq(aiOcrConfigured(), false, "no key: not configured");
  msg = "";
  try { await extractGroceryWithAi(img, {}); } catch (e) { msg = (e as Error).message; }
  eq(msg, "AI OCR is not configured", "no key: says so");

  globalThis.fetch = realFetch;
  if (failed) { console.log(`${failed} failed`); process.exit(1); }
  console.log("ocr-groq: all checks passed");
})();
