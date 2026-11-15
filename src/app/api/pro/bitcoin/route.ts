import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/supabase/session";
import { rateLimit } from "@/lib/rate-limit";
import { rateToUsd } from "@/lib/currencies";
import { btcAmount, quoteExpired } from "@/lib/bitcoin";
import { getBtcUsd } from "@/lib/btc-price";
import { hasFreeAddress, loadSettings, serviceDb } from "@/lib/btc-server";
import { PAYMENT_COLS, isPayPeriod, priceFor, userReference, type PlanPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Is Bitcoin on, and is there an address left? Used to show or hide the Bitcoin tab. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = serviceDb();
  if (!db) return NextResponse.json({ available: false });
  const s = await loadSettings(db);
  const available = !!s && s.btc_enabled && (await hasFreeAddress(db));
  return NextResponse.json({ available, confirmations: s?.btc_confirmations ?? 0, quoteMinutes: s?.btc_quote_minutes ?? 30 });
}

/** Body: { period }. Locks a Bitcoin amount and an address for this person. Asking again returns the same quote while it is valid. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`btc-quote:${user.id}`, 20, 3600))) return NextResponse.json({ error: "Too many tries. Try again in a while." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  if (!isPayPeriod(body.period)) return NextResponse.json({ error: "Choose monthly or yearly." }, { status: 400 });
  const period = body.period;
  const db = serviceDb();
  if (!db) return NextResponse.json({ error: "Bitcoin is not available right now." }, { status: 503 });
  const settings = await loadSettings(db);
  if (!settings || !settings.btc_enabled) return NextResponse.json({ error: "Bitcoin is not available right now." }, { status: 400 });

  const { data: existingRow } = await db.from("plan_payments").select(PAYMENT_COLS).eq("user_id", user.id).eq("status", "pending").maybeSingle();
  const existing = existingRow as unknown as PlanPayment | null;
  if (existing) {
    if (existing.method !== "bitcoin") return NextResponse.json({ error: "You already have a payment waiting. Your admin will check it." }, { status: 409 });
    const stillGood = existing.claimed_at || (existing.period === period && !quoteExpired(existing.expires_at));
    if (stillGood) return NextResponse.json({ ok: true, payment: existing });
    await db.from("plan_payments").update({ status: "expired" }).eq("id", existing.id).eq("status", "pending");
  }

  const price = priceFor(settings, period);
  if (!(price > 0)) return NextResponse.json({ error: "Pro prices are not set up yet. Ask your admin." }, { status: 400 });
  let usdPerUnit: number;
  try {
    const { data: cur } = await db.from("currencies").select("usd_rate").eq("code", settings.currency).maybeSingle();
    usdPerUnit = await rateToUsd(settings.currency, cur?.usd_rate == null ? null : Number(cur.usd_rate));
  } catch { return NextResponse.json({ error: "Could not work out the price. Try again in a minute." }, { status: 503 }); }
  const btcUsd = await getBtcUsd();
  if (btcUsd == null) return NextResponse.json({ error: "Could not get the Bitcoin price. Try again in a minute." }, { status: 503 });
  const amount = btcAmount(price, usdPerUnit, btcUsd);
  if (amount == null) return NextResponse.json({ error: "Could not work out the Bitcoin amount." }, { status: 503 });

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + settings.btc_quote_minutes * 60_000).toISOString();
  const { error: insErr } = await db.from("plan_payments").insert({ id, user_id: user.id, period, amount: price, currency: settings.currency, method: "bitcoin", reference: userReference(user.id), status: "pending", btc_amount: amount, btc_rate_usd: Math.round(btcUsd * 100) / 100, expires_at: expiresAt });
  if (insErr) {
    if (insErr.code === "23505") {
      const { data: againRow } = await db.from("plan_payments").select(PAYMENT_COLS).eq("user_id", user.id).eq("status", "pending").maybeSingle();
      const again = againRow as unknown as PlanPayment | null;
      if (again?.method === "bitcoin") return NextResponse.json({ ok: true, payment: again });
      return NextResponse.json({ error: "You already have a payment waiting. Your admin will check it." }, { status: 409 });
    }
    return NextResponse.json({ error: /btc_|plan_payments_method_check|claimed_at|expires_at/.test(insErr.message) ? "Bitcoin is not set up yet. Ask your admin." : "Could not start the Bitcoin payment." }, { status: 500 });
  }

  // Take one unused address. The update only succeeds while the address is still free, so two people never get the same one.
  let address: string | null = null;
  for (let i = 0; i < 6 && !address; i++) {
    const { data: free } = await db.from("btc_addresses").select("address").is("payment_id", null).order("created_at", { ascending: true }).limit(1);
    const candidate = free?.[0]?.address as string | undefined;
    if (!candidate) break;
    const { data: took } = await db.from("btc_addresses").update({ payment_id: id }).eq("address", candidate).is("payment_id", null).select("address");
    if ((took ?? []).length === 1) address = candidate;
  }
  if (!address) {
    await db.from("plan_payments").delete().eq("id", id);
    return NextResponse.json({ error: "Bitcoin is not available right now. Pay by bank transfer or try again later." }, { status: 503 });
  }
  const { data: payment } = await db.from("plan_payments").update({ btc_address: address }).eq("id", id).select(PAYMENT_COLS).maybeSingle();
  return NextResponse.json({ ok: true, payment });
}
