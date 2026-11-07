import { pickModel, resetWorkingModel, extractDocumentWithAi } from "../src/lib/ocr-ai";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const gc = ["generateContent"];
const m = (name: string, methods = gc) => ({ name: `models/${name}`, supportedGenerationMethods: methods });

/* ---- picking from Google's list ---- */
eq(pickModel([m("gemini-2.5-flash"), m("gemini-3-flash"), m("gemini-3-pro")]), "gemini-3-flash", "pick: newest stable Flash");
eq(pickModel([m("gemini-3-flash-preview"), m("gemini-2.5-flash"), m("gemini-2.5-flash-lite"), m("gemini-2.5-flash-image"), m("gemini-flash-latest")]), "gemini-2.5-flash", "pick: skips preview, lite, image and alias names");
eq(pickModel([m("gemini-2.5-flash", ["embedContent"])]), null, "pick: needs generateContent");
eq(pickModel([m("gemini-2.5-pro"), m("embedding-001")]), null, "pick: none when there is no Flash model");
eq(pickModel([]), null, "pick: empty list");

/* ---- a retired model: asks which models exist, retries, remembers ---- */
const realFetch = globalThis.fetch;
const calls: string[] = [];
const okBody = { candidates: [{ content: { parts: [{ text: '{"kind":"license","document_number":"DA0546795","issuing_country":"Aruba","expiry_date":"2031-03-13","holder_name":"Patrick Giovanni Fortin"}' }] } }] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (url: string | URL | Request) => {
  const u = String(url);
  calls.push(u.replace("https://generativelanguage.googleapis.com/v1beta/", ""));
  if (u.includes("/models?")) return json(200, { models: [m("gemini-3.8-flash"), m("gemini-4-flash")] });
  if (u.includes("models/gemini-3.8-flash:")) return json(404, { error: { message: "models/gemini-3.8-flash is not found" } });
  if (u.includes("models/gemini-4-flash:")) return json(200, okBody);
  return json(500, {});
}) as typeof fetch;

(async () => {
  process.env.GEMINI_API_KEY = "test";
  delete process.env.OCR_MODEL;
  resetWorkingModel();
  const img = { data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
  const f = await extractDocumentWithAi(img);
  eq([f.kind, f.document_number, f.expiry_date, f.issuing_country], ["license", "DA0546795", "2031-03-13", "Aruba"], "retired model: the document is still read");
  eq(calls, ["models/gemini-3.8-flash:generateContent", "models?pageSize=200", "models/gemini-4-flash:generateContent"], "retired model: tries, lists models, retries with the newest");
  calls.length = 0;
  await extractDocumentWithAi(img);
  eq(calls, ["models/gemini-4-flash:generateContent"], "later reads go straight to the model that worked");

  /* ---- a 404 with nothing to switch to still fails clearly ---- */
  resetWorkingModel();
  calls.length = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/models?")) return json(200, { models: [] });
    return json(404, { error: { message: "not found" } });
  }) as typeof fetch;
  let msg = "";
  try { await extractDocumentWithAi(img); } catch (e) { msg = (e as Error).message; }
  eq(msg.includes("(404)"), true, "no replacement: the error still says 404");

  globalThis.fetch = realFetch;
  console.log(failed ? `${failed} FAILED` : "all ocr model checks passed");
  process.exit(failed ? 1 : 0);
})();
