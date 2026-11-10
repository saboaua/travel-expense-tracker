import { daysBetween } from "@/lib/utils";
import { nextDue, type Sub } from "@/lib/subscriptions";
import { REMINDER_DAYS } from "@/lib/iptv";

export type ComingUpKind = "subscription" | "iptv" | "trip";
export type ComingUpItem = { key: string; kind: ComingUpKind; title: string; subtitle: string; date: string; days: number; label: string; tone: "red" | "amber" | "plain"; href: string };

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const when = (days: number) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${plural(days, "day")}`);
const toneOf = (days: number): ComingUpItem["tone"] => (days <= 3 ? "red" : days <= 7 ? "amber" : "plain");

type SubInput = Pick<Sub, "id" | "name" | "price" | "currency" | "cycle" | "next_payment" | "trial_ends" | "status" | "split_count">;
type ClientInput = { id: string; customer_id: string; plan: string; expire_date: string };
type TripInput = { id: string; name: string; start_date: string };

/**
 * The soonest few things across the person's own subscriptions, IPTV clients (only passed in for people who manage them) and trips,
 * soonest first. Subscriptions and trips look 30 days ahead; IPTV clients use the 15-day reminder window and also show ones that ended
 * in the last 7 days, so a client who needs a message is not missed.
 */
export function buildComingUp(
  input: { subs?: SubInput[]; clients?: ClientInput[]; customerNames?: Record<string, string>; trips?: TripInput[] },
  today: string,
  limit = 5,
): ComingUpItem[] {
  const out: ComingUpItem[] = [];
  for (const s of input.subs ?? []) {
    if (s.status !== "active") continue;
    const date = nextDue(s as Sub, today);
    const days = daysBetween(today, date);
    if (days > 30) continue;
    const trial = !!s.trial_ends && s.trial_ends >= today;
    out.push({ key: `sub-${s.id}`, kind: "subscription", title: s.name, subtitle: trial ? "Free trial ends" : "Subscription payment", date, days, label: when(days), tone: toneOf(days), href: "/personal/subscriptions" });
  }
  for (const c of input.clients ?? []) {
    const days = daysBetween(today, c.expire_date);
    if (days > REMINDER_DAYS || days < -7) continue;
    const label = days < 0 ? `Ended ${plural(-days, "day")} ago` : days === 0 ? "Ends today" : `${plural(days, "day")}`;
    out.push({ key: `iptv-${c.id}`, kind: "iptv", title: input.customerNames?.[c.customer_id] || "IPTV client", subtitle: `IPTV ${c.plan} ends`, date: c.expire_date, days, label, tone: days <= 7 ? "red" : "amber", href: `/admin/iptv/${c.customer_id}` });
  }
  for (const t of input.trips ?? []) {
    const days = daysBetween(today, t.start_date);
    if (days < 0 || days > 30) continue;
    out.push({ key: `trip-${t.id}`, kind: "trip", title: t.name, subtitle: "Trip starts", date: t.start_date, days, label: when(days), tone: toneOf(days), href: `/trips/${t.id}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key)).slice(0, limit);
}
