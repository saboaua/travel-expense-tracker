import { todayISO } from "@/lib/utils";
/**
 * Reading a utility company's "your bill is ready" email. Pure functions (no I/O) so they are unit-tested on real emails.
 * Each company has its own reader; the amount, due date and month are taken exactly from the text. A month that has to be
 * guessed, or an amount that is not in the email, sets `check` so the bill is marked for you to look at.
 */
import { monthStart, shiftMonth } from "@/lib/personal/utilities";

export type BillEmailInput = { from: string; subject: string; text: string; date?: string | null; messageId?: string | null };

export type ParsedBill = {
  type: "bill";
  company: string;
  kind: "water" | "electricity" | "phone" | "internet" | "other";
  amount: number | null;
  currency: "AWG" | "USD";
  due_date: string | null;
  bill_month: string;
  account: string | null;
  /** an older amount the company says is still open: shown as a note, never added as another bill */
  prior_balance: number | null;
  /** true when the amount is missing or the month had to be guessed */
  check: boolean;
  why: string[];
  dedupe_key: string;
};
export type ParsedConfirmation = { type: "confirmation"; code: string };
export type ParsedEmail = ParsedBill | ParsedConfirmation | { type: "unknown" };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIndex = (w: string) => MONTHS.findIndex((m) => m.startsWith(w.toLowerCase().slice(0, 3)) && (w.length >= 3));
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const validDay = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "09-12-2026", "9/12/2026", "Dec 14, 2026", "December 14 2026", "14 Dec 2026" or "Nov 9" (no year: the next one after `ref`). */
export function parseDate(text: string, ref: string): string | null {
  const t = text.trim();
  let m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(t);
  if (m && validDay(+m[3], +m[2], +m[1])) return iso(+m[3], +m[2], +m[1]);
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(t);
  if (m && monthIndex(m[1]) >= 0) return withYear(monthIndex(m[1]) + 1, +m[2], m[3] ? +m[3] : null, ref);
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?\b/.exec(t);
  if (m && monthIndex(m[2]) >= 0) return withYear(monthIndex(m[2]) + 1, +m[1], m[3] ? +m[3] : null, ref);
  return null;
}
function withYear(month: number, day: number, year: number | null, ref: string): string | null {
  const ry = Number(ref.slice(0, 4));
  if (year) return validDay(year, month, day) ? iso(year, month, day) : null;
  let y = ry;
  if (!validDay(y, month, day)) return null;
  // a date with no year is the first such date that is not long past (a bill emailed on Oct 21 due "Nov 9" is this year; one due "Jan 5" is next year)
  if (Date.parse(iso(y, month, day)) < Date.parse(ref) - 45 * 86400000) y += 1;
  return validDay(y, month, day) ? iso(y, month, day) : null;
}

/** "116.17", "1,234.50", "1.234,50" and "67,5" to a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, "").replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const dot = s.lastIndexOf("."), comma = s.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) s = dot > comma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (comma >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const AMT = String.raw`(?:AWG|Afl\.?|ƒ|US\$|USD)?\s*([0-9][0-9.,]*)`;
const lineValue = (text: string, label: RegExp): string | null => {
  const m = new RegExp(label.source + String.raw`\s*[:\-]?\s*([^\n\r]+)`, "i").exec(text);
  return m ? m[1].trim() : null;
};
const currencyOf = (s: string): "AWG" | "USD" => (/\bUSD\b|US\$/i.test(s) ? "USD" : "AWG");
const refDate = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : todayISO());
const senderOf = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
export const senderEmail = senderOf;

/** The month named in the text ("October", "Nov 2026"): the year is the email's year, or the one before when that month is still ahead. */
function namedMonth(text: string, ref: string): string | null {
  const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b\.?,?\s*(\d{4})?/i.exec(text);
  if (!m) return null;
  const idx = monthIndex(m[1]);
  if (idx < 0) return null;
  let y = m[2] ? +m[2] : Number(ref.slice(0, 4));
  if (!m[2] && Date.parse(iso(y, idx + 1, 1)) > Date.parse(ref) + 20 * 86400000) y -= 1;
  return iso(y, idx + 1, 1);
}

type Reader = (i: BillEmailInput, ref: string) => ParsedBill | null;

