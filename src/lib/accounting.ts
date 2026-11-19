/** Accounting export: journal entries only. Each expense is one debit line (the category's account) and one credit line (the card, bank or cash account). */

export type ProgramId = "sage300" | "quickbooks" | "quickbooks_iif" | "xero" | "zoho" | "sage50" | "sage_cloud" | "other";
export type Program = { id: ProgramId; name: string; sub: string; ext: "csv" | "iif" };

export const PROGRAMS: Program[] = [
  { id: "sage300", name: "Sage 300", sub: "General ledger journal entry import (CSV)", ext: "csv" },
  { id: "quickbooks", name: "QuickBooks", sub: "Journal entries (CSV)", ext: "csv" },
  { id: "quickbooks_iif", name: "QuickBooks Desktop", sub: "Journal entries (IIF file)", ext: "iif" },
  { id: "xero", name: "Xero", sub: "Manual journal (CSV)", ext: "csv" },
  { id: "zoho", name: "Zoho Books", sub: "Journal import (CSV)", ext: "csv" },
  { id: "sage50", name: "Sage 50", sub: "Journal entries (CSV)", ext: "csv" },
  { id: "sage_cloud", name: "Sage Business Cloud", sub: "Journal entries (CSV)", ext: "csv" },
  { id: "other", name: "Any other program", sub: "Plain CSV with debit and credit lines", ext: "csv" },
];
export const isProgram = (v: unknown): v is ProgramId => PROGRAMS.some((p) => p.id === v);
export const programOf = (id: ProgramId) => PROGRAMS.find((p) => p.id === id) ?? PROGRAMS[0];

export type AccountSettings = { credit_code: string; credit_name: string; accounts: Record<string, string> };
export const EMPTY_SETTINGS: AccountSettings = { credit_code: "", credit_name: "", accounts: {} };

/** One expense as read from the database, already in the amounts we book. */
export type SourceExpense = { key: string; source: "expense" | "receipt"; id: string; date: string; merchant: string | null; category: string | null; amount: number; currency: string | null; amountUsd: number | null; rate: number | null };

