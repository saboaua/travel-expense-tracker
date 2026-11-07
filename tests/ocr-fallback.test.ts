import { extractDocumentWithAi, fallbackModels, resetWorkingModel } from "../src/lib/ocr-ai";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const gc = ["generateContent"];
const m = (name: string) => ({ name: `models/${name}`, supportedGenerationMethods: gc });
const ok = { candidates: [{ content: { parts: [{ text: '{"kind":"license","document_number":"DA0546795","issuing_country":"Aruba","expiry_date":"2031-03-13"}' }] } }] };
const LIST = { models: [m("gemini-3.8-flash"), m("gemini-2.5-flash"), m("gemini-3-flash-preview"), m("gemini-3.1-flash-lite-preview"), m("gemini-3.8-flash-image"), m("gemini-3.8-flash-tts")] };

eq(fallbackModels(LIST.models), ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"], "fallback order: stable, then preview, then lite; no image or tts");

const realFetch = globalThis.fetch;
const img = { data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
const calls: string[] = [];
const run = (handler: (model: string) => Response | "hang") => {
  calls.length = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/models?")) { calls.push("list"); return json(200, LIST); }
    const model = u.match(/models\/([^:]+):/)![1];
    calls.push(model);
    const r = handler(model);
    if (r === "hang") throw new DOMException("timed out", "TimeoutError");
    return r;
  }) as typeof fetch;
};

(async () => {
  process.env.GEMINI_API_KEY = "test";
  delete process.env.OCR_MODEL;

  resetWorkingModel();
  run((model) => (model === "gemini-3.8-flash" ? json(503, { error: { message: "busy" } }) : model === "gemini-2.5-flash" ? json(404, {}) : json(200, ok)));
  let f = await extractDocumentWithAi(img);
  eq(f.document_number, "DA0546795", "busy model: still read, by a fallback");
  eq(calls, ["gemini-3.8-flash", "list", "gemini-2.5-flash", "gemini-3-flash-preview"], "busy model: skips retired ones, ends on the preview model");
  await extractDocumentWithAi(img);
  eq(calls.slice(4), ["gemini-3-flash-preview"], "later reads go straight to the model that worked");

  resetWorkingModel();
  run((model) => (model === "gemini-3.8-flash" ? "hang" : json(200, ok)));
  f = await extractDocumentWithAi(img);
  eq([f.document_number, calls[0], calls.includes("gemini-2.5-flash") || calls.includes("gemini-3-flash-preview")], ["DA0546795", "gemini-3.8-flash", true], "no answer in time: falls back");

  resetWorkingModel();
  run(() => json(401, { error: { message: "bad key" } }));
  let msg = "";
  try { await extractDocumentWithAi(img); } catch (e) { msg = (e as Error).message; }
  eq([msg.includes("(401)"), calls], [true, ["gemini-3.8-flash"]], "bad key: fails at once with 401, no fallback");

  resetWorkingModel();
  run(() => json(503, {}));
  msg = "";
  try { await extractDocumentWithAi(img); } catch (e) { msg = (e as Error).message; }
  eq(msg.includes("(503)"), true, "everything busy: the error says 503");

  globalThis.fetch = realFetch;
  console.log(failed ? `${failed} FAILED` : "all fallback checks passed");
  process.exit(failed ? 1 : 0);
})();
