import { buildCsp, cspHeaderName, makeNonce, summarizeReport } from "../src/lib/csp";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)}`); };
const dir = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(name + " ")) || "";

const prod = buildCsp({ nonce: "abc123", supabaseUrl: "https://xyz.supabase.co/" });
eq("script has nonce + strict-dynamic", /'nonce-abc123' 'strict-dynamic'/.test(dir(prod, "script-src")), true);
eq("scripts never allow unsafe-inline", dir(prod, "script-src").includes("unsafe-inline"), false);
eq("no unsafe-eval in production", prod.includes("'unsafe-eval'"), false);
eq("no CDN hosts", /jsdelivr|unpkg|cdnjs|projectnaptha/.test(prod), false);
eq("supabase origin only for connect", dir(prod, "connect-src"), "connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
eq("images: supabase + wikimedia", dir(prod, "img-src"), "img-src 'self' data: blob: https://xyz.supabase.co https://upload.wikimedia.org https://thumb.wikimedia.org");
eq("pdf frames from supabase", dir(prod, "frame-src"), "frame-src https://xyz.supabase.co");
eq("worker from self/blob", dir(prod, "worker-src"), "worker-src 'self' blob:");
eq("no plugins", dir(prod, "object-src"), "object-src 'none'");
eq("cannot be framed", dir(prod, "frame-ancestors"), "frame-ancestors 'none'");
eq("form/base locked", [dir(prod, "form-action"), dir(prod, "base-uri")], ["form-action 'self'", "base-uri 'self'"]);
eq("upgrade insecure in prod", prod.includes("upgrade-insecure-requests"), true);
eq("reports to endpoint", prod.includes("report-uri /api/csp-report") && prod.includes("report-to csp"), true);

const dev = buildCsp({ nonce: "n", dev: true, supabaseUrl: "http://127.0.0.1:54321" });
eq("dev allows eval + ws for hot reload", dir(dev, "script-src").includes("'unsafe-eval'") && dir(dev, "connect-src").includes("ws:"), true);
eq("dev has no upgrade-insecure", dev.includes("upgrade-insecure-requests"), false);
eq("local supabase ws variant", dir(dev, "connect-src").includes("ws://127.0.0.1:54321"), true);

const noUrl = buildCsp({ nonce: "n", supabaseUrl: "not a url" });
eq("bad supabase url falls back to wildcard", dir(noUrl, "connect-src").includes("https://*.supabase.co"), true);

eq("nonce is base64", /^[A-Za-z0-9+/]+=*$/.test(makeNonce()), true);
eq("nonces differ", makeNonce() === makeNonce(), false);
eq("report-only by default", cspHeaderName(false), "Content-Security-Policy-Report-Only");
eq("enforce header", cspHeaderName(true), "Content-Security-Policy");

// report parsing
eq("legacy report", summarizeReport({ "csp-report": { "violated-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js", "document-uri": "https://app/x" } })?.blocked, "https://evil.example/x.js");
eq("reporting api array", summarizeReport([{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://cdn.example/a.png", documentURL: "https://app/", disposition: "report" } }])?.directive, "img-src");
eq("junk", summarizeReport({ hello: 1 }), null);
eq("null", summarizeReport(null), null);
eq("long values capped", (summarizeReport({ "csp-report": { "violated-directive": "x", "blocked-uri": "a".repeat(5000) } })?.blocked || "").length, 200);
// Turnstile hosts are only allowed when the CAPTCHA is configured
{
  const off = buildCsp({ nonce: "n", supabaseUrl: "https://x.supabase.co" });
  const on = buildCsp({ nonce: "n", supabaseUrl: "https://x.supabase.co", turnstile: true });
  const ok = !off.includes("challenges.cloudflare.com") && on.includes("frame-src https://x.supabase.co https://challenges.cloudflare.com") && /connect-src[^;]*challenges\.cloudflare\.com/.test(on);
  console.log(ok ? "PASS" : "FAIL", "turnstile host only when configured");
  if (!ok) fail++;
}

console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
