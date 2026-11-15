import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { rateLimit } from "@/lib/rate-limit";
import { parseTxid } from "@/lib/bitcoin";
import { serviceDb } from "@/lib/btc-server";

export const dynamic = "force-dynamic";

/** Body: { id, txid? }. "I have paid": the admin now sees the request. Works after the price expired too, for someone who already sent it. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`btc-paid:${user.id}`, 30, 3600))) return NextResponse.json({ error: "Too many tries. Try again in a while." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Choose a payment." }, { status: 400 });
  const raw = typeof body.txid === "string" ? body.txid.trim() : "";
  const txid = raw ? parseTxid(raw) : null;
  if (raw && !txid) return NextResponse.json({ error: "That does not look like a transaction ID. It has 64 letters and numbers. You can leave it empty." }, { status: 400 });
  const db = serviceDb();
  if (!db) return NextResponse.json({ error: "Bitcoin is not available right now." }, { status: 503 });
  const { data: pay } = await db.from("plan_payments").select("id, claimed_at").eq("id", id).eq("user_id", user.id).eq("method", "bitcoin").eq("status", "pending").maybeSingle();
  if (!pay) return NextResponse.json({ error: "That payment is no longer waiting." }, { status: 404 });
  const patch: Record<string, unknown> = { claimed_at: pay.claimed_at ?? new Date().toISOString() };
  if (txid) patch.txid = txid;
  const { error } = await db.from("plan_payments").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not send. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
