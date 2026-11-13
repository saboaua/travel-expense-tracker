import type { SupabaseClient } from "@supabase/supabase-js";
import { htmlToText, MONTH_NAMES, originalSender, parseBillEmail, senderEmail, tokenFromRecipient, type ParsedBill } from "@/lib/personal/bill-email";
import { AWG_PER_USD } from "@/lib/personal/dashboard";
import { isMissingColumn } from "@/lib/columns";
import { todayISO } from "@/lib/utils";
import { UTILITY_KINDS } from "@/lib/personal/utilities";

/** What an email service hands us, in the shape Postmark's inbound webhook uses. */
export type InboundPayload = {
  From?: string; FromFull?: { Email?: string; Name?: string } | null; To?: string; OriginalRecipient?: string; MailboxHash?: string;
  Subject?: string; TextBody?: string; HtmlBody?: string; Date?: string; MessageID?: string;
  Headers?: { Name?: string; Value?: string }[];
  Attachments?: { Name?: string; ContentType?: string; Content?: string; ContentLength?: number }[];
};

export type InboundResult =
  | { ok: true; status: "no_address" | "rate_limited" | "ignored_sender" | "wrong_account" | "unreadable" | "confirmation" | "skipped_duplicate" | "added"; billId?: string }
  | { ok: false; error: string };

const MAX_PDF = 4 * 1024 * 1024;
const LOG_KEEP = 50;
const HOURLY_LIMIT = 60;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Account numbers compare without dashes, spaces or case: "541324-1019191" is "5413241019191". */
export const normAccount = (a: string | null | undefined) => (a ?? "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();

export const monthName = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1] ?? "";

/** "strict": the company's own DKIM signature must be valid (survives Gmail forwarding; SPF does not). "relaxed": any valid DKIM. "off": no check. */
export type VerifyMode = "strict" | "relaxed" | "off";
export const verifyMode = (v: string | undefined): VerifyMode => (v === "relaxed" || v === "off" ? v : "strict");

/** Domain of a sender address, lowercase. */
const domainOf = (email: string) => email.toLowerCase().split("@")[1] ?? "";
const aligned = (a: string, b: string) => !!a && !!b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

/**
 * Gmail's own verdict, e.g. "Authentication-Results: mx.google.com; dkim=pass header.i=@elmar.aw ...; spf=pass ...; dmarc=pass (p=NONE) header.from=elmar.aw".
 * Only Google's line counts (the sender cannot write one that starts with mx.google.com ahead of Google's own).
 * Strict: DMARC pass (Gmail confirmed the From address belongs to its domain, by an aligned SPF or DKIM, so a company that signs
 * through a mail provider such as Mimecast still passes) or a DKIM pass for the sender's own domain. Relaxed: any DKIM pass too.
 */
