import { NextResponse } from "next/server";
import { handleInbound, verifyMode, type InboundPayload } from "@/lib/bill-email-inbound";
import { sendPush, serviceClient } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY = 12 * 1024 * 1024;
const KEY_SHAPE = /^[A-Za-z0-9]{16,64}$/;

/** The person's own Gmail script calls this with the private key from the Bill emails page. */
async function userFor(req: Request) {
  const key = req.headers.get("x-bill-key") || "";
  if (!KEY_SHAPE.test(key)) return null;
  const db = serviceClient();
  if (!db) return { db: null, key, userId: null };
  const r = await db.from("bill_email_addresses").select("user_id").eq("token", key).maybeSingle();
  return { db, key, userId: (r.data as { user_id: string } | null)?.user_id ?? null };
}

/** The senders you allow, so the script knows which mail to look for. */
export async function GET(req: Request) {
  const u = await userFor(req);
  if (!u?.userId || !u.db) return NextResponse.json({ error: u && !u.db ? "Service role key missing" : "Forbidden" }, { status: u && !u.db ? 503 : 403 });
  const r = await u.db.from("bill_email_senders").select("email").eq("user_id", u.userId).limit(100);
  return NextResponse.json({ senders: ((r.data ?? []) as { email: string }[]).map((x) => x.email) }, { headers: { "Cache-Control": "no-store" } });
}

/** One email from the script. Answers 200 for anything it should not be sent again. */
export async function POST(req: Request) {
  const u = await userFor(req);
  if (!u?.userId || !u.db) return NextResponse.json({ error: u && !u.db ? "Service role key missing" : "Forbidden" }, { status: u && !u.db ? 503 : 403 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return NextResponse.json({ ok: true, status: "too_large" });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: true, status: "bad_json" }); }
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const payload: InboundPayload = {
    From: str(body.From, 300), Subject: str(body.Subject, 300), Date: str(body.Date, 40), MessageID: str(body.MessageID, 200), TextBody: str(body.TextBody, 60000),
    MailboxHash: u.key,
    Headers: [{ Name: "Authentication-Results", Value: str(body.Auth, 2000) ?? "" }],
    Attachments: Array.isArray(body.Attachments) ? (body.Attachments as InboundPayload["Attachments"])!.slice(0, 1) : [],
  };
  try {
    const result = await handleInbound(u.db, payload, (userId, b) => sendPush(userId, "billEmail", "reminders", { item: b.company, label: b.month, date: b.due ?? undefined }), verifyMode(process.env.INBOUND_EMAIL_AUTH));
    if (!result.ok) console.error("[bill-email]", result.error);
    return NextResponse.json(result.ok ? { ok: true, status: result.status } : { ok: false }, { status: result.ok ? 200 : 500 });
  } catch (e) {
    console.error("[bill-email]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
