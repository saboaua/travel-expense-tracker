import { gmailScript } from "../src/lib/personal/gmail-script";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

const key = "0123456789abcdef0123456789abcdef";
const src = gmailScript(key, "https://app.example.com/api/email/gmail");
eq([src.includes(`const KEY = "${key}";`), src.includes('const ENDPOINT = "https://app.example.com/api/email/gmail";'), src.includes("function sendBills()")], [true, true, true], "the script holds the key, the address and the sendBills function");
let parses = true;
try { new Function(src); } catch { parses = false; }
eq(parses, true, "the script is valid JavaScript");
eq([src.includes("Authentication-Results"), src.includes("mx\\.google\\.com"), src.includes("getAttachments"), src.includes("newer_than:3d")], [true, true, true, true], "it sends Gmail's own signature check, the PDF, and only recent mail");
// a key with odd characters cannot break out of the string
const odd = gmailScript('a"; evil(); "', "https://x.y/z");
let oddParses = true; try { new Function(odd); } catch { oddParses = false; }
eq([oddParses, odd.includes('const KEY = "a\\"; evil(); \\"";')], [true, true], "the key is escaped inside the script");
process.exit(failed ? 1 : 0);
