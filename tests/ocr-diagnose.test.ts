import { diagnoseAi, resetWorkingModel } from "../src/lib/ocr-ai";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const m = (name: string) => ({ name: `models/${name}`, supportedGenerationMethods: ["generateContent"] });
const realFetch = globalThis.fetch;
const mock = (list: () => Response, gen: (u: string) => Response) => {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    return u.includes("/models?") ? list() : gen(u);
  }) as typeof fetch;
};

(async () => {
  delete process.env.OCR_MODEL;
  resetWorkingModel();

  delete process.env.GEMINI_API_KEY;
  let r = await diagnoseAi();
  eq([r.keySet, r.verdict.includes("GEMINI_API_KEY is not set")], [false, true], "no key: says so");

  process.env.GEMINI_API_KEY = "secret-test-key";
  mock(() => json(200, { models: [m("gemini-3.8-flash")] }), () => json(200, { candidates: [] }));
  r = await diagnoseAi();
  eq([r.keySet, r.callStatus, r.configuredListed, r.verdict.startsWith("Working")], [true, 200, true, true], "healthy: working");
  eq(JSON.stringify(r).includes("secret-test-key"), false, "the key never appears in the answer");

  mock(() => json(200, { models: [m("gemini-4-flash")] }), () => json(404, { error: { message: "not found" } }));
  r = await diagnoseAi();
  eq([r.callStatus, r.newestModel, r.configuredListed, r.verdict.includes("gemini-4-flash")], [404, "gemini-4-flash", false, true], "retired model: names the replacement");

  mock(() => json(400, { error: { message: "API key not valid" } }), () => json(400, { error: { message: "API key not valid" } }));
  r = await diagnoseAi();
  eq(r.verdict.includes("refused the key"), true, "bad key (400): says the key was refused");

  mock(() => json(403, {}), () => json(403, { error: { message: "denied" } }));
  r = await diagnoseAi();
  eq(r.verdict.includes("refused the key"), true, "403: says the key was refused");

  mock(() => json(200, { models: [m("gemini-3.8-flash")] }), () => json(429, { error: { message: "quota" } }));
  r = await diagnoseAi();
  eq([r.callStatus, r.verdict.includes("429")], [429, true], "429: quota message");

  globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  r = await diagnoseAi();
  eq(r.verdict.includes("could not be reached"), true, "network down: says unreachable");

  globalThis.fetch = realFetch;
  console.log(failed ? `${failed} FAILED` : "all diagnose checks passed");
  process.exit(failed ? 1 : 0);
})();
