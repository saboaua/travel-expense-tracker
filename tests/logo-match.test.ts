import { cleanDomain, fitSquare, isLogoData, matchLogo, norm, parseKeywords, type LibraryLogo } from "../src/lib/logo-match";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const L = (id: string, name: string, keywords: string[] = []): LibraryLogo => ({ id, name, keywords, logo: "data:image/png;base64,AAAA" });
const lib = [L("sp", "Spotify", ["spotify premium"]), L("am", "Amazon", ["amazon prime"]), L("pv", "Prime Video", ["amazon prime video"]), L("cl", "Claude", ["anthropic"]), L("d", "Disney+", ["disney plus"])];
const id = (n: string) => matchLogo(n, lib)?.id ?? null;

eq("norm", norm("  Spotify  Premium! "), "spotify premium");
eq("norm accents and &", norm("Café & Bar"), "cafe and bar");
eq("exact", id("Spotify"), "sp");
eq("case", id("SPOTIFY"), "sp");
eq("family plan", id("Spotify Family"), "sp");
eq("in the middle", id("My Spotify plan"), "sp");
eq("not part of a word", id("Spotifyx"), null);
eq("keyword", id("Anthropic API"), "cl");
eq("claude pro plan", id("Claude Pro Plan"), "cl");
eq("longest phrase wins", id("Amazon Prime Video"), "pv");
eq("plain amazon", id("Amazon"), "am");
eq("plus sign name", id("Disney+"), "d");
eq("keyword with plus spelled out", id("Disney Plus Hotstar"), "d");
eq("nothing", id("Aruba Water"), null);
eq("empty", id("   "), null);
eq("empty library", matchLogo("Spotify", []), null);
eq("one letter terms are ignored", matchLogo("A B", [L("x", "A")]), null);

eq("keywords parse", parseKeywords("disney plus, Disney Premium ,, disney plus;\nhotstar"), ["disney plus", "Disney Premium", "hotstar"]);
eq("keywords cap", parseKeywords(Array.from({ length: 30 }, (_, i) => `k${i}`).join(",")).length, 12);

eq("domain plain", cleanDomain("spotify.com"), "spotify.com");
eq("domain url", cleanDomain("https://www.Spotify.com/en/x?y=1"), "spotify.com");
eq("domain port", cleanDomain("http://example.org:8080/a"), "example.org");
eq("domain subdomain", cleanDomain("music.apple.com"), "music.apple.com");
eq("domain no dot", cleanDomain("spotify"), null);
eq("domain spaces", cleanDomain("my site.com"), null);
eq("domain junk", cleanDomain("javascript:alert(1)"), null);
eq("domain empty", cleanDomain(""), null);
eq("domain dash edge", cleanDomain("-a.com"), null);

eq("logo data ok", isLogoData("data:image/png;base64,iVBORw0KGgo="), true);
eq("logo data svg ok", isLogoData("data:image/svg+xml;base64,PHN2Zz4="), true);
eq("logo data not base64", isLogoData("data:image/png,hello"), false);
eq("logo data other type", isLogoData("data:text/html;base64,AAAA"), false);
eq("logo data too big", isLogoData("data:image/png;base64," + "A".repeat(80_000)), false);
eq("logo data not a string", isLogoData(null), false);

eq("fit wide", fitSquare(200, 100, 96), [96, 48, 0, 24]);
eq("fit tall", fitSquare(100, 200, 96), [48, 96, 24, 0]);
eq("fit square", fitSquare(50, 50, 96), [96, 96, 0, 0]);
eq("fit bad size", fitSquare(0, 0, 96), [96, 96, 0, 0]);

if (fail) process.exit(1);
console.log("logo-match tests passed");
