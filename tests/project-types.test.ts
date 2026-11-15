import { PROJECT_TYPES, customTypesFrom, resolveType, sanitizeTypeLabel, typeColumns, typeId } from "../src/lib/personal/project-types";
import { defaultEndsOn, isProActive, planSummary } from "../src/lib/plans";
import { buildProjectPdf, buildProjectWorkbook, projectFileName, projectLines, projectTotals } from "../src/lib/project-export";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

// types
eq("ten ready types", PROJECT_TYPES.length, 10);
eq("a project made before types is Home", resolveType({}).key, "home");
eq("null is Home", resolveType(null).label, "Home");
eq("a ready type", resolveType({ project_type: "car" }).label, "Car");
eq("an unknown key falls back to Home", resolveType({ project_type: "spaceship" }).key, "home");
const wedding = { project_type: "custom", type_label: "Wedding", type_icon: "PartyPopper", type_color: "#c026d3" };
eq("a custom type", resolveType(wedding), { key: "custom", label: "Wedding", icon: "PartyPopper", color: "#c026d3" });
eq("a custom type with a bad icon and color is safe", resolveType({ project_type: "custom", type_label: "X", type_icon: "<script>", type_color: "red" }), { key: "custom", label: "X", icon: "Folder", color: "#64748b" });
eq("custom without a name is Home", resolveType({ project_type: "custom" }).key, "home");
eq("typeId tells custom names apart, ignoring case", [typeId(wedding), typeId({ ...wedding, type_label: "WEDDING" }), typeId({ project_type: "car" })], ["custom:wedding", "custom:wedding", "car"]);
eq("custom types made before, one each", customTypesFrom([wedding, { ...wedding, type_label: "wedding" }, { project_type: "car" }, { project_type: "custom", type_label: "Studio", type_icon: "Music", type_color: "#0284c7" }]).map((t) => t.label), ["Studio", "Wedding"]);
eq("label cleaned and cut",sanitizeTypeLabel("  Anna   and Ray  "),"Anna and Ray");
eq("label has no angle brackets and is at most 24", /[<>]/.test(sanitizeTypeLabel("<b>x</b>")) || sanitizeTypeLabel("a".repeat(60)).length > 24, false);
eq("new Home project saves no extra columns", typeColumns(resolveType(null), false), {});
eq("changing back to Home is saved", typeColumns(resolveType(null), true), { project_type: "home", type_label: null, type_icon: null, type_color: null });
eq("a ready type clears the custom fields", typeColumns(resolveType({ project_type: "boat" })), { project_type: "boat", type_label: null, type_icon: null, type_color: null });
eq("a custom type saves its three fields", typeColumns(resolveType(wedding)), wedding);

// plans
eq("no plan is free", isProActive(null, "2026-11-15"), false);
eq("no end date is Pro", isProActive({ plan: "pro", ends_on: null }, "2026-11-15"), true);
eq("the end day itself is still Pro", isProActive({ plan: "pro", ends_on: "2026-11-15" }, "2026-11-15"), true);
eq("the day after the end is free", isProActive({ plan: "pro", ends_on: "2026-11-14" }, "2026-11-15"), false);
eq("monthly ends next month", defaultEndsOn("monthly", "2026-11-15"), "2026-12-15");
eq("monthly from Dec 20 crosses the year", defaultEndsOn("monthly", "2026-12-20"), "2027-01-20");
eq("monthly from Jan 31 stays in February", defaultEndsOn("monthly", "2027-01-31"), "2027-02-28");
eq("yearly", defaultEndsOn("yearly", "2026-11-15"), "2027-11-15");
eq("yearly from a leap day", defaultEndsOn("yearly", "2028-02-29"), "2029-02-28");
eq("gift has no end date", defaultEndsOn("gift", "2026-11-15"), null);
eq("summary of an active plan", planSummary({ period: "yearly", ends_on: "2027-03-02" }, "2026-11-15"), { title: "Pro, yearly", sub: "Until 2027-03-02", pro: true });
eq("summary of an ended plan", planSummary({ period: "monthly", ends_on: "2026-10-01" }, "2026-11-15").pro, false);
eq("summary of no plan", planSummary(null, "2026-11-15"), { title: "Free", sub: "No plan", pro: false });

// reports
(async () => {
const lines = projectLines(
  [{ merchant: "Hardware Store", amount: "100", currency: "AWG", amount_usd: "55.87", category: "Materials", expense_date: "2026-11-10" }],
  [{ merchant: null, amount: 20, currency: "USD", amount_usd: 20, category: "Tools", expense_date: "2026-11-08", notes: "drill bit" }],
);
eq("lines merge expenses and attached spends, oldest first", lines.map((l) => [l.date, l.merchant, l.category]), [["2026-11-08", "", "Tools"], ["2026-11-10", "Hardware Store", "Materials"]]);
eq("totals", projectTotals(lines), { usd: 75.87, byCategory: [["Materials", 55.87], ["Tools", 20]] });
eq("file name is safe", projectFileName("Kitchen / remodel: phase 1", "pdf"), "Kitchen___remodel__phase_1_expenses.pdf");
const data = { name: "Yamaha service", typeLabel: "Motorbike", budget: 600, currency: "AWG", status: "active", lines };
const pdf = await buildProjectPdf(data);
eq("the PDF is a PDF", new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
const xlsx = await buildProjectWorkbook(data);
eq("the Excel file is a zip", new Uint8Array(xlsx as ArrayBuffer).slice(0, 2).join(","), "80,75");
const ExcelJS = (await import("exceljs")).default;
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(xlsx as ArrayBuffer);
const ws = wb.getWorksheet("Expenses")!;
eq("Excel has the project name and every expense", [ws.getCell("A1").value, ws.getCell("B5").value, ws.getCell("B6").value], ["Yamaha service", "", "Hardware Store"]);
eq("Excel total", ws.getCell("F7").value, 75.87);
const pdfBig = await buildProjectPdf({ ...data, lines: Array.from({ length: 120 }, (_, i) => ({ ...lines[0], merchant: `Shop ${i} ${"x".repeat(80)} é ✓` })) });
eq("a long list runs onto more pages without failing", pdfBig.length > pdf.length, true);

console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
})();
