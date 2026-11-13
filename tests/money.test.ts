import { convert, convertedCount, dominantCurrency } from "../src/lib/personal/money";
let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("the currency used more often wins", dominantCurrency([{ currency: "USD" }, { currency: "USD" }, { currency: "AWG" }]), "USD");
eq("a tie is AWG", dominantCurrency([{ currency: "USD" }, { currency: "AWG" }]), "AWG");
eq("nothing is AWG", dominantCurrency([]), "AWG");
eq("other currencies are not counted", dominantCurrency([{ currency: "EUR" }, { currency: "EUR" }, { currency: "USD" }]), "USD");
eq("converted count only counts AWG and USD in the other currency", convertedCount([{ currency: "USD" }, { currency: "AWG" }, { currency: "EUR" }], "AWG"), 1);
eq("USD to AWG at the peg", convert(100, "USD", "AWG"), 179);
eq("AWG to USD at the peg", Math.round((convert(179, "AWG", "USD") ?? 0) * 100) / 100, 100);
eq("another currency needs its USD amount", convert(10, "EUR", "AWG"), null);
eq("another currency with a USD amount", convert(10, "EUR", "USD", 11), 11);

if (fail) process.exit(1);
console.log("money checks passed");
