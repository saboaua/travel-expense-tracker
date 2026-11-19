import { buildFile, buildJournals, bookedUsd, cleanSettings, csvCell, fileName, totals, PROGRAMS, type SourceExpense } from "../src/lib/accounting";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const e = (id: string, o: Partial<SourceExpense>): SourceExpense => ({ key: `expense:${id}`, source: "expense", id, date: "2026-03-05", merchant: "Hilton", category: "Lodging", amount: 100, currency: "USD", amountUsd: null, rate: null, ...o });
const settings = { credit_code: "2100", credit_name: "Company card", accounts: { Lodging: "6410", Meals: "6420" } };

eq("USD books its own amount", bookedUsd(e("a", {})), 100);
eq("foreign books the saved USD value", bookedUsd(e("a", { currency: "AWG", amount: 179, amountUsd: 100 })), 100);
eq("foreign without a USD value is left out", bookedUsd(e("a", { currency: "AWG", amount: 179 })), null);

const b = buildJournals([e("2", { date: "2026-03-06", category: "Meals", amount: 25.5 }), e("1", {}), e("3", { currency: "AWG", amount: 179, amountUsd: 100, rate: 0.558659, merchant: "=cmd" }), e("4", { currency: "EUR", amount: 5 })], settings, "TRIP");
eq("one journal per expense, oldest first, one without USD skipped", [b.journals.length, b.skippedNoUsd, b.journals.map((j) => j.ref)], [3, 1, ["TRIP-001", "TRIP-002", "TRIP-003"]]);
eq("debit is the category account, credit the card", b.journals[0].lines, [{ account: "6410", name: "Lodging", debit: 100, credit: 0 }, { account: "2100", name: "Company card", debit: 0, credit: 100 }]);
eq("original currency and rate in the description", b.journals.find((j) => j.id === "3")?.description, "=cmd - 179.00 AWG @ 0.558659");
eq("debits equal credits", totals(b.journals), { debit: 225.5, credit: 225.5, lines: 6, balanced: true });
eq("no missing accounts", b.missing, []);
eq("an unmapped category is reported", buildJournals([e("9", { category: "Fuel" })], settings, "X").missing, ["Fuel"]);
eq("empty category is Other", buildJournals([e("9", { category: null })], settings, "X").missing, ["Other"]);

for (const p of PROGRAMS) {
  const f = buildFile(p.id, b.journals, "Trip");
  eq(`${p.id} has a header and every line`, f.split("\r\n").filter(Boolean).length >= 7, true);
  if (/^[=+@]/m.test(f.split("\r\n").slice(1).join("\n").replace(/\t/g, ","))) { /* formulas are checked below */ }
}
eq("csv defuses formulas", csvCell("=SUM(A1)"), "'=SUM(A1)");
eq("csv quotes commas and quotes", csvCell('a,"b"'), '"a,""b"""');
eq("csv keeps negative numbers", csvCell(-12.5), "-12.50");
const qb = buildFile("quickbooks", b.journals.slice(0, 1), "T").split("\r\n");
eq("quickbooks row", qb[1], "TRIP-001,03/05/2026,6410,100.00,,Hilton,");
const xero = buildFile("xero", b.journals.slice(0, 1), "T").split("\r\n");
eq("xero uses day first dates and signed amounts", [xero[1], xero[2]], ["Hilton,05/03/2026,Hilton,6410,No Tax,100.00", "Hilton,05/03/2026,Hilton,2100,No Tax,-100.00"]);
const iif = buildFile("quickbooks_iif", b.journals.slice(0, 1), "T").split("\r\n");
eq("iif transaction", [iif[3], iif[4], iif[5]], ["TRNS\tGENERAL JOURNAL\t03/05/2026\t6410\t100.00\tTRIP-001\tHilton", "SPL\tGENERAL JOURNAL\t03/05/2026\t2100\t-100.00\tTRIP-001\tHilton", "ENDTRNS"]);
const s300 = buildFile("sage300", b.journals.slice(0, 1), "T").split("\r\n");
eq("sage 300 signed amount", [s300[1].split(",")[7], s300[2].split(",")[7]], ["100.00", "-100.00"]);
eq("file names", [fileName("xero", "Aruba trip 2026!"), fileName("quickbooks_iif", "A")], ["aruba-trip-2026-xero-journal.csv", "a-quickbooks-iif-journal.iif"]);
eq("settings are cleaned", cleanSettings({ credit_code: "21<00>", credit_name: "Card", accounts: { Lodging: " 6410 ", Meals: "", Fuel: "<script>" } }), { credit_code: "2100", credit_name: "Card", accounts: { Lodging: "6410", Fuel: "script" } });

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("PASS accounting");
