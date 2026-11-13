import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { handleInbound, type InboundPayload } from "@/lib/bill-email-inbound";
import { sendPush, serviceClient } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY = 12 * 1024 * 1024;

function authorized(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return false; // fail closed
  const given = new URL(req.url).searchParams.get("secret") || req.headers.get("x-inbound-secret") || "";
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** The email service (Postmark inbound) posts each forwarded email here. Answers 200 for anything it should not retry. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return NextResponse.json({ ok: true, status: "too_large" });
  let payload: InboundPayload;
  try { payload = (await req.json()) as InboundPayload; } catch { return NextResponse.json({ ok: true, status: "bad_json" }); }
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "Service role key missing" }, { status: 503 });
  try {
    const result = await handleInbound(db, payload, (userId, b) => sendPush(userId, "billEmail", "reminders", { item: b.company, label: b.month, date: b.due ?? undefined }));
    if (!result.ok) console.error("[bill-email]", result.error);
    return NextResponse.json(result.ok ? { ok: true, status: result.status } : { ok: false });
  } catch (e) {
    console.error("[bill-email]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false });
  }
}
