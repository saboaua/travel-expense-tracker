import { scanFields } from "../src/lib/suspicious-input";
let fail = 0;
const hit = (v: string) => scanFields({ f: v }).length > 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = g === w; if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n); };

for (const [n, v] of Object.entries({
  tautology: "' OR '1'='1", comment: "admin'--", union: "x' UNION SELECT a FROM b--", stacked: "a; DROP TABLE trips",
  sleep: "1; select pg_sleep(5)", script: "<script>alert(1)</script>", handler: "<img src=x onerror=alert(1)>",
  jsproto: "javascript:alert(1)", traversal: "../../etc/passwd", mixedcase: "' Or 1=1 --",
  urlencoded: "%27%20OR%20%271%27=%271", urlencodedScript: "%3Cscript%3Ealert(1)%3C/script%3E", plusEncoded: "'+OR+'1'='1",
  curlyQuote: "’ OR ’1’=’1", htmlEntity: "&#39; OR &#39;1&#39;=&#39;1", entityScript: "&lt;script&gt;alert(1)&lt;/script&gt;",
  doubleEncoded: "%2527%2520OR%2520%25271%2527%253D%25271",
})) eq(`detects ${n}`, hit(v), true);

for (const [n, v] of Object.entries({
  obrien: "Patrick O'Brien", amp: "Smith & Sons", hash: "Booking #4521", sentence: "Please select the union rate, I need help.",
  email: "patrick@example.com", dashes: "AUA-MIA -- return flight", percent: "Discount of 50% on 100%", badPercent: "100% sure %ZZ",
  plus: "C++ and 1+1", empty: "",
})) eq(`ignores ${n}`, hit(v), false);

eq("non-string ignored", scanFields({ a: 5 as unknown as string, b: "" }).length, 0);
eq("snippet capped", scanFields({ a: "' OR 1=1 --" + "x".repeat(500) })[0].snippet.length <= 120, true);
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
