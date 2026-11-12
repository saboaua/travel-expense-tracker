"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { useUtilityBills } from "@/lib/personal/use-utility-bills";
import { dueState, kindLabel, monthChange, monthLabel, monthLines, monthStart, shiftMonth } from "@/lib/personal/utilities";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";

const STATUS = {
  paid: { text: "Paid", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  unpaid: { text: "Not paid yet", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  missing: { text: "No bill yet", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
} as const;

/** This month's water, electricity and the rest: what you added, what is paid, what is still missing. */
export function UtilitiesOverview() {
  const today = todayISO();
  const [month, setMonth] = useState(monthStart(today));
  const { rows, error } = useUtilityBills();
  const [day, setDay] = useState<string>("");
  const [askDay, setAskDay] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    createClient().from("utility_prefs").select("remind_day").maybeSingle().then(({ data }) => {
      const d = (data as { remind_day: number | null } | null)?.remind_day;
      if (d) setDay(String(d));
    });
  }, []);

  const all = rows ?? [];
  const lines = useMemo(() => monthLines(all, month), [all, month]);
  const { total, change } = useMemo(() => monthChange(all, month), [all, month]);
  const isNow = month === monthStart(today);

  const saveDay = async (value: string) => {
    setDay(value); setSaved(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error: e } = await supabase.from("utility_prefs").upsert({ user_id: session.user.id, remind_day: value ? Number(value) : null, updated_at: new Date().toISOString() });
    setSaved(e ? "Could not save the day. Check your connection." : value ? `We will remind you on day ${value} of each month.` : "Reminder turned off.");
  };

  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8">
      <Link href="/personal" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Personal</Link>
      <h1 className="text-[26px] font-bold leading-tight">Utilities</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Add each bill yourself, then trace back what you paid and when.</p>
      {error && <Alert className="mt-3">{error}</Alert>}

      <div className="mt-4 flex items-center justify-between rounded-2xl border bg-card px-2">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <span className="text-[15px] font-bold" data-testid="util-month">{monthLabel(month)}</span>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isNow} aria-label="Next month" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>

      <div className="mt-3 rounded-2xl border bg-card p-4">
        <p className="text-[28px] font-bold tabular-nums leading-none" data-testid="util-total">{formatCurrency(total, "USD")} <span className="text-sm font-semibold text-muted-foreground">in {monthLabel(month).split(" ")[0]}</span></p>
        <p className="mt-1 text-xs text-muted-foreground">
          {change == null ? "Shown in USD so different currencies add up." : change === 0 ? "The same as last month." : `${formatCurrency(Math.abs(change), "USD")} ${change > 0 ? "more" : "less"} than last month.`}
        </p>
      </div>

      <div className="mt-3 rounded-2xl border bg-card px-4" data-testid="util-list">
        {rows === null ? <p className="py-4 text-sm text-muted-foreground">&nbsp;</p> : lines.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No bills yet. Tap Add bill to start with water or electricity.</p>
        ) : (
          <ul className="divide-y">
            {lines.map((l) => {
              const first = l.bills[0];
              const due = first ? dueState(first, today) : null;
              const st = STATUS[l.status];
              return (
                <li key={l.kind} data-testid="util-row">
                  <Link href={`/personal/utilities/history?kind=${l.kind}`} className="flex min-h-14 items-center gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{kindLabel(l.kind)}{l.provider ? <span className="font-normal text-muted-foreground"> · {l.provider}</span> : null}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {l.status === "missing" ? "Tap to see past bills" : l.status === "paid" ? `Paid ${first?.paid_on ? formatDate(first.paid_on) : ""}` : first?.due_date ? `Due ${formatDate(first.due_date)}${due === "late" ? " · late" : ""}` : "Add the payment when you pay"}
                        {l.bills.some((b) => b.waiting) ? " · waiting to send" : ""}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      {l.status !== "missing" && <span className="text-[15px] font-bold tabular-nums">{l.bills.length === 1 ? formatCurrency(Number(first.amount), first.currency) : formatCurrency(l.usd, "USD")}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Link href="/personal/utilities/add" className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="util-add"><Plus className="h-5 w-5" aria-hidden="true" />Add bill</Link>

      <div className="mt-4">
        <button type="button" onClick={() => setAskDay((v) => !v)} aria-expanded={askDay} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="util-remind">{day ? `Reminder: day ${day} of the month` : "Remind me to add bills"}</button>
        {askDay && (
          <div className="mt-1 rounded-2xl border bg-card p-4">
            <label htmlFor="util-day" className="mb-1.5 block text-[13px] font-bold text-foreground/80">Remind me on day</label>
            <Select id="util-day" value={day} onChange={(e) => saveDay(e.target.value)}>
              <option value="">No reminder</option>
              {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">You get a phone alert that day if a utility you usually pay has no bill yet. Needs phone alerts turned on, with Payment reminders on.</p>
            {saved && <p className="mt-2 text-xs font-semibold" role="status" data-testid="util-remind-saved">{saved}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
