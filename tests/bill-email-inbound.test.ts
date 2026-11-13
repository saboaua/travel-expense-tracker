import { billRow, handleInbound, senderVerified, verifyMode } from "../src/lib/bill-email-inbound";
import { parseBillEmail, type ParsedBill } from "../src/lib/personal/bill-email";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

// a tiny in-memory stand-in for the database client
type Row = Record<string, unknown>;
function makeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = { bill_email_addresses: [], bill_email_senders: [], bill_email_log: [], utility_bills: [], ...seed };
  const uploads: { path: string }[] = [];
  let n = 0;
  const from = (name: string) => {
    const tbl = (t[name] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select"; let patch: Row = {}; let head = false; let slice: [number, number] | null = null; let single = false;
    const q: Record<string, unknown> = {
      select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return q; },
      insert: (r: Row) => { op = "insert"; patch = { id: `id${++n}`, created_at: new Date().toISOString(), ...r }; return q; },
      update: (r: Row) => { op = "update"; patch = r; return q; },
      delete: () => { op = "delete"; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q; },
      ilike: (c: string, v: string) => { filters.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return q; },
      order: () => q, range: (a: number, b: number) => { slice = [a, b + 1]; return q; }, limit: () => q,
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      then: (res: (v: unknown) => void) => {
        let hit = tbl.filter((r) => filters.every((f) => f(r)));
        if (slice) hit = hit.slice(...slice);
        if (op === "insert") { tbl.push(patch); res({ data: single ? { id: patch.id } : null, error: null }); return; }
        if (op === "update") { hit.forEach((r) => Object.assign(r, patch)); res({ data: null, error: null }); return; }
        if (op === "delete") { t[name] = tbl.filter((r) => !hit.includes(r)); res({ data: null, error: null }); return; }
        res({ data: single ? hit[0] ?? null : hit, count: hit.length, error: head ? null : null });
      },
    };
    return q;
  };
  const storage = { from: () => ({ upload: async (path: string) => { uploads.push({ path }); return { error: null }; } }) };
  return { db: { from, storage } as never, t, uploads };
}

const TOKEN = "tok123456789012345";
const seed = () => ({
  bill_email_addresses: [{ user_id: "u1", token: TOKEN }],
  bill_email_senders: [{ user_id: "u1", email: "bocuenta@oci.webaruba.com" }, { user_id: "u1", email: "noreply@elmar.aw" }],
});
const webMail = (extra: Record<string, unknown> = {}) => ({
  From: "OIC Mail Service <bocuenta@oci.webaruba.com>", To: `bills-${TOKEN}@in.example.com`, Subject: "Your WEB Aruba Nov 2026 Bill - Account 1881500000", Date: "2026-11-11T22:07:00Z", MessageID: "m1",
  TextBody: "Billing Period:08-10-2026 - 07-11-2026\nDue Date:09-12-2026\nCurrent Charges:67.1", ...extra,
});