const base = (company: string, kind: ParsedBill["kind"]) => ({ type: "bill" as const, company, kind, prior_balance: null as number | null, why: [] as string[] });

const web: Reader = (i, ref) => {
  if (!/webaruba\.com/i.test(i.from) && !/\bWEB Aruba\b/i.test(i.subject)) return null;
  const t = i.text;
  const amount = (() => { const v = lineValue(t, /Current Charges/); const m = v ? new RegExp(AMT, "i").exec(v) : null; return m ? parseAmount(m[1]) : null; })();
  const due = (() => { const v = lineValue(t, /Due Date/); return v ? parseDate(v, ref) : null; })();
  const period = /Billing Period\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})\s*[-–to]+\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i.exec(t);
  const end = period ? parseDate(period[2], ref) : null;
  const account = /Account\s*(?:Number)?\s*:?\s*(\d{4,})/i.exec(i.subject)?.[1] ?? /Account\s*(?:Number)?\s*:?\s*(\d{4,})/i.exec(t)?.[1] ?? null;
  const why: string[] = [];
  // the bill's month is the one its period ends in, which is also the month in the subject ("Nov 2026 Bill")
  let month = end ? monthStart(end) : namedMonth(i.subject, ref);
  let check = false;
  if (!month) { month = shiftMonth(monthStart(ref), -1); check = true; why.push("month guessed"); }
  if (amount == null) { check = true; why.push("no amount found"); }
  return { ...base("WEB Aruba", "water"), amount, currency: currencyOf(t), due_date: due, bill_month: month, account, check, why, dedupe_key: `web|${account ?? "?"}|${month.slice(0, 7)}` };
};

const elmar: Reader = (i, ref) => {
  if (!/elmar\.aw/i.test(i.from) && !/\bELMAR\b/i.test(i.subject)) return null;
  const t = i.text;
  const amtLine = lineValue(t, /New Bill Amount/);
  const amount = (() => { const m = amtLine ? new RegExp(AMT, "i").exec(amtLine) : null; return m ? parseAmount(m[1]) : null; })();
  const due = (() => { const v = lineValue(t, /Bill Due Date/); return v ? parseDate(v, ref) : null; })();
  const account = lineValue(t, /Account Number/)?.split(/\s/)[0] ?? null;
  const prior = (() => { const v = lineValue(t, /Prior Open Balance/); const m = v ? new RegExp(AMT, "i").exec(v) : null; return m ? parseAmount(m[1]) : null; })();
  // Elmar's email has no billing month: use the month before the email date, and mark it for a check
  const why = ["month guessed"];
  if (amount == null) why.push("no amount found");
  const month = shiftMonth(monthStart(ref), -1);
  return { ...base("Elmar", "electricity"), amount, currency: currencyOf(amtLine ?? t), due_date: due, bill_month: month, account, prior_balance: prior && prior > 0 ? prior : null, check: true, why, dedupe_key: `elmar|${account ?? "?"}|${due ?? ref}` };
};

