import { shareTitle, shareLine, shareFileName, shareFooter, shareSub } from "../src/lib/personal/badge-share";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };

eq("title without a name", shareTitle("Scout"), "I'm a Scout");
eq("title with a name", shareTitle("Scout", "  Maria "), "Maria is a Scout");
eq("empty name is no name", shareTitle("Legend", "   "), "I'm a Legend");
eq("long names are cut", shareTitle("Scout", "x".repeat(80)).length, 30 + " is a Scout".length);
eq("count line", [shareLine(1), shareLine(1500)], ["1 price shared.", "1,500 prices shared."]);
eq("file name", shareFileName("Guardian", "Vifolio"), "vifolio-guardian-badge.png");
eq("the footer names the app", shareFooter("Vifolio"), "I share grocery prices on Vifolio");
eq("no prices or stores in the picture text", [shareSub, shareFooter("Vifolio")].join(" ").match(/AWG|USD|\$|store/i), null);

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("badge-share ok");
