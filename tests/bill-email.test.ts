import { htmlToText, inboundAddress, originalSender, parseAmount, parseBillEmail, parseDate, tokenFromRecipient, type ParsedBill } from "../src/lib/personal/bill-email";
import { pushMessage } from "../src/lib/push-text";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const bill = (x: ReturnType<typeof parseBillEmail>) => x as ParsedBill;

// the real emails
const web = parseBillEmail({ from: "OIC Mail Service <bocuenta@oci.webaruba.com>", subject: "Your WEB Aruba Nov 2026 Bill - Account 1881500000", date: "2026-11-11T22:07:00Z", text: "PLEASE DO NOT REPLY\n\nDear SASKIA,\n\nPlease find attached your Nov 2026 bill.\n\nBilling Period:08-10-2026 - 07-11-2026\n\nDue Date:09-12-2026\n\nCurrent Charges:67.1\n\n*****\nThis message is for information purposes only." });
eq([bill(web).company, bill(web).amount, bill(web).due_date, bill(web).bill_month, bill(web).account, bill(web).check], ["WEB Aruba", 67.1, "2026-12-09", "2026-11-01", "1881500000", false], "WEB: amount, due date, the month its period ends in, account");
eq(bill(web).dedupe_key, "web|1881500000|2026-11", "WEB: the same bill has the same key");

const elmar = parseBillEmail({ from: "noreply@elmar.aw", subject: "Your new ELMAR bill is ready", date: "2026-10-21", text: "Dear Saskia,\n\nYour latest bill is now available on your ELMAR account.\n\nHere are the details for your reference:\n- Account Number: 541324-1019191\n- Service Address: 200 A TANKI LEENDERT ORANJESTAD 16000-0\n- New Bill Amount: AWG 116.17\n- Bill Due Date: Dec 14, 2026\n- Prior Open Balance: AWG 93.12\n- Total Account Balance: AWG 209.29" });
eq([bill(elmar).amount, bill(elmar).due_date, bill(elmar).prior_balance, bill(elmar).bill_month, bill(elmar).check], [116.17, "2026-12-14", 93.12, "2026-09-01", true], "Elmar: the new bill (not the total), due date, open balance; the month is a guess");

const setarText = "Monthly invoice\nDear Patrick,\nYour monthly invoice for October is ready. Total Afl. 120.96 due on Nov 9";
const setar = parseBillEmail({ from: "SETAR NV - Customer Care <noreply@setar.aw>", subject: "Your monthly bill is ready - PLEASE DO NOT REPLY", date: "2026-10-31", text: setarText });
eq([bill(setar).company, bill(setar).kind, bill(setar).amount, bill(setar).currency, bill(setar).due_date, bill(setar).bill_month, bill(setar).check], ["Setar", "phone", 120.96, "AWG", "2026-11-09", "2026-10-01", false], "Setar: Afl. is AWG, the named month, a due date with no year");
const setarNoMonth = parseBillEmail({ from: "noreply@setar.aw", subject: "Your monthly bill is ready", date: "2026-10-31", text: "Pay Afl. 120.96 due on Nov 9" });
eq([bill(setarNoMonth).bill_month, bill(setarNoMonth).check], ["2026-10-01", true], "Setar with no month: the month before the due month, marked to check");
eq(bill(parseBillEmail({ from: "noreply@elmar.aw", subject: "Your new ELMAR bill is ready", date: "2026-10-21", text: "Bill Due Date: Dec 14, 2026" })).amount, null, "no amount in the email: null, marked to check");

// Gmail's forwarding confirmation
eq(parseBillEmail({ from: "Gmail Team <forwarding-noreply@google.com>", subject: "Gmail Forwarding Confirmation - Receive Mail from x@gmail.com", text: "x@gmail.com has requested to automatically forward mail to your email address bills@z.com.\nConfirmation code: 482913321\nTo allow..." }), { type: "confirmation", code: "482913321" }, "Gmail's confirmation code is found");
eq(parseBillEmail({ from: "someone@else.com", subject: "Hi", text: "Confirmation code: 123456789" }).type, "unknown", "a code from anyone else is not a Gmail confirmation");
eq(parseBillEmail({ from: "promo@shop.com", subject: "Sale", text: "50% off" }).type, "unknown", "other mail is not a bill");

// numbers and dates
eq([parseAmount("116.17"), parseAmount("1,234.50"), parseAmount("1.234,50"), parseAmount("67,5"), parseAmount("abc")], [116.17, 1234.5, 1234.5, 67.5, null], "amounts in different styles");
eq([parseDate("09-12-2026", "2026-11-11"), parseDate("Dec 14, 2026", "2026-10-21"), parseDate("December 3 2026", "2026-10-21"), parseDate("14 Dec 2026", "2026-10-21"), parseDate("31-02-2026", "2026-10-21")], ["2026-12-09", "2026-12-14", "2026-12-03", "2026-12-14", null], "dates in different styles, an impossible one is refused");
eq([parseDate("Nov 9", "2026-10-31"), parseDate("Jan 5", "2026-12-20")], ["2026-11-09", "2027-01-05"], "a date with no year is the next one that is not long past");

// addresses
eq([inboundAddress("abc@inbound.postmarkapp.com", "tok123456789012345"), inboundAddress("@in.example.com", "tok123456789012345"), inboundAddress("", "x"), inboundAddress("nonsense", "x")], ["abc+tok123456789012345@inbound.postmarkapp.com", "bills-tok123456789012345@in.example.com", null, null], "the forwarding address for a plus-address service or a domain");
eq([tokenFromRecipient("abc+tok123456789012345@inbound.postmarkapp.com"), tokenFromRecipient("Bills <bills-tok123456789012345@in.example.com>"), tokenFromRecipient("x@y.com", "tok123456789012345"), tokenFromRecipient("short@y.com")], ["tok123456789012345", "tok123456789012345", "tok123456789012345", null], "the token is found in the recipient, or the service's mailbox hash");

// manual forwards and html
eq(originalSender("---------- Forwarded message ---------\nFrom: OIC Mail Service <bocuenta@oci.webaruba.com>\nDate: Wed\nSubject: x"), "bocuenta@oci.webaruba.com", "the real sender inside a manually forwarded email");
eq(htmlToText("<div>Amount: <b>AWG&nbsp;5.00</b></div><style>.a{}</style><p>Due</p>"), "Amount: AWG 5.00\nDue", "html becomes plain lines");

// the alert never carries an amount
eq(pushMessage("billEmail", { item: "WEB Aruba", label: "November", date: "2026-12-09" }, "details", "2026-11-13").body, "New WEB Aruba bill for November, due Dec 9.", "the alert names the company, month and due date");
eq(pushMessage("billEmail", { item: "WEB Aruba" }, "private").body, "A new utility bill arrived by email.", "private wording is generic");
process.exit(failed ? 1 : 0);
