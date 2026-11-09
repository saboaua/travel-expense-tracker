import { breakdown, contactUrl, daysLabel, daysLeft, frequencyLabel, urgencyOf, type CustomerView, type SubView } from "@/lib/iptv";
import { cn } from "@/lib/utils";

const card: Record<string, string> = { expired: "bg-red-900", now: "bg-primary", soon: "bg-primary", ok: "bg-primary" };
const bar: Record<string, string> = { expired: "bg-red-300", now: "bg-red-300", soon: "bg-amber-300", ok: "bg-emerald-300" };
const nameOf = (s: SubView) => [s.plan, s.model].filter(Boolean).join(" · ");

function SubCard({ sub, today, owner, contact, many }: { sub: SubView; today: string; owner: string; contact: string | null; many: boolean }) {
  const days = daysLeft(sub.expire_date, today);
  const u = urgencyOf(days);
  const b = breakdown(sub.expire_date, today);
  const total = Math.max(1, daysLeft(sub.expire_date, sub.date_subscribed || sub.expire_date));
  const pct = Math.max(2, Math.min(100, Math.round((Math.max(0, days) / total) * 100)));
  const reach = contactUrl(contact, `Hi ${owner}, I would like to renew my ${nameOf(sub)} TV subscription.`);
  return (
    <section className={cn("space-y-2.5 rounded-2xl p-5 text-primary-foreground", card[u])}>
      <p className="flex justify-between gap-3 text-sm"><span className="font-semibold">{many ? nameOf(sub) : "Time left"}</span><span className="opacity-85">{b.expired ? "Ended" : "Ends"} {sub.expire_date}</span></p>
      <p className="text-3xl font-bold tracking-tight">{days < 0 ? `Ended ${-days} day${days === -1 ? "" : "s"} ago` : daysLabel(days)}</p>
      <span className="block h-2 rounded bg-white/20"><span className={cn("block h-2 rounded", bar[u])} style={{ width: `${pct}%` }} /></span>
      <p className="text-sm opacity-85">{b.expired ? "This service has ended." : `${b.years} years, ${b.months} months, ${b.days} days`} · {many ? "" : `${nameOf(sub)} · `}{sub.frequency ? `${frequencyLabel(sub.frequency).toLowerCase()} plan` : ""}</p>
      {(u === "expired" || u === "now" || u === "soon") && (
        reach
          ? <a href={reach} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-lg bg-white text-sm font-bold text-slate-900">Message {owner} to renew</a>
          : <p className="text-sm font-semibold">Contact {owner} to renew.</p>
      )}
    </section>
  );
}

/** What a client sees: first name, every subscription with its dates, and the renewal history. Nothing else is ever passed in. */
export function ClientSubscription({ view, today }: { view: CustomerView; today: string }) {
  const many = view.subscriptions.length > 1;
  const ending = view.subscriptions.filter((s) => urgencyOf(daysLeft(s.expire_date, today)) !== "ok").length;
  const history = view.subscriptions
    .flatMap((s) => [...s.history.map((h) => ({ at: h.renewed_on, text: `${nameOf(s)} · renewed ${h.renewed_on}`, until: h.expires_after })), ...(s.date_subscribed ? [{ at: s.date_subscribed, text: `${nameOf(s)} · started ${s.date_subscribed}`, until: "" }] : [])])
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {view.first_name ? `Hi ${view.first_name}, ` : ""}you have {view.subscriptions.length} subscription{many ? "s" : ""}.{ending ? ` ${ending} ${ending === 1 ? "needs" : "need"} renewing.` : ""}
      </p>
      {view.subscriptions.map((s, i) => <SubCard key={i} sub={s} today={today} owner={view.owner_name} contact={view.owner_contact} many={many} />)}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
      <div className="divide-y rounded-xl border bg-card px-4">
        {history.map((h, i) => (
          <p key={i} className="flex justify-between gap-3 py-3 text-sm"><span>{h.text}</span><span className="shrink-0 text-muted-foreground">{h.until ? `until ${h.until}` : ""}</span></p>
        ))}
      </div>
    </div>
  );
}