export function gmailAuthPasses(value: string, mode: VerifyMode, sender: string): boolean {
  const v = value.replace(/^\s*authentication-results:\s*/i, "").trim();
  if (!/^mx\.google\.com\s*;/i.test(v)) return false;
  const dmarc = /dmarc=pass\b([^;]*)/i.exec(v);
  if (dmarc) {
    const from = /header\.from=@?([a-z0-9.-]+)/i.exec(dmarc[1])?.[1]?.toLowerCase();
    if (!from || aligned(from, domainOf(sender))) return true;
  }
  const found = [...v.matchAll(/dkim=pass\b[^;]*?header\.(?:i=@?|d=)([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  if (!found.length) return false;
  return mode === "strict" ? found.some((d) => aligned(d, domainOf(sender))) : true;
}

/**
 * Anyone can type any "From". Postmark lists what SpamAssassin found in X-Spam-Tests ("DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS"),
 * and Gmail adds an Authentication-Results line; either one proving the company's own signature is enough.
 */
export function senderVerified(p: InboundPayload, mode: VerifyMode, sender = ""): boolean {
  if (mode === "off") return true;
  const header = (name: string) => (p.Headers ?? []).filter((h) => (h.Name ?? "").toLowerCase() === name).map((h) => h.Value ?? "");
  const tests = header("x-spam-tests").join(",").toUpperCase().split(/[\s,]+/);
  if (tests.includes(mode === "strict" ? "DKIM_VALID_AU" : "DKIM_VALID")) return true;
  return header("authentication-results").some((v) => gmailAuthPasses(v, mode, sender));
}

type Notify = (userId: string, bill: { company: string; month: string; due: string | null }) => Promise<unknown>;

/**
 * One email arriving at someone's private address. `db` is the service client (nobody signed in is calling).
 * Never throws for bad mail: everything ends in a log line the person can read.
 */
export async function handleInbound(db: SupabaseClient, p: InboundPayload, notify: Notify = async () => 0, verify: VerifyMode = "off"): Promise<InboundResult> {
  const token = tokenFromRecipient(p.OriginalRecipient || p.To, p.MailboxHash);
  if (!token) return { ok: true, status: "no_address" };
  const addr = await db.from("bill_email_addresses").select("user_id").eq("token", token).maybeSingle();
  if (addr.error) return { ok: false, error: addr.error.message };
  const userId = (addr.data as { user_id: string } | null)?.user_id;
  if (!userId) return { ok: true, status: "no_address" };

  const subject = clip(p.Subject, 200);
  const text = (p.TextBody && p.TextBody.trim()) ? p.TextBody : htmlToText(p.HtmlBody ?? "");
  // a manual "Forward" hides the real sender in the body; an automatic Gmail forward keeps it in From
  const direct = senderEmail(p.FromFull?.Email || p.From || "");
  const sender = /forwarded message/i.test(text) && !/forwarding-noreply@google\.com/i.test(direct) ? originalSender(text) ?? direct : direct;
  const date = p.Date && !Number.isNaN(Date.parse(p.Date)) ? todayISO("America/Aruba", new Date(p.Date)) : todayISO();

  const log = async (status: string, extra: { summary?: string; code?: string; bill_id?: string; account?: string | null } = {}) => {
    const row = { user_id: userId, sender: sender.slice(0, 200) || null, subject: subject || null, status, ...extra };
    const first = await db.from("bill_email_log").insert(row);
    if (first.error && (isMissingColumn(first.error) || /check constraint/i.test(first.error.message))) {
      // the account migration is not run yet: keep the line, without the account
      const { account: _a, ...rest } = row as typeof row & { account?: string | null };
      void _a;
      await db.from("bill_email_log").insert({ ...rest, status: status === "wrong_account" ? "ignored_sender" : status });
    }
    // keep the newest entries only
    const old = await db.from("bill_email_log").select("id").eq("user_id", userId).order("created_at", { ascending: false }).range(LOG_KEEP, LOG_KEEP + 200);
    const ids = ((old.data ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length) await db.from("bill_email_log").delete().in("id", ids);
  };

  // a flood of mail cannot fill the account
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await db.from("bill_email_log").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if ((recent.count ?? 0) >= HOURLY_LIMIT) return { ok: true, status: "rate_limited" };

  const parsed = parseBillEmail({ from: sender || direct, subject, text, date, messageId: p.MessageID });

  // Gmail's confirmation code is accepted from Google whatever your sender list says
  if (parsed.type === "confirmation") { await log("confirmation", { summary: "Gmail asks you to confirm forwarding", code: parsed.code }); return { ok: true, status: "confirmation" }; }

  let allowed = await db.from("bill_email_senders").select("id, accounts").eq("user_id", userId).eq("email", sender).maybeSingle();
  if (allowed.error && isMissingColumn(allowed.error)) allowed = await db.from("bill_email_senders").select("id").eq("user_id", userId).eq("email", sender).maybeSingle();
  const mine = ((allowed.data as { accounts?: string[] | null } | null)?.accounts ?? []).map(normAccount).filter(Boolean);
  if (!allowed.data) { await log("ignored_sender", { summary: "Not on your list of senders" }); return { ok: true, status: "ignored_sender" }; }
  // anyone can type any "From"; only mail the company really signed becomes a bill
  if (!senderVerified(p, verify, sender || direct)) { await log("ignored_sender", { summary: verify === "strict" ? "Could not confirm this email really came from the sender, so it was not trusted" : "No valid signature, so it was not trusted" }); return { ok: true, status: "ignored_sender" }; }
  if (parsed.type !== "bill") { await log("unreadable", { summary: "Could not read a bill from this email. Add it by hand." }); return { ok: true, status: "unreadable" }; }

  // the same companies also bill other people (a parent's account): only the account numbers you listed are added
  let bill: ParsedBill = parsed;
  if (mine.length) {
    if (!parsed.account) bill = { ...parsed, check: true, why: [...parsed.why, "account number not found"] };
    else if (!mine.includes(normAccount(parsed.account))) {
      await log("wrong_account", { summary: `${parsed.company} · account ${parsed.account} is not one of yours`, account: parsed.account });
      return { ok: true, status: "wrong_account" };
    }
  }

  const dup = await db.from("utility_bills").select("id").eq("user_id", userId).eq("dedupe_key", bill.dedupe_key).maybeSingle();
  if (dup.data) { await log("skipped_duplicate", { summary: `${parsed.company} ${monthName(parsed.bill_month)}: already added`, bill_id: (dup.data as { id: string }).id, account: parsed.account }); return { ok: true, status: "skipped_duplicate" }; }

  // use the wording and type you already use for this company
  const prev = await db.from("utility_bills").select("kind, provider").eq("user_id", userId).ilike("provider", parsed.company).order("bill_month", { ascending: false }).limit(1).maybeSingle();
  const pv = prev.data as { kind: string; provider: string } | null;
  const kind = pv && UTILITY_KINDS.some((k) => k.id === pv.kind) ? pv.kind : parsed.kind;
  const company = pv?.provider?.trim() || parsed.company;

  const row = billRow(userId, bill, kind, company, p.MessageID);
  const ins = await db.from("utility_bills").insert(row).select("id").single();
  if (ins.error || !ins.data) return { ok: false, error: ins.error?.message ?? "could not save the bill" };
  const billId = (ins.data as { id: string }).id;

  // the PDF, when there is one
  const pdf = (p.Attachments ?? []).find((a) => /pdf/i.test(a.ContentType ?? "") && a.Content && (a.ContentLength ?? a.Content.length * 0.75) <= MAX_PDF);
  if (pdf?.Content) {
    try {
      const path = `${userId}/personal/utilities/${billId}.pdf`;
      const up = await db.storage.from("receipts").upload(path, Buffer.from(pdf.Content, "base64"), { contentType: "application/pdf", upsert: true });
      if (!up.error) await db.from("utility_bills").update({ receipt_path: path }).eq("id", billId);
    } catch { /* the bill is saved without its PDF */ }
  }

  const summary = `${company} · for ${monthName(parsed.bill_month)} · ${parsed.amount == null ? "no amount found" : `${parsed.currency} ${r2(parsed.amount).toFixed(2)}`}`;
  await log("added", { summary, bill_id: billId, account: parsed.account });
  await notify(userId, { company, month: monthName(parsed.bill_month), due: parsed.due_date });
  return { ok: true, status: "added", billId };
}

/** The utility_bills row for a parsed email: amount 0 with a check mark when the email had none. */
export function billRow(userId: string, b: ParsedBill, kind: string, company: string, messageId?: string | null) {
  const amount = b.amount ?? 0;
  const usd = b.currency === "USD" ? amount : amount / AWG_PER_USD;
  const notes = [b.account ? `Account ${b.account}` : null, b.prior_balance ? `The company also lists ${b.currency} ${r2(b.prior_balance).toFixed(2)} from before as open` : null].filter(Boolean).join(". ");
  return {
    user_id: userId, kind, provider: company.slice(0, 80), bill_month: b.bill_month, amount, currency: b.currency,
    exchange_rate: b.currency === "USD" ? 1 : r2(1 / AWG_PER_USD * 1e6) / 1e6, amount_usd: r2(usd),
    paid_on: null, due_date: b.due_date, notes: notes ? notes.slice(0, 500) : null,
    source: "email", dedupe_key: (b.dedupe_key || messageId || "").slice(0, 200) || null, needs_check: b.check,
  };
}
