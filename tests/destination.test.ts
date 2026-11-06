// Run with: npx tsx tests/destination.test.ts
import { WIKI_THUMB_SIZE, WIKI_THUMB_STEPS } from "../src/lib/destination";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
eq(WIKI_THUMB_STEPS.includes(WIKI_THUMB_SIZE), true, "destination photo width is one Wikimedia serves (an odd width such as 1400 is refused and the photo breaks)");

import { isAllowedPhotoUrl, photoProxyUrl } from "../src/lib/destination";
const ok = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Panama.jpg/1280px-Panama.jpg";
eq(isAllowedPhotoUrl(ok), true, "a Wikimedia picture address is accepted");
eq(isAllowedPhotoUrl("http://upload.wikimedia.org/x.jpg"), false, "plain http refused");
eq(isAllowedPhotoUrl("https://evil.example/x.jpg"), false, "other hosts refused");
eq(isAllowedPhotoUrl("https://upload.wikimedia.org.evil.example/x.jpg"), false, "look-alike host refused");
eq(isAllowedPhotoUrl("https://user:pw@upload.wikimedia.org/x.jpg"), false, "credentials in the address refused");
eq(isAllowedPhotoUrl("https://upload.wikimedia.org:8443/x.jpg"), false, "other port refused");
eq(isAllowedPhotoUrl("//upload.wikimedia.org/x.jpg"), false, "not an absolute address");
eq(isAllowedPhotoUrl(null), false, "missing refused");
eq(photoProxyUrl(ok).startsWith("/api/destination-photo?u=https%3A%2F%2Fupload.wikimedia.org"), true, "proxy address encodes the original");

const thumb = "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/Panama.jpeg/1280px-Panama.jpeg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail";
eq(isAllowedPhotoUrl(thumb), true, "thumb.wikimedia.org (where Wikipedia now serves thumbnails) is accepted");
eq(isAllowedPhotoUrl("https://thumb.wikimedia.org.evil.example/x.png"), false, "look-alike thumb host refused");
import { buildCsp } from "../src/lib/csp";
const csp = buildCsp({ nonce: "x", supabaseUrl: "https://abc.supabase.co" });
eq(/img-src[^;]*thumb\.wikimedia\.org/.test(csp) && /img-src[^;]*upload\.wikimedia\.org/.test(csp), true, "page policy lets images load from both Wikimedia picture hosts");
