import { breakdown, contactUrl, daysLabel, daysLeft, frequencyLabel, urgencyOf, type ClientView } from "@/lib/iptv";
import { cn } from "@/lib/utils";

const bar: Record<string, string> = { expired: "bg-red-300", now: "bg-red-300", soon: "bg-amber-300", ok: "bg-emerald-300" };

/** What a client sees: first name, plan, dates and renewal history. Nothing else is ever passed in. */
export function ClientSubscription({ view, today }: { view: ClientView; today: string }) {
  const days = daysLeft(view.expire_date, today);
  const u = urgencyOf(days);
  const b = breakdown(view.expire_date, today);
  const total = Math.max(1, daysLeft(view.expire_date, view.date_subscribed || view.expire_date));
  const pct = Math.max(2, Math.min(100, Math.round((Math.max(0, days) / total) * 100)));
  const reach = contactUrl(view.owner_contact, `Hi ${view.owner_name}, I would like to renew my ${view.plan} TV service.`);
  return (
    <div className="space-y-4">
      <section className="space-y-2.5 rounded-2xl bg-primary p-5 text-primary-foreground">
        <p className="flex justify-between text-sm opacity-85"><span>{view.first_name ? `${view.first_name}, your time left` : "Time left"}</span><span>Ends {view.expire_date}</span></p>
        <p className="text-4xl font-bold tracking-tight">{daysLabel(days)}</p>
        <span className="block h-2 rounded bg-white/20"><span className={cn("block h-2 rounded", bar[u])} style={{ width: `${pct}%` }} /></span>
        <p className="text-sm opacity-85">{b.expired ? "Your service has ended." : `${b.years} years, ${b.months} months, ${b.days} days`} · {view.plan}{view.frequency ? ` · ${frequencyLabel(view.frequency).toLowerCase()}` : ""}</p>
      </section>
      {(u === "expired" || u === "now" || u === "soon") && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          {u === "expired" ? "Your service has ended." : "Your service ends soon."} Contact {view.owner_name} to renew.
          {reach && <> <a href={reach} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Send a message</a></>}
        </p>
      )}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription history</h2>
      <div className="divide-y rounded-xl border bg-card px-4">
        <p className="flex justify-between py-3 text-sm"><span>Started</span><span className="text-muted-foreground">{view.date_subscribed || "—"}</span></p>
        {view.history.map((h, i) => (
          <p key={`${h.renewed_on}-${i}`} className="flex justify-between py-3 text-sm"><span>Renewed {h.renewed_on}</span><span className="text-muted-foreground">until {h.expires_after || "—"}</span></p>
        ))}
      </div>
    </div>
  );
}