(async () => {
  const notes: unknown[] = [];
  const notify = async (u: string, b: unknown) => { notes.push([u, b]); };

  let m = makeDb(seed());
  let r = await handleInbound(m.db, webMail(), notify);
  eq(r.ok && r.status, "added", "an allowed sender's bill is added");
  const bill = m.t.utility_bills[0];
  eq([bill.user_id, bill.kind, bill.provider, bill.bill_month, bill.amount, bill.due_date, bill.paid_on, bill.source, bill.needs_check], ["u1", "water", "WEB Aruba", "2026-11-01", 67.1, "2026-12-09", null, "email", false], "the bill is unpaid, for the month its period ends in");
  eq(notes, [["u1", { company: "WEB Aruba", month: "November", due: "2026-12-09" }]], "one alert, with no amount");
  eq(m.t.bill_email_log.map((l) => l.status), ["added"], "the log says added");

  r = await handleInbound(m.db, webMail({ MessageID: "m2" }), notify);
  eq([r.ok && r.status, m.t.utility_bills.length, notes.length], ["skipped_duplicate", 1, 1], "the same bill twice is added once, with no second alert");

  m = makeDb(seed());
  r = await handleInbound(m.db, webMail({ From: "Spam <promo@shop.com>" }), notify);
  eq([r.ok && r.status, m.t.utility_bills.length], ["ignored_sender", 0], "a sender not on the list is ignored but logged");

  m = makeDb({ ...seed(), bill_email_senders: [...seed().bill_email_senders, { user_id: "u1", email: "billing@unknown.com" }] });
  r = await handleInbound(m.db, webMail({ From: "billing@unknown.com", Subject: "Hello", TextBody: "Hello, nothing useful here" }), notify);
  eq([r.ok && r.status, m.t.utility_bills.length], ["unreadable", 0], "an allowed sender with an unreadable layout is logged, not guessed");

  m = makeDb(seed());
  r = await handleInbound(m.db, { From: "Gmail Team <forwarding-noreply@google.com>", To: `bills-${TOKEN}@in.example.com`, Subject: "Gmail Forwarding Confirmation", TextBody: "Confirmation code: 482913321", Date: "2026-11-01" }, notify);
  eq([r.ok && r.status, m.t.bill_email_log[0].code], ["confirmation", "482913321"], "Gmail's code is saved in the log even though Google is not on the list");

  m = makeDb(seed());
  r = await handleInbound(m.db, webMail({ To: "bills-unknowntoken0000@in.example.com" }), notify);
  eq([r.ok && r.status, m.t.utility_bills.length, m.t.bill_email_log.length], ["no_address", 0, 0], "an unknown address stores nothing");

  m = makeDb({ ...seed(), utility_bills: [{ user_id: "u1", kind: "phone", provider: "web aruba", bill_month: "2026-10-01" }] });
  await handleInbound(m.db, webMail(), notify);
  eq([m.t.utility_bills[1]?.kind, m.t.utility_bills[1]?.provider], ["phone", "web aruba"], "the type and wording you already use for a company are kept");

  m = makeDb(seed());
  await handleInbound(m.db, webMail({ Attachments: [{ Name: "bill.pdf", ContentType: "application/pdf", Content: Buffer.from("%PDF-1").toString("base64"), ContentLength: 6 }] }), notify);
  eq([m.uploads.length, m.uploads[0]?.path.startsWith("u1/personal/utilities/"), String(m.t.utility_bills[0].receipt_path).endsWith(".pdf")], [1, true, true], "the PDF is stored with the bill");

  // forged "From": only mail the company really signed becomes a bill
  const hdr = (tests: string) => ({ Headers: [{ Name: "X-Spam-Status", Value: "No" }, { Name: "X-Spam-Tests", Value: tests }] });
  eq([senderVerified({}, "strict"), senderVerified(hdr("SPF_PASS"), "strict"), senderVerified(hdr("DKIM_SIGNED,DKIM_VALID"), "strict"), senderVerified(hdr("DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS"), "strict")], [false, false, false, true], "strict needs the company's own valid signature");
  eq([senderVerified(hdr("DKIM_VALID"), "relaxed"), senderVerified(hdr("SPF_PASS"), "relaxed"), senderVerified({}, "off")], [true, false, true], "relaxed needs any valid signature; off needs none");
  eq([verifyMode(undefined), verifyMode("relaxed"), verifyMode("off"), verifyMode("whatever")], ["strict", "relaxed", "off", "strict"], "unset or unknown means strict");
  m = makeDb(seed());
  r = await handleInbound(m.db, webMail({ ...hdr("SPF_PASS") }), notify, "strict");
  eq([r.ok && r.status, m.t.utility_bills.length, m.t.bill_email_log[0]?.status], ["ignored_sender", 0, "ignored_sender"], "a forged bill (no valid signature) is logged and not added");
  m = makeDb(seed());
  r = await handleInbound(m.db, webMail({ ...hdr("DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU") }), notify, "strict");
  eq([r.ok && r.status, m.t.utility_bills.length], ["added", 1], "a properly signed bill is added");
  m = makeDb(seed());
  r = await handleInbound(m.db, { From: "Gmail Team <forwarding-noreply@google.com>", To: `bills-${TOKEN}@in.example.com`, Subject: "Gmail Forwarding Confirmation", TextBody: "Confirmation code: 482913321", Date: "2026-11-01" }, notify, "strict");
  eq(r.ok && r.status, "confirmation", "Gmail's code is still shown when the check is strict (it only displays a number)");

  // a bill with no amount is kept, marked to check
  const noAmount = parseBillEmail({ from: "noreply@elmar.aw", subject: "Your new ELMAR bill is ready", date: "2026-10-21", text: "Bill Due Date: Dec 14, 2026" }) as ParsedBill;
  const row = billRow("u1", noAmount, "electricity", "Elmar");
  eq([row.amount, row.needs_check, row.amount_usd, row.paid_on], [0, true, 0, null], "no amount: saved as 0 and marked to check");
  const awg = billRow("u1", { ...noAmount, amount: 179, check: false }, "electricity", "Elmar");
  eq([awg.amount_usd, awg.currency], [100, "AWG"], "AWG converts at the peg");
  process.exit(failed ? 1 : 0);
})();
