import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { handleInbound, verifyMode, type InboundPayload } from "@/lib/bill-email-inbound";
import { sendPush, serviceClient } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY = 12 * 1024 * 1024;

const digest = (v: string) => createHash("sha256").update(v).digest();

/** The secret may come as the password of HTTP basic auth (https://user:secret@host/...), a header, or ?secret= . */
function authorized(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret || secret.length < 16) return false; // fail closed, and a short secret is no secret
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  const fromBasic = basic ? Buffer.from(basic[1], "base64").toString("utf8").split(":").slice(1).join(":") : "";
  const given = fromBasic || req.headers.get("x-inbound-secret") || new URL(req.url).searchParams.get("secret") || "";
  return timingSafeEqual(digest(given), digest(secret));
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
    const result = await handleInbound(db, payload, (userId, b) => sendPush(userId, "billEmail", "reminders", { item: b.company, label: b.month, date: b.due ?? undefined }), verifyMode(process.env.INBOUND_EMAIL_AUTH));
    if (!result.ok) console.error("[bill-email]", result.error);
    return NextResponse.json(result.ok ? { ok: true, status: result.status } : { ok: false });
  } catch (e) {
    console.error("[bill-email]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false });
  }
}