export type JournalLine = { account: string; name: string; debit: number; credit: number };
export type Journal = { key: string; source: "expense" | "receipt"; id: string; ref: string; date: string; description: string; lines: JournalLine[] };
export type Built = { journals: Journal[]; missing: string[]; skippedNoUsd: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const BOOK_CURRENCY = "USD";
export const catOf = (c: string | null | undefined) => (c && c.trim()) || "Other";

/** The amount we book is USD. An expense in USD books its own amount; otherwise the USD value saved with it. No USD value: left out and counted. */
export function bookedUsd(e: SourceExpense): number | null {
  if (!e.currency || e.currency.toUpperCase() === "USD") return Number.isFinite(e.amount) ? r2(e.amount) : null;
  if (e.amountUsd != null && Number.isFinite(e.amountUsd) && e.amountUsd > 0) return r2(e.amountUsd);
  return null;
}

export function describe(e: SourceExpense): string {
  const who = (e.merchant || catOf(e.category)).replace(/\s+/g, " ").trim();
  if (e.currency && e.currency.toUpperCase() !== "USD") {
    const rate = e.rate && e.rate > 0 ? ` @ ${Number(e.rate.toFixed(6))}` : "";
    return `${who} - ${r2(e.amount).toFixed(2)} ${e.currency.toUpperCase()}${rate}`;
  }
  return who;
}

export function buildJournals(items: SourceExpense[], s: AccountSettings, prefix: string): Built {
  const missing = new Set<string>();
  let skippedNoUsd = 0;
  const journals: Journal[] = [];
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  for (const e of sorted) {
    const usd = bookedUsd(e);
    if (usd == null) { skippedNoUsd++; continue; }
    const cat = catOf(e.category);
    const code = (s.accounts[cat] || "").trim();
    if (!code) missing.add(cat);
    journals.push({
      key: e.key, source: e.source, id: e.id, ref: `${prefix}-${String(journals.length + 1).padStart(3, "0")}`, date: e.date, description: describe(e),
      lines: [
        { account: code, name: cat, debit: usd, credit: 0 },
        { account: s.credit_code.trim(), name: s.credit_name.trim() || "Credit account", debit: 0, credit: usd },
      ],
    });
  }
  return { journals, missing: [...missing].sort(), skippedNoUsd };
}

export const totals = (j: Journal[]) => {
  let debit = 0, credit = 0, lines = 0;
  for (const x of j) for (const l of x.lines) { debit += l.debit; credit += l.credit; lines++; }
  return { debit: r2(debit), credit: r2(credit), lines, balanced: Math.abs(debit - credit) < 0.005 };
};

/** Every value in a CSV is quoted when it needs it; leading = + - @ are defused so a merchant name can never run as a formula. */
export function csvCell(v: string | number): string {
  let s = typeof v === "number" ? v.toFixed(2) : v;
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const [Y, M, D] = [(d: string) => d.slice(0, 4), (d: string) => d.slice(5, 7), (d: string) => d.slice(8, 10)];
const us = (d: string) => `${M(d)}/${D(d)}/${Y(d)}`;
const eu = (d: string) => `${D(d)}/${M(d)}/${Y(d)}`;
const num = (n: number) => (n ? n.toFixed(2) : "");

/** The file for one program. Signed amounts (debit positive, credit negative) where the program asks for a single amount column. */
export function buildFile(program: ProgramId, journals: Journal[], title: string): string {
  const flat = journals.flatMap((j) => j.lines.map((l) => ({ j, l })));
  switch (program) {
    case "sage300":
      return csv([["BATCHID", "BTCHENTRY", "SRCELEDGER", "SRCETYPE", "JRNLDATE", "JRNLDESC", "ACCTID", "TRANSAMT", "TRANSDESC", "TRANSREF", "SCURNCODE"],
        ...flat.map(({ j, l }) => ["LIFOLIO", j.ref, "GL", "JE", us(j.date).replace(/\//g, ""), title, l.account, l.debit ? l.debit : -l.credit, j.description, j.ref, BOOK_CURRENCY])]);
    case "quickbooks":
      return csv([["Journal No", "Journal Date", "Account Name", "Debits", "Credits", "Description", "Name"],
        ...flat.map(({ j, l }) => [j.ref, us(j.date), l.account || l.name, num(l.debit), num(l.credit), j.description, ""])]);
    case "quickbooks_iif": {
      const t = (x: string[]) => x.join("\t");
      const rows = [t(["!TRNS", "TRNSTYPE", "DATE", "ACCNT", "AMOUNT", "DOCNUM", "MEMO"]), t(["!SPL", "TRNSTYPE", "DATE", "ACCNT", "AMOUNT", "DOCNUM", "MEMO"]), "!ENDTRNS"];
      const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ");
      for (const j of journals) {
        j.lines.forEach((l, i) => rows.push(t([i === 0 ? "TRNS" : "SPL", "GENERAL JOURNAL", us(j.date), clean(l.account || l.name), (l.debit ? l.debit : -l.credit).toFixed(2), j.ref, clean(j.description)])));
        rows.push("ENDTRNS");
      }
      return rows.join("\r\n") + "\r\n";
    }
    case "xero":
      return csv([["*Narration", "*Date", "Description", "*AccountCode", "TaxRate", "*Amount"],
        ...flat.map(({ j, l }) => [j.description, eu(j.date), j.description, l.account, "No Tax", l.debit ? l.debit : -l.credit])]);
    case "zoho":
      return csv([["Journal Date", "Reference Number", "Notes", "Journal Type", "Currency", "Account", "Description", "Debit", "Credit"],
        ...flat.map(({ j, l }) => [`${Y(j.date)}-${M(j.date)}-${D(j.date)}`, j.ref, title, "both", BOOK_CURRENCY, l.account || l.name, j.description, num(l.debit), num(l.credit)])]);
    case "sage50":
      return csv([["Date", "Reference", "Account ID", "Description", "Debit", "Credit"],
        ...flat.map(({ j, l }) => [us(j.date), j.ref, l.account, j.description, num(l.debit), num(l.credit)])]);
    case "sage_cloud":
      return csv([["Date", "Reference", "Description", "Ledger Account", "Debit", "Credit"],
        ...flat.map(({ j, l }) => [eu(j.date), j.ref, j.description, l.account, num(l.debit), num(l.credit)])]);
    default:
      return csv([["Date", "Reference", "Description", "Account", "Account name", "Debit", "Credit", "Currency"],
        ...flat.map(({ j, l }) => [`${Y(j.date)}-${M(j.date)}-${D(j.date)}`, j.ref, j.description, l.account, l.name, num(l.debit), num(l.credit), BOOK_CURRENCY])]);
  }
}

export function fileName(program: ProgramId, label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "expenses";
  return `${slug}-${program.replace("_", "-")}-journal.${programOf(program).ext}`;
}

/** Account codes are short text typed by the user. Keep them plain: letters, digits, space and - . : / _ */
export const cleanCode = (v: unknown, max = 40): string => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} \-.:/_]/gu, "").trim().slice(0, max) : "");
export function cleanSettings(raw: unknown): AccountSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const acc: Record<string, string> = {};
  if (o.accounts && typeof o.accounts === "object") for (const [k, v] of Object.entries(o.accounts as Record<string, unknown>).slice(0, 60)) { const c = cleanCode(v); if (c) acc[k.slice(0, 60)] = c; }
  return { credit_code: cleanCode(o.credit_code), credit_name: cleanCode(o.credit_name, 60), accounts: acc };
}