const setar: Reader = (i, ref) => {
  if (!/setar/i.test(i.from) && !/\bSETAR\b/i.test(i.subject + " " + i.text.slice(0, 400))) return null;
  const t = i.text;
  // "Bill amount: Afl. 120.00" (Afl. is the Aruban florin); if the layout puts other words between, the first Afl. amount is used
  const amtM = new RegExp(String.raw`Bill\s+amount\s*:?\s*(?:Afl\.?|AWG|ƒ)?\s*([0-9][0-9.,]*)`, "i").exec(t) ?? new RegExp(String.raw`(?:Afl\.?|AWG|ƒ)\s*([0-9][0-9.,]*)`, "i").exec(t);
  const amount = amtM ? parseAmount(amtM[1]) : null;
  const dueM = /due\s+date\s*:?\s*([^\n\r]{3,25})/i.exec(t) ?? /due\s*(?:on)?\s*:?\s*([^\n\r.]{3,25})/i.exec(t);
  const due = dueM ? parseDate(dueM[1], ref) : null;
  const account = /\bAccount\s*(?:number|no\.?)?\s*:?\s*(\d{4,})/i.exec(t)?.[1] ?? null;
  const invoice = /\bInvoice\s*(?:number|no\.?|#)?\s*:\s*(\d{5,})/i.exec(t)?.[1] ?? null;
  // "Invoice for: Sep 2026" names the month; older layouts name it next to the words invoice / bill / period (never from the due date)
  const forM = /Invoice\s+for\s*:?\s*([A-Za-z]{3,9})\.?\s*(\d{4})?/i.exec(t);
  const body = t.replace(/due\s*(?:on|date)?\s*:?\s*[^\n\r]{3,25}/gi, " ");
  const near = /(?:invoice|bill|period|statement)[^\n\r]{0,3}(?:\s|:|for|of|-|\n)+(?:for\s+|of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\b(?:\s+(\d{4}))?/i.exec(body)
    ?? /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b(?:\s+(\d{4}))?\s+(?:invoice|bill)/i.exec(body);
  const named = (forM && monthIndex(forM[1]) >= 0 ? namedMonth(forM[1] + (forM[2] ? " " + forM[2] : ""), ref) : null)
    ?? (near ? namedMonth(near[1] + (near[2] ? " " + near[2] : ""), ref) : namedMonth(i.subject, ref));
  const why: string[] = [];
  let check = false;
  // no month in the email: the month before the one the bill is due in (September's invoice is due in October)
  const month = named ?? (() => { check = true; why.push("month guessed"); return shiftMonth(monthStart(due ?? ref), -1); })();
  if (amount == null) { check = true; why.push("no amount found"); }
  return { ...base("Setar", "phone"), amount, currency: "AWG", due_date: due, bill_month: month, account, check, why, dedupe_key: invoice ? `setar|${account ?? "?"}|${invoice}` : `setar|${account ?? "?"}|${month.slice(0, 7)}|${amount ?? "?"}` };
};

const READERS: Reader[] = [web, elmar, setar];

/** Google's "Gmail Forwarding Confirmation" email, which carries the code that turns forwarding on. */
export function parseConfirmation(i: BillEmailInput): ParsedConfirmation | null {
  if (!/(^|<|@)(forwarding-noreply@google\.com)/i.test(i.from) && !/forwarding-noreply@google\.com/i.test(i.from)) return null;
  const m = /confirmation code[^0-9]{0,40}(\d{6,9})/i.exec(i.text) ?? /\b(\d{8,9})\b/.exec(i.text);
  return m ? { type: "confirmation", code: m[1] } : null;
}

/** Turns an HTML email into plain text lines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n\s*\n+/g, "\n").trim();
}

/** A manual "Forward" puts the real sender inside the body ("From: Name <a@b.com>"). */
export function originalSender(text: string): string | null {
  const block = /Forwarded message[\s\S]{0,300}?From:\s*([^\n\r]+)/i.exec(text);
  return block ? senderOf(block[1]) : null;
}

export function parseBillEmail(input: BillEmailInput): ParsedEmail {
  const ref = refDate(input.date);
  // Gmail's plain text wraps bold labels in asterisks ("*Account Number:* 541324"): drop them so the value is read, not the star
  const i = { ...input, text: input.text.replace(/\r/g, "").replace(/\*/g, "") };
  const conf = parseConfirmation(i);
  if (conf) return conf;
  for (const read of READERS) {
    const r = read(i, ref);
    if (r) return r;
  }
  return { type: "unknown" };
}

/** The address a person gives their email service: `local+token@host` for a plus-address base, or `bills-token@host` for a domain. */
export function inboundAddress(base: string | undefined | null, token: string): string | null {
  const b = (base ?? "").trim();
  if (!b || !token) return null;
  if (b.startsWith("@")) return `bills-${token}${b}`;
  const at = b.lastIndexOf("@");
  if (at < 1) return null;
  return `${b.slice(0, at)}+${token}${b.slice(at)}`;
}

/** The token inside a recipient address, from `local+token@host` or `bills-token@host`. */
export function tokenFromRecipient(addr: string | undefined | null, mailboxHash?: string | null): string | null {
  if (mailboxHash && /^[A-Za-z0-9]{16,64}$/.test(mailboxHash)) return mailboxHash;
  const local = (addr ?? "").trim().replace(/^.*</, "").replace(/>.*$/, "").split("@")[0] ?? "";
  const cand = local.includes("+") ? local.split("+").pop()! : local.replace(/^bills-/i, "");
  return /^[A-Za-z0-9]{16,64}$/.test(cand) ? cand : null;
}

export const MONTH_NAMES = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));
