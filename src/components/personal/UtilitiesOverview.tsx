"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Check, ChevronLeft, ChevronRight, Mail, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { useUtilityBills } from "@/lib/personal/use-utility-bills";
import { dueBills, dueLabel, kindLabel, monthChange, monthLabel, monthStart, paidIn, percentChange, shiftMonth, splitByKind, trend, type BillRow } from "@/lib/personal/utilities";
import { EmailChip, LateChip, MissingChip, Money, PaidChip, addAmountBtn, payBtn, reviewBtn, RefChip, SoonChip, SplitBar, TrendBars, UtilityIcon } from "@/components/personal/utility-ui";
import { MarkPaidSheet } from "@/components/personal/MarkPaidSheet";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import { toAwg } from "@/lib/personal/utilities";

/** This month's water, electricity and the rest: what you added, what is paid, what is still missing. */
export function UtilitiesOverview() {
  const today = todayISO();
  const [month, setMonth] = useState(monthStart(today));
  const { rows, error, reload } = useUtilityBills();
  const [paying, setPaying] = useState<BillRow | null>(null);
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
  const paid = useMemo(() => paidIn(all, month), [all, month]);
  const due = useMemo(() => dueBills(all), [all]);
  const { total } = useMemo(() => monthChange(all, month), [all, month]);
  const isNow = month === monthStart(today);
  const months = useMemo(() => trend(all, month, 4), [all, month]);
  const split = useMemo(() => splitByKind(paid), [paid]);
  const pct = percentChange(total, monthChange(all, shiftMonth(month, -1)).total);
  const awg = (usd: number) => formatCurrency(toAwg(usd), "AWG");
  const mName = monthLabel(month).split(" ")[0];
  const prevName = monthLabel(shiftMonth(month, -1)).split(" ")[0];
  const forMonth = (b: BillRow) => `for ${monthLabel(b.bill_month).split(" ")[0]}${b.bill_month.slice(0, 4) !== month.slice(0, 4) ? ` ${b.bill_month.slice(0, 4)}` : ""}`;
  const lateCount = due.filter((b) => dueLabel(b, today).state === "late").length;

  const saveDay = async (value: string) => {
    setDay(value); setSaved(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error: e } = await supabase.from("utility_prefs").upsert({ user_id: session.user.id, remind_day: value ? Number(value) : null, updated_at: new Date().toISOString() });
    setSaved(e ? "Could not save the day. Check your connection." : value ? `We will remind you on day ${value} of each month.` : "Reminder turned off.");
  };

  const card = "rounded-2xl border bg-card";
  const secLabel = "text-xs font-bold uppercase tracking-wider text-muted-foreground";
  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8 lg:max-w-6xl">
      <Link href="/personal" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Personal</Link>
      <h1 className="text-[26px] font-bold leading-tight">Utilities</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Add each bill yourself or send it from email. Money counts in the month you paid it; each bill says which month it is for.</p>
      {error && <Alert className="mt-3">{error}</Alert>}

      <div className={`mt-4 flex items-center justify-between px-2 lg:max-w-md ${card}`}>
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <span className="text-[15px] font-bold" data-testid="util-month">{monthLabel(month)}</span>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isNow} aria-label="Next month" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        {/* Summary: first on a phone, on the right of the lists on a desktop */}
        <aside className="order-1 space-y-3 lg:order-2" aria-label="This month">
          <div className={`${card} p-4`}>
            <p className={secLabel}>Paid in {mName}</p>
            <p className="mt-1 leading-none" data-testid="util-total"><Money amount={toAwg(total)} currency="AWG" size="text-[36px]" /></p>
            {pct != null && (
              <p className="mt-2"><span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-bold" data-testid="util-change">{pct === 0 ? `Same as ${prevName}` : `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than ${prevName}`}</span></p>
            )}
            <div className="mt-3.5 border-t pt-3">
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">Last 4 months</p>
              <TrendBars data={months} fmt={awg} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Florins (AWG, the same as Afl.). Other currencies are converted.</p>
          </div>
          {split.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="mb-2.5 flex justify-between text-[13px]"><span className="font-bold">Where it went</span><span className="text-muted-foreground">{paid.length} {paid.length === 1 ? "bill" : "bills"}</span></div>
              <SplitBar parts={split} label={kindLabel} />
            </div>
          )}
        </aside>

        <div className="order-2 min-w-0 space-y-3 lg:order-1">
          <div className="flex gap-2.5">
            <Link href="/personal/utilities/add" className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="util-add"><Plus className="h-5 w-5" aria-hidden="true" />Add bill</Link>
            <Link href="/personal/utilities/emails" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border bg-card text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="util-emails-link"><Mail className="h-4 w-4" aria-hidden="true" />From email</Link>
          </div>

          {due.length > 0 && (
            <section aria-labelledby="util-due-h">
              <div className="mt-2 flex items-end justify-between gap-2">
                <div><h2 id="util-due-h" className={secLabel}>Due and upcoming</h2><p className="mt-0.5 text-xs text-muted-foreground">These count in your total and budget once you pay them.</p></div>
                {lateCount > 0 && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11.5px] font-bold text-red-800 dark:bg-red-950 dark:text-red-200">{lateCount} late</span>}
              </div>
              <ul className={`mt-2 divide-y px-4 ${card}`} data-testid="util-due-list">
                {due.map((b) => {
                  const dl = dueLabel(b, today);
                  const known = Number(b.amount) > 0;
                  return (
                    <li key={b.id} data-testid="util-due" className="flex items-center gap-3 py-3">
                      <Link href={`/personal/utilities/add?id=${b.id}`} className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <UtilityIcon kind={b.kind} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold">{kindLabel(b.kind)}{b.provider ? <span className="font-medium text-muted-foreground"> · {b.provider}</span> : null}</span>
                          <span className="block text-[12.5px] text-muted-foreground">{forMonth(b)}{b.needs_check && b.source === "email" && known ? " (check)" : ""}{b.due_date ? ` · due ${formatDate(b.due_date)}` : " · no due date"}{b.waiting ? " · waiting to send" : ""}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {dl.state === "late" ? <LateChip text={dl.text} /> : dl.state !== "none" ? <SoonChip text={dl.text} /> : null}
                            {!known && <span data-testid="util-amount-missing"><MissingChip /></span>}
                            {b.source === "email" && <EmailChip />}
                          </span>
                        </span>
                      </Link>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {known && <Money amount={Number(b.amount)} currency={b.currency} className={dl.state === "late" ? "text-red-700 dark:text-red-300" : ""} />}
                        {known ? (
                          <button type="button" onClick={() => setPaying(b)} data-testid="util-pay" className={dl.state === "late" || dl.state === "soon" ? payBtn : reviewBtn}>{dl.state === "late" || dl.state === "soon" ? <><Check className="h-4 w-4" aria-hidden="true" />Mark paid</> : <>Review<ChevronRight className="h-4 w-4" aria-hidden="true" /></>}</button>
                        ) : (
                          <Link href={`/personal/utilities/add?id=${b.id}`} className={addAmountBtn}><Plus className="h-4 w-4" aria-hidden="true" />Add amount</Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="util-paid-h">
            <div className="mt-2 flex items-baseline justify-between"><h2 id="util-paid-h" className={secLabel}>Paid in {mName}</h2>{paid.length > 0 && <Money amount={toAwg(total)} currency="AWG" size="text-[15px]" />}</div>
            <div className={`mt-2 px-4 ${card}`} data-testid="util-list">
              {rows === null ? <p className="py-4 text-sm text-muted-foreground">&nbsp;</p> : paid.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{all.length === 0 ? "No bills yet. Tap Add bill to start with water or electricity." : `Nothing paid in ${mName}.`}</p>
              ) : (
                <ul className="divide-y">
                  {paid.map((b) => (
                    <li key={b.id} data-testid="util-row">
                      <Link href={`/personal/utilities/history?kind=${b.kind}`} className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <UtilityIcon kind={b.kind} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold">{kindLabel(b.kind)}{b.provider ? <span className="font-medium text-muted-foreground"> · {b.provider}</span> : null}</span>
                          <span className="block text-[12.5px] text-muted-foreground">{forMonth(b)} · paid {b.paid_on ? formatDate(b.paid_on) : ""}{b.waiting ? " · waiting to send" : ""}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5"><PaidChip />{b.payment_ref && <RefChip value={b.payment_ref} />}</span>
                        </span>
                        <Money amount={Number(b.amount)} currency={b.currency} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <div className="pt-1">
            <button type="button" onClick={() => setAskDay((v) => !v)} aria-expanded={askDay} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="util-remind"><BellRing className="h-[18px] w-[18px]" aria-hidden="true" />{day ? `Reminder: day ${day} of the month` : "Remind me to add bills"}</button>
            {askDay && (
              <div className={`mt-1 p-4 ${card}`}>
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
      </div>
      {paying && <MarkPaidSheet bill={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />}
    </div>
  );
}
