import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { sendPush } from "@/lib/push";
import { SUBSCRIPTION_COLS } from "@/lib/columns";
import { dueForReminder as dueSubs, nextDue, type Sub } from "@/lib/subscriptions";
import { dueForReminder as dueClients } from "@/lib/iptv";
import { addDaysISO, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/**
 * Daily: one phone alert per person who has a subscription payment coming up inside the days they chose, and one to each
 * admin when IPTV clients are within 15 days of expiring. Each date is reminded once (reminded_for). Travellers get one alert 3 days and 1 day before a trip starts. The alert text never
 * says which subscription or client; the person opens the app for that. Email is not sent: the app has no email service.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const today = todayISO();
  try {
    let people = 0;
    const subs = await db.from("subscriptions").select(`user_id, reminded_for, ${SUBSCRIPTION_COLS}`).eq("status", "active").limit(5000);
    if (subs.error && !/does not exist|schema cache/i.test(subs.error.message)) throw new Error(subs.error.message);
    const byUser = new Map<string, (Sub & { user_id: string })[]>();
    for (const r of (subs.data ?? []) as unknown as (Sub & { user_id: string })[]) {
      const row = { ...r, price: Number(r.price), price_history: Array.isArray(r.price_history) ? r.price_history : [] };
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), row]);
    }
    for (const [userId, list] of byUser) {
      const due = dueSubs(list, today);
      if (!due.length) continue;
      await sendPush(userId, "subscription", "reminders");
      people++;
      for (const s of due) await db.from("subscriptions").update({ reminded_for: nextDue(s, today) }).eq("id", s.id);
    }

    let clients = 0;
    const iptv = await db.from("iptv_clients").select("id, expire_date, reminded_for").limit(5000);
    if (iptv.error && !/does not exist|schema cache/i.test(iptv.error.message)) throw new Error(iptv.error.message);
    const dueC = dueClients(((iptv.data ?? []) as { id: string; expire_date: string; reminded_for: string | null }[]), today);
    if (dueC.length) {
      const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
      for (const a of admins ?? []) await sendPush(a.id as string, "iptv", "reminders");
      for (const c of dueC) await db.from("iptv_clients").update({ reminded_for: c.expire_date }).eq("id", c.id);
      clients = dueC.length;
    }
    // Trips: everyone with an active trip starting in 3 days or tomorrow gets one alert (a day-exact match, so nothing is stored)
    let travellers = 0;
    const trips = await db.from("trips").select("user_id").eq("status", "active").in("start_date", [addDaysISO(today, 1), addDaysISO(today, 3)]).limit(5000);
    if (trips.error) throw new Error(trips.error.message);
    for (const userId of new Set(((trips.data ?? []) as { user_id: string }[]).map((t) => t.user_id))) {
      await sendPush(userId, "trip", "trips");
      travellers++;
    }
    return NextResponse.json({ ok: true, people, clients, travellers });
  } catch (e) {
    console.error("[cron] reminders", e instanceof Error ? e.message : e);
    await notifyJobFailure(db, "Subscription and IPTV reminders");
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
