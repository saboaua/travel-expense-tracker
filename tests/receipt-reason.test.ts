// Run with: npx tsx tests/receipt-reason.test.ts
import { aiFallbackText, howRead } from "../src/lib/receipt-extract";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
eq(howRead({ source: "ai" }), "AI", "AI reads say AI");
eq(howRead({ source: "tesseract" }), "basic OCR", "basic OCR with no reason says basic OCR");
eq(/GEMINI_API_KEY is not set/.test(howRead({ source: "tesseract", aiReason: "not_configured" })), true, "a missing key is named");
eq(/OCR_MODEL/.test(aiFallbackText("ai_failed_404")), true, "a 404 points at OCR_MODEL");
eq(/refused \(401\)/.test(aiFallbackText("ai_failed_401")), true, "a 401 says the key was refused");
eq(/rate or credit/.test(aiFallbackText("ai_failed_429")), true, "a 429 says rate or credit");
eq(/error \(500\)/.test(aiFallbackText("ai_failed_500")), true, "other codes show the number");
eq(aiFallbackText("offline"), "no connection to the AI reader", "offline is explained");
eq(aiFallbackText(undefined), "", "no reason, no text");
