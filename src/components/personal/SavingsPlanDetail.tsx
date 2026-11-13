"use client";

import { setupNeeded } from "@/lib/setup-message";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pause, PiggyBank, Pencil, Play, Plus, SkipForward, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { parseBudgetInput } from "@/lib/personal/budget";
import { deposits, isPaused, pausedToday, progressPct, remaining, resumedToday, ruleText, savedSoFar, type SavingsEvent, type SavingsPlan } from "@/lib/personal/savings";
import { fetchSavings } from "@/lib/personal/savings-data";
import { isMissingColumn } from "@/lib/columns";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import { monthLabel } from "@/lib/personal/utilities";

const TEAL = "#0d9488";
const BADGE = {
  counted: { text: "Counted", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  coming: { text: "Coming up", cls: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  skipped: { text: "Skipped", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  extra: { text: "Extra deposit", cls: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200" },
} as const;

/** One plan: what is saved, the months it deposited, and the things you can do: an extra deposit, skip the next month, pause. */
export function SavingsPlanDetail() {
  const today = todayISO();
  const [id, setId] = useState<string | null>(null);
  const [plan, setPlan] = useState<SavingsPlan | null | undefined>(undefined);
  const [events, setEvents] = useState<SavingsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [extra, setExtra] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (planId: string) => {
    const r = await fetchSavings(createClient());
    if (r.failed) setError(r.missing ? setupNeeded("Savings","migration_savings.sql") : "Could not load your savings. Check your connection.");
    setPlan(r.plans.find((p) => p.id === planId) ?? null);
    setEvents(r.events.filter((e) => e.plan_id === planId));
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("id");
    setId(q);
    if (q) load(q); else setPlan(null);
  }, [load]);

  const run = async (fn: (db: ReturnType<typeof createClient>, userId: string) => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> => {
    if (!id) return false;
    setBusy(true); setError(null);
    const db = createClient();
    const { data: { session } } = await db.auth.getSession();
    const res = session ? await fn(db, session.user.id) : { error: { message: "Sign in again." } };
    setBusy(false);
    if (res.error) { setError("Could not save that. Check your connection."); return false; }
    await load(id);
    return true;
  };

  if (plan === undefined) return <div className="mx-auto max-w-lg p-4 md:p-8"><p className="text-sm text-muted-foreground">&nbsp;</p></div>;
  if (plan === null || !id) {
    return (
      <div className="mx-auto max-w-lg p-4 md:p-8">
        <Link href="/personal/savings" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Savings</Link>
        <Alert className="mt-3">{error ?? "That savings plan was not found."}</Alert>
      </div>
    );
  }

  const saved = savedSoFar(plan, events, today);
  const pct = progressPct(saved, plan.goal);
  const left = remaining(plan, events, today);
  const list = deposits(plan, events, today);
  const next = list.filter((d) => d.status === "coming").sort((a, b) => a.date.localeCompare(b.date))[0];
  const action = "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border bg-card px-1 text-[13px] font-semibold hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:gap-x-8">
      <div className="lg:col-span-2">
      <Link href="/personal/savings" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Savings</Link>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "#ccfbf1", color: TEAL }}><PiggyBank className="h-[22px] w-[22px]" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-bold leading-tight" data-testid="plan-name">{plan.name}</h1><p className="text-[13px] text-muted-foreground">{formatCurrency(plan.amount, plan.currency)} {ruleText(plan).replace("Every month, no end date", "every month, no end date").replace("Every month", "every month")}{isPaused(plan) ? " · paused" : ""}</p></div>
        <Link href={`/personal/savings/add?id=${plan.id}`} aria-label="Change plan" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"><Pencil className="h-5 w-5" aria-hidden="true" /></Link>
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
      </div>
      <div className="lg:col-start-1 lg:row-start-2">

      <div className="mt-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <span className="min-w-0 flex-1 basis-48"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved so far</p><p className="mt-1 break-words text-[32px] font-bold leading-tight tabular-nums" data-testid="plan-saved">{formatCurrency(saved, plan.currency)}</p></span>
          {pct != null && <span className="text-right text-[13px] text-muted-foreground">of {formatCurrency(plan.goal ?? 0, plan.currency)}<br /><b className="text-[15px] text-foreground">{pct}%</b></span>}
        </div>
        {pct != null && <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${pct}%`, background: TEAL }} /></div>}
        {left && <p className="mt-2 text-[13px] text-muted-foreground" data-testid="plan-remaining">{left.count} {left.count === 1 ? "deposit" : "deposits"} to go. {plan.goal ? (left.endsAt >= plan.goal ? `At ${formatCurrency(plan.amount, plan.currency)} a month the plan reaches your goal.` : `The plan ends at ${formatCurrency(left.endsAt, plan.currency)}, short of your goal by ${formatCurrency(plan.goal - left.endsAt, plan.currency)}. Raise the amount or push the last date out to get there.`) : `The plan ends at ${formatCurrency(left.endsAt, plan.currency)}.`}</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" className={action} onClick={() => setExtraOpen(!extraOpen)} data-testid="plan-extra"><Plus className="h-[18px] w-[18px]" aria-hidden="true" />Extra deposit</button>
        <button type="button" className={action} disabled={busy || !next} onClick={() => next && run((db, uid) => db.from("savings_events").insert({ user_id: uid, plan_id: plan.id, kind: "skip", month: next.month }))} data-testid="plan-skip"><SkipForward className="h-[18px] w-[18px]" aria-hidden="true" />Skip a month</button>
        <button type="button" className={action} disabled={busy} onClick={() => run(async (db) => { const paused = isPaused(plan); const body = { pauses: paused ? resumedToday(plan, today) : pausedToday(plan, today), paused_on: paused ? null : today }; const r = await db.from("savings_plans").update(body).eq("id", plan.id); if (!isMissingColumn(r.error)) return r; setError(setupNeeded("Pausing and resuming several times", "migration_audit_fixes.sql") + " Pausing works until then."); return db.from("savings_plans").update({ paused_on: body.paused_on }).eq("id", plan.id); })} data-testid="plan-pause">{isPaused(plan) ? <Play className="h-[18px] w-[18px]" aria-hidden="true" /> : <Pause className="h-[18px] w-[18px]" aria-hidden="true" />}{isPaused(plan) ? "Resume plan" : "Pause plan"}</button>
      </div>

      {extraOpen && (
        <form className="mt-3 flex items-center gap-2 rounded-2xl border bg-card p-3" data-testid="plan-extra-form" onSubmit={(e) => {
          e.preventDefault();
          const v = parseBudgetInput(extra);
          if (v == null) return setError("Type the amount of the extra deposit.");
          run((db, uid) => db.from("savings_events").insert({ user_id: uid, plan_id: plan.id, kind: "extra", month: `${today.slice(0, 7)}-01`, amount: v })).then((ok) => { if (ok) { setExtra(""); setExtraOpen(false); } });
        }}>
          <label htmlFor="plan-extra-amount" className="sr-only">Extra deposit amount</label>
          <input id="plan-extra-amount" inputMode="decimal" autoComplete="off" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={`Amount in ${plan.currency}`} className="h-12 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base tabular-nums" />
          <Button type="submit" disabled={busy} className="h-12" data-testid="plan-extra-save">Add</Button>
        </form>
      )}

      </div>
      <div className="lg:col-start-2 lg:row-start-2 lg:min-w-0">
      <p className="mt-5 lg:mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Deposits</p>
      <div className="mt-2 rounded-2xl border bg-card px-4" data-testid="plan-deposits">
        {list.map((d, i) => {
          const b = BADGE[d.status];
          const skipEvent = d.status === "skipped" ? events.find((e) => e.kind === "skip" && e.month === d.month) : d.status === "extra" ? events.find((e) => e.kind === "extra" && e.month === d.month && Number(e.amount) === d.amount) : null;
          return (
            <div key={`${d.status}-${d.date}-${i}`} className="flex min-h-14 items-center gap-2.5 border-t py-2 first:border-t-0" data-testid="plan-deposit" data-status={d.status}>
              <span className="min-w-0 flex-1"><b className="block text-[15px]">{monthLabel(d.month)}</b><span className="block text-[13px] text-muted-foreground">{d.status === "extra" ? "One-off deposit" : formatDate(d.date)}</span></span>
              <span className="text-right"><b className="block text-[15px] tabular-nums">{d.status === "skipped" ? "—" : formatCurrency(d.amount, plan.currency)}</b>
                <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${b.cls}`}>{d.status === "counted" && <Check className="h-3 w-3" aria-hidden="true" />}{b.text}</span></span>
              {skipEvent?.id && <button type="button" disabled={busy} onClick={() => run((db) => db.from("savings_events").delete().eq("id", skipEvent.id!))} className="min-h-11 px-1 text-xs font-semibold text-primary" data-testid="plan-unskip">{d.status === "extra" ? "Remove" : "Undo"}</button>}
            </div>
          );
        })}
        <div className="flex min-h-14 items-center gap-2.5 border-t py-2" data-testid="plan-opening-row">
          <span className="min-w-0 flex-1"><b className="block text-[15px]">Starting balance</b><span className="block text-[13px] text-muted-foreground">Saved before the plan started</span></span>
          <b className="text-[15px] tabular-nums">{formatCurrency(plan.opening_balance, plan.currency)}</b>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground">Each deposit is counted in its month&rsquo;s budget as Savings. Skip a month and it is left out of both the budget and the total. An extra deposit is a one-off that counts in the month you add it.</p>

      <div className="mt-4">
        {confirmDelete ? (
          <div className="flex items-center gap-2 rounded-2xl border border-red-200 p-3"><span className="flex-1 text-sm">Delete this plan and its history?</span>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} className="h-11">Keep</Button>
            <Button onClick={() => run((db) => db.from("savings_plans").delete().eq("id", plan.id)).then((ok) => { if (ok) window.location.href = "/personal/savings"; })} className="h-11 bg-red-600 hover:bg-red-700" data-testid="plan-delete-yes">Delete</Button></div>
        ) : <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-red-600 hover:text-red-700" data-testid="plan-delete">Delete this plan</button>}
      </div>
      </div>
    </div>
  );
}
