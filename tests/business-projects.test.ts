import { activeCount, bizProjectReport, clientLines, parseProject, projectTotals, receiptUsd, type BizProject, type BizReceipt } from "../src/lib/business-projects";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

// The form
eq("name is needed", parseProject({ name: "  " }).ok, false);
eq("bad email", parseProject({ name: "A", contact_email: "nope" }).ok, false);
eq("bad budget", parseProject({ name: "A", budget: "lots" }).ok, false);
eq("negative budget", parseProject({ name: "A", budget: "-5" }).ok, false);
eq("end before start", parseProject({ name: "A", start_date: "2026-11-10", end_date: "2026-11-01" }).ok, false);
const ok = parseProject({ name: " Harbour ", budget: "4,000.5", client_name: "Blue Wave", contact_email: "m@x.co", start_date: "2026-11-01", currency: "usd" });
eq("clean values", ok.ok && [ok.value.name, ok.value.budget, ok.value.client_name, ok.value.contact_email, ok.value.currency, ok.value.end_date], ["Harbour", 4000.5, "Blue Wave", "m@x.co", "USD", null]);

// Receipts and totals
eq("usd receipt", receiptUsd({ amount: "10.5", currency: "USD", amount_usd: null }), 10.5);
eq("saved usd wins", receiptUsd({ amount: 100, currency: "AWG", amount_usd: "55.6" }), 55.6);
eq("no usd value", receiptUsd({ amount: 100, currency: "AWG", amount_usd: null }), null);
const rec = [
  { amount: 100, currency: "USD", amount_usd: null, category: "Materials" },
  { amount: 50, currency: "USD", amount_usd: 50, category: "Meals" },
  { amount: 30, currency: "USD", amount_usd: null, category: "Materials" },
  { amount: 90, currency: "AWG", amount_usd: null, category: "Meals" },
];
const t = projectTotals(rec, 400);
eq("total counts what has a usd value", t.total, 180);
eq("one is left out", t.uncounted, 1);
eq("by category, biggest first", t.byCategory, [["Materials", 130], ["Meals", 50]]);
eq("budget left and percent", [t.budgetLeft, t.pct], [220, 45]);
eq("no budget", projectTotals(rec, null).budgetLeft, null);
eq("over budget", projectTotals(rec, 100).budgetLeft, -80);
eq("only active projects count", activeCount([{ status: "active" }, { status: "done" }, { status: "active" }]), 2);

// The report
const p: BizProject = { id: "1", name: "Harbour rebrand", client_name: "Blue Wave Co.", contact_name: "Maria Lopez", contact_email: "maria@bluewave.example", contact_phone: null, reference: "PO-2210", budget: 400, currency: "USD", start_date: "2026-11-01", end_date: null, status: "active", notes: null };
eq("client block", clientLines(p), ["Client: Blue Wave Co.", "Maria Lopez · maria@bluewave.example", "Reference: PO-2210"]);
const rows: BizReceipt[] = [
  { id: "a", merchant: "Print Express", amount: 120, currency: "USD", amount_usd: 120, category: "Printing", expense_date: "2026-11-10", notes: null, receipt_path: null },
  { id: "b", merchant: "Ace", amount: 60, currency: "USD", amount_usd: 60, category: "Materials", expense_date: "2026-11-02", notes: null, receipt_path: "x" },
];
const r = bizProjectReport(p, rows, { ownerName: "Pat" });
eq("report oldest first", r.rows.map((x) => x.merchant), ["Ace", "Print Express"]);
eq("report total", r.total, { label: "Total spent", value: 180, currency: "USD" });
eq("report summary has budget left", r.summary, [["Printing", 120], ["Materials", 60], ["Budget left", 220]]);
eq("report subtitle carries the client", /Blue Wave Co\./.test(r.subtitle ?? "") && /PO-2210/.test(r.subtitle ?? "") && /Prepared by Pat/.test(r.subtitle ?? ""), true);

if (fail) process.exit(1);
console.log("business projects: ok");
