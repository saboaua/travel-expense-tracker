"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { setupNeeded } from "@/lib/setup-message";
import { FIXED_COST_COLS, FIXED_ENTRY_COLS } from "@/lib/columns";
import {
  CATEGORY_LABEL, KIND_LABEL, MONTHS, gamblingState, monthLabel, monthLines, nextYearly, paymentsLeft, readCost, readEntry,
  type FixedCategory, type FixedCost, type FixedEntry, type FixedKind, type FixedSchedule,
} from "@/lib/personal/fixed-costs";
import { convert, round2, type BudgetCurrency } from "@/lib/personal/money";
import { formatCurrency, todayISO } from "@/lib/utils";

const label = "mb-1.5 block text-[13px] font-bold";
const field = "h-12 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary";
const SETUP = setupNeeded("Fixed costs", "migration_fixed_costs.sql");
const isMissing = (m?: string) => /relation|schema cache|does not exist/i.test(m ?? "");
const toNum = (t: string) => { const n = Number(t.trim().replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const monthStartOf = (iso: string) => `${iso.slice(0, 7)}-01`;

/* ---------------- loading ---------------- */

type Loaded = { costs: FixedCost[]; entries: FixedEntry[]; missing: boolean; ready: boolean; uid: string | null };

/** Your fixed costs and the card and gambling entries of the last 12 months */
function useFixed(): Loaded & { reload: () => Promise<void> } {
  const [state, setState] = useState<Loaded>({ costs: [], entries: [], missing: false, ready: false, uid: null });
  const reload = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return setState((s) => ({ ...s, ready: true }));
    const since = `${Number(todayISO().slice(0, 4)) - 1}-${todayISO().slice(5, 7)}-01`;
    const [c, e] = await Promise.all([
      sb.from("fixed_costs").select(FIXED_COST_COLS).limit(50),
      sb.from("fixed_entries").select(FIXED_ENTRY_COLS).gte("on_date", since).order("on_date", { ascending: false }).limit(500),
    ]);
    if (c.error || e.error) return setState({ costs: [], entries: [], missing: isMissing(c.error?.message ?? e.error?.message), ready: true, uid: session.user.id });
    setState({
      costs: ((c.data ?? []) as unknown as Record<string, unknown>[]).map(readCost).filter((x): x is FixedCost => !!x),
      entries: ((e.data ?? []) as unknown as Record<string, unknown>[]).map(readEntry).filter((x): x is FixedEntry => !!x),
      missing: false, ready: true, uid: session.user.id,
    });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

async function saveCost(uid: string, c: Omit<FixedCost, "id" | "active">) {
  return createClient().from("fixed_costs").upsert({ user_id: uid, ...c, active: true }, { onConflict: "user_id,kind" });
}
const removeCost = (uid: string, kind: FixedKind) => createClient().from("fixed_costs").delete().eq("user_id", uid).eq("kind", kind);

/* ---------------- small parts ---------------- */

function Back({ href, text }: { href: string; text: string }) {
  return <Link href={href} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> {text}</Link>;
}
function Title({ title, sub }: { title: string; sub: string }) {
  return <><h1 className="text-[26px] font-bold leading-tight">{title}</h1><p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{sub}</p></>;
}
function Money({ id, value, onChange, currency, onCurrency, placeholder = "0.00" }: { id: string; value: string; onChange: (v: string) => void; currency: BudgetCurrency; onCurrency: (c: BudgetCurrency) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-background px-3">
      <input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-12 min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums outline-none" />
      <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Currency">
        {(["AWG", "USD"] as const).map((c) => <button key={c} type="button" aria-pressed={currency === c} onClick={() => onCurrency(c)} className={`min-h-10 px-3 text-sm font-semibold ${currency === c ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""}`}>{c}</button>)}
      </div>
    </div>
  );
}
const MonthSelect = ({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) => (
  <Select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-12 text-base">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select>
);
const DaySelect = ({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) => (
  <Select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-12 text-base">{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</Select>
);
const Seg = ({ options, value, onChange }: { options: { v: string; t: string }[]; value: string; onChange: (v: string) => void }) => (
  <div className="flex gap-2" role="group">{options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)} className={`min-h-12 flex-1 rounded-xl border px-2 text-sm font-semibold leading-tight ${value === o.v ? "border-blue-700 bg-blue-700 text-white" : "bg-card"}`}>{o.t}</button>)}</div>
);
const Switch = ({ on, onChange, text }: { on: boolean; onChange: (v: boolean) => void; text: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={text} onClick={() => onChange(!on)} className={`flex h-[26px] w-11 shrink-0 items-center rounded-full p-[3px] transition-colors ${on ? "justify-end bg-blue-600" : "justify-start bg-slate-300 dark:bg-slate-600"}`}><span className="h-5 w-5 rounded-full bg-white" /></button>
);
const Note = ({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "good" }) => (
  <p className={`rounded-xl px-3 py-2.5 text-[13px] leading-snug ${tone === "good" ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{children}</p>
);

/* ---------------- hub: this month, coming up, set up ---------------- */

const SECTIONS: { cat: FixedCategory; title: string; rows: { kind: FixedKind; href: string }[] }[] = [
  { cat: "loans", title: "Loans", rows: [{ kind: "mortgage", href: "/personal/fixed/mortgage" }, { kind: "car_loan", href: "/personal/fixed/car" }] },
  { cat: "insurances", title: "Insurances and car plate", rows: [{ kind: "home_insurance", href: "/personal/fixed/home-insurance" }, { kind: "car_insurance", href: "/personal/fixed/car" }, { kind: "license_plate", href: "/personal/fixed/car" }] },
  { cat: "cards", title: "Credit card", rows: [{ kind: "credit_card", href: "/personal/fixed/credit-card" }] },
  { cat: "gambling", title: "Limits", rows: [{ kind: "gambling", href: "/personal/fixed/gambling" }] },
];

function status(c: FixedCost | undefined, today: string): string {
  if (!c || !c.active) return "Not set up";
  const f = (n: number) => formatCurrency(n, c.currency);
  if (c.kind === "gambling") return `${f(c.amount)} a month`;
  if (c.schedule === "statement") return "I enter what I spent";
  if (c.schedule === "monthly") return `${f(c.amount)} a month${c.end_month ? ` until ${monthLabel(c.end_month)}` : ""}`;
  const n = nextYearly(c, today);
  if (c.schedule === "twice_yearly") return `2 payments, ${[c.due_month, c.due_month2].filter(Boolean).map((m) => MONTHS[(m as number) - 1]).join(" and ")}`;
  return `${f(c.amount)} a year${n ? `, due ${Number(n.date.slice(8, 10))} ${MONTHS[Number(n.date.slice(5, 7)) - 1]}` : ""}`;
}

export function FixedCostsHub() {
  const { costs, entries, missing, ready } = useFixed();
  const today = todayISO(), month = monthStartOf(today);
  const by = useMemo(() => new Map(costs.map((c) => [c.kind, c])), [costs]);
  const lines = useMemo(() => monthLines(costs, entries, month), [costs, entries, month]);
  const cur: BudgetCurrency = costs.filter((c) => c.currency === "USD").length > costs.filter((c) => c.currency === "AWG").length ? "USD" : "AWG";
  const of = (l: { amount: number; currency: string }) => convert(l.amount, l.currency, cur) ?? 0;
  const fixedLines = lines.filter((l) => l.category !== "gambling");
  const total = round2(fixedLines.reduce((t, l) => t + of(l), 0));
  const coming = costs.map((c) => ({ c, n: nextYearly(c, today) })).filter((x) => x.n && !lines.some((l) => l.kind === x.c.kind)).sort((a, b) => a.n!.date.localeCompare(b.n!.date));

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28 md:p-8 lg:max-w-4xl" data-testid="fixed-hub">
      <Back href="/personal" text="Personal" />
      <Title title="Fixed costs" sub="Set a payment once. It is added to your spending for you." />
      {missing && <Alert>{SETUP}</Alert>}
      {ready && !missing && (
        <>
          <Card className="rounded-2xl p-4" data-testid="fixed-month">
            <p className="text-[13px] font-bold text-muted-foreground">Fixed costs this month</p>
            <p className="text-[30px] font-bold leading-tight tabular-nums">{formatCurrency(total, cur)}</p>
            {fixedLines.length === 0 && <p className="text-sm text-muted-foreground">Nothing is due this month yet.</p>}
            {(["loans", "insurances", "cards"] as const).map((cat) => {
              const rows = fixedLines.filter((l) => l.category === cat);
              if (!rows.length) return null;
              return (
                <div key={cat} className="mt-2 border-t pt-2">
                  <div className="flex justify-between text-sm font-bold"><span>{CATEGORY_LABEL[cat]}</span><span className="tabular-nums">{formatCurrency(round2(rows.reduce((t, l) => t + of(l), 0)), cur)}</span></div>
                  {rows.map((l) => <div key={`${l.kind}${l.currency}`} className="flex justify-between py-1 text-sm text-muted-foreground"><span>{KIND_LABEL[l.kind]}</span><span className="tabular-nums">{formatCurrency(of(l), cur)}</span></div>)}
                </div>
              );
            })}
          </Card>
          {coming.length > 0 && (
            <Card className="rounded-2xl p-4" data-testid="fixed-coming">
              <p className="mb-1 text-sm font-bold">Coming up</p>
              {coming.map(({ c, n }) => <div key={c.kind} className="flex justify-between border-t py-2 text-sm first:border-0"><span>{KIND_LABEL[c.kind]}<span className="block text-xs text-muted-foreground">Due {Number(n!.date.slice(8, 10))} {MONTHS[Number(n!.date.slice(5, 7)) - 1]}</span></span><b className="tabular-nums">{formatCurrency(n!.amount, c.currency)}</b></div>)}
            </Card>
          )}
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-6">
          {SECTIONS.map((s) => (
            <section key={s.cat}>
              <h2 className="mb-1 mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">{s.title}</h2>
              <Card className="rounded-2xl px-4">
                {s.rows.map((r) => (
                  <Link key={r.kind} href={r.href} className="flex min-h-14 items-center gap-3 border-t py-2.5 first:border-0 hover:bg-accent/40" data-testid={`fixed-row-${r.kind}`}>
                    <span className="min-w-0 flex-1"><b className="block text-[15px]">{KIND_LABEL[r.kind]}</b><span className="block text-[13px] text-muted-foreground">{status(by.get(r.kind), today)}</span></span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
              </Card>
            </section>
          ))}
          </div>
          <p className="px-1 text-[13px] text-muted-foreground">Monthly payments are added every month until the end date. Yearly bills are added in the month they are due. All of it counts in your monthly budget.</p>
        </>
      )}
    </div>
  );
}

/* ---------------- mortgage and home insurance ---------------- */

export function MonthlyCostForm({ kind }: { kind: "mortgage" | "home_insurance" }) {
  const router = useRouter();
  const { costs, missing, ready, uid } = useFixed();
  const mine = costs.find((c) => c.kind === kind);
  const [amount, setAmount] = useState(""), [cur, setCur] = useState<BudgetCurrency>("AWG"), [day, setDay] = useState(1);
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [filled, setFilled] = useState(false);
  useEffect(() => {
    if (!ready || filled) return;
    setFilled(true);
    if (mine) { setAmount(String(mine.amount)); setCur(mine.currency); setDay(mine.day ?? 1); setStart(mine.start_month?.slice(0, 7) ?? ""); setEnd(mine.end_month?.slice(0, 7) ?? ""); }
  }, [ready, filled, mine]);

  const n = toNum(amount);
  const draft: FixedCost = { kind, schedule: "monthly", amount: n > 0 ? n : 0, amount2: null, currency: cur, day, due_month: null, due_month2: null, start_month: start ? `${start}-01` : null, end_month: end ? `${end}-01` : null, active: true };
  const left = paymentsLeft(draft, todayISO());
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!(n > 0)) return setErr("Type how much you pay each month.");
    if (start && end && end < start) return setErr("The last payment cannot be before the start.");
    if (!uid) return setErr("Sign in again to save.");
    setBusy(true);
    const { error } = await saveCost(uid, { kind, schedule: "monthly", amount: round2(n), amount2: null, currency: cur, day, due_month: null, due_month2: null, start_month: draft.start_month, end_month: draft.end_month });
    setBusy(false);
    if (error) return setErr(isMissing(error.message) ? SETUP : "Could not save. Check your connection.");
    router.push("/personal/fixed");
  };
  const stop = async () => { if (!uid) return; setBusy(true); const { error } = await removeCost(uid, kind); setBusy(false); if (error) return setErr("Could not stop it. Check your connection."); router.push("/personal/fixed"); };

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28 md:p-8">
      <Back href="/personal/fixed" text="Fixed costs" />
      <Title title={KIND_LABEL[kind]} sub="What you pay each month" />
      {(err || missing) && <Alert>{missing ? SETUP : err}</Alert>}
      <form onSubmit={save} className="space-y-3" data-testid="fixed-form">
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div><label htmlFor="fx-amount" className={label}>Monthly payment</label><Money id="fx-amount" value={amount} onChange={setAmount} currency={cur} onCurrency={setCur} /></div>
          <div><label htmlFor="fx-day" className={label}>Paid on day of the month</label><DaySelect id="fx-day" value={day} onChange={setDay} /></div>
          <div><label htmlFor="fx-start" className={label}>Started</label><input id="fx-start" type="month" value={start} onChange={(e) => setStart(e.target.value)} className={field} /></div>
          <div><label htmlFor="fx-end" className={label}>Last payment</label><input id="fx-end" type="month" value={end} onChange={(e) => setEnd(e.target.value)} className={field} /><p className="mt-1 text-xs text-muted-foreground">Leave empty if you do not know.</p></div>
        </div>
        {n > 0 && <Note tone="good"><span data-testid="fixed-preview">Adds <b>{formatCurrency(n, cur)}</b> to your spending every month{draft.end_month ? <> until <b>{monthLabel(draft.end_month)}</b>{left ? <>. {left.count} payment{left.count === 1 ? "" : "s"} left, {formatCurrency(left.total, cur)} in total</> : null}</> : null}.</span></Note>}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || !ready || missing} data-testid="fixed-save">Save</Button>
        {mine && <Button type="button" variant="outline" className="h-12 w-full" disabled={busy} onClick={stop} data-testid="fixed-stop">Stop this payment</Button>}
      </form>
    </div>
  );
}

/* ---------------- my car: loan, insurance, license plate ---------------- */

export function CarForm() {
  const router = useRouter();
  const { costs, missing, ready, uid } = useFixed();
  const [loanOn, setLoanOn] = useState(false), [loan, setLoan] = useState(""), [loanEnd, setLoanEnd] = useState(""), [loanCur, setLoanCur] = useState<BudgetCurrency>("AWG");
  const [ins, setIns] = useState(""), [insMonth, setInsMonth] = useState(3), [insDay, setInsDay] = useState(15), [insCur, setInsCur] = useState<BudgetCurrency>("AWG");
  const [plateMode, setPlateMode] = useState<"once" | "twice">("once");
  const [plate, setPlate] = useState(""), [plate2, setPlate2] = useState(""), [pm1, setPm1] = useState(6), [pm2, setPm2] = useState(12), [pDay, setPDay] = useState(30), [plateCur, setPlateCur] = useState<BudgetCurrency>("AWG");
  const [onceAmount, setOnceAmount] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!ready || filled) return;
    setFilled(true);
    const l = costs.find((c) => c.kind === "car_loan"), i = costs.find((c) => c.kind === "car_insurance"), p = costs.find((c) => c.kind === "license_plate");
    if (l) { setLoanOn(true); setLoan(String(l.amount)); setLoanEnd(l.end_month?.slice(0, 7) ?? ""); setLoanCur(l.currency); }
    if (i) { setIns(String(i.amount)); setInsMonth(i.due_month ?? 3); setInsDay(i.day ?? 15); setInsCur(i.currency); }
    if (p) {
      setPlateCur(p.currency); setPDay(p.day ?? 30); setPm1(p.due_month ?? 6);
      if (p.schedule === "twice_yearly") { setPlateMode("twice"); setPlate(String(p.amount)); setPlate2(String(p.amount2 ?? p.amount)); setPm2(p.due_month2 ?? 12); } else setOnceAmount(String(p.amount));
    }
  }, [ready, filled, costs]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!uid) return setErr("Sign in again to save.");
    const base = { amount2: null, due_month: null, due_month2: null, day: null, start_month: null, end_month: null };
    const jobs: PromiseLike<{ error: { message: string } | null }>[] = [];
    if (loanOn) {
      const a = toNum(loan);
      if (!(a > 0)) return setErr("Type the monthly loan payment, or switch the loan off.");
      jobs.push(saveCost(uid, { ...base, kind: "car_loan", schedule: "monthly", amount: round2(a), currency: loanCur, day: 1, end_month: loanEnd ? `${loanEnd}-01` : null }));
    } else jobs.push(removeCost(uid, "car_loan"));
    const ia = toNum(ins);
    if (ins.trim() !== "") {
      if (!(ia > 0)) return setErr("Type the yearly insurance amount.");
      jobs.push(saveCost(uid, { ...base, kind: "car_insurance", schedule: "yearly", amount: round2(ia), currency: insCur, due_month: insMonth, day: insDay }));
    } else jobs.push(removeCost(uid, "car_insurance"));
    const once = toNum(onceAmount), a1 = toNum(plate), a2 = toNum(plate2);
    if (plateMode === "once" && onceAmount.trim() !== "") {
      if (!(once > 0)) return setErr("Type the license plate amount.");
      jobs.push(saveCost(uid, { ...base, kind: "license_plate", schedule: "yearly", amount: round2(once), currency: plateCur, due_month: pm1, day: pDay }));
    } else if (plateMode === "twice" && plate.trim() !== "") {
      if (!(a1 > 0) || !(a2 > 0)) return setErr("Type both license plate payments.");
      jobs.push(saveCost(uid, { ...base, kind: "license_plate", schedule: "twice_yearly", amount: round2(a1), amount2: round2(a2), currency: plateCur, due_month: pm1, due_month2: pm2, day: pDay }));
    } else jobs.push(removeCost(uid, "license_plate"));
    setBusy(true);
    const res = await Promise.all(jobs);
    setBusy(false);
    const bad = res.find((r) => r.error);
    if (bad) return setErr(isMissing(bad.error?.message) ? SETUP : "Could not save. Check your connection.");
    router.push("/personal/fixed");
  };

  const extra = plateMode === "twice" && toNum(plate) > 0 && toNum(plate2) > 0 && toNum(onceAmount) > 0 ? round2(toNum(plate) + toNum(plate2) - toNum(onceAmount)) : null;
  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28 md:p-8 lg:max-w-4xl">
      <Back href="/personal/fixed" text="Fixed costs" />
      <Title title="My car" sub="Loan, insurance and license plate" />
      {(err || missing) && <Alert>{missing ? SETUP : err}</Alert>}
      <form onSubmit={save} className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0" data-testid="car-form">
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3"><span className="min-w-0 flex-1"><b className="block text-base">Car loan</b><span className="text-[13px] text-muted-foreground">Optional. Switch off if it is paid.</span></span><Switch on={loanOn} onChange={setLoanOn} text="Car loan" /></div>
          {loanOn && (<>
            <div><label htmlFor="car-loan" className={label}>Monthly payment</label><Money id="car-loan" value={loan} onChange={setLoan} currency={loanCur} onCurrency={setLoanCur} /></div>
            <div><label htmlFor="car-loan-end" className={label}>Last payment</label><input id="car-loan-end" type="month" value={loanEnd} onChange={(e) => setLoanEnd(e.target.value)} className={field} /></div>
          </>)}
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div><b className="block text-base">Car insurance</b><span className="text-[13px] text-muted-foreground">Paid once a year. Leave empty if you have none.</span></div>
          <div><label htmlFor="car-ins" className={label}>Yearly amount</label><Money id="car-ins" value={ins} onChange={setIns} currency={insCur} onCurrency={setInsCur} /></div>
          <div className="grid grid-cols-2 gap-3"><div><label htmlFor="car-ins-m" className={label}>Due month</label><MonthSelect id="car-ins-m" value={insMonth} onChange={setInsMonth} /></div><div><label htmlFor="car-ins-d" className={label}>Day</label><DaySelect id="car-ins-d" value={insDay} onChange={setInsDay} /></div></div>
          {ins.trim() !== "" && <Note tone="good">Added to your spending in <b>{MONTHS[insMonth - 1]}</b>, the month it is due.</Note>}
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div><b className="block text-base">License plate</b><span className="text-[13px] text-muted-foreground">Paid every year. Two payments cost a little more.</span></div>
          <Seg value={plateMode} onChange={(v) => setPlateMode(v as "once" | "twice")} options={[{ v: "once", t: "Once a year" }, { v: "twice", t: "Two payments" }]} />
          {plateMode === "once" ? (
            <div className="grid grid-cols-2 gap-3"><div className="col-span-2"><label htmlFor="plate-once" className={label}>Yearly amount</label><Money id="plate-once" value={onceAmount} onChange={setOnceAmount} currency={plateCur} onCurrency={setPlateCur} /></div><div><label htmlFor="plate-m1" className={label}>Due month</label><MonthSelect id="plate-m1" value={pm1} onChange={setPm1} /></div><div><label htmlFor="plate-d" className={label}>Day</label><DaySelect id="plate-d" value={pDay} onChange={setPDay} /></div></div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label htmlFor="plate-a1" className={label}>First payment</label><Money id="plate-a1" value={plate} onChange={setPlate} currency={plateCur} onCurrency={setPlateCur} /></div>
              <div><label htmlFor="plate-m1" className={label}>Due month</label><MonthSelect id="plate-m1" value={pm1} onChange={setPm1} /></div><div><label htmlFor="plate-d" className={label}>Day</label><DaySelect id="plate-d" value={pDay} onChange={setPDay} /></div>
              <div className="col-span-2"><label htmlFor="plate-a2" className={label}>Second payment</label><input id="plate-a2" inputMode="decimal" value={plate2} onChange={(e) => setPlate2(e.target.value)} placeholder="0.00" className={field} /></div>
              <div className="col-span-2"><label htmlFor="plate-m2" className={label}>Second payment month</label><MonthSelect id="plate-m2" value={pm2} onChange={setPm2} /></div>
              <div className="col-span-2"><label htmlFor="plate-once2" className={label}>Price if paid once a year (optional)</label><input id="plate-once2" inputMode="decimal" value={onceAmount} onChange={(e) => setOnceAmount(e.target.value)} placeholder="0.00" className={field} /></div>
              {extra != null && extra > 0 && <p className="col-span-2 text-[13px] text-amber-800 dark:text-amber-200">Two payments cost {formatCurrency(extra, plateCur)} more a year.</p>}
            </div>
          )}
          <Note tone="good">Added to your spending in the months each payment is due.</Note>
        </div>
        <div className="lg:col-span-2"><Note>The loan shows under <b>Loans</b>. The insurance and license plate show under <b>Insurances</b>.</Note></div>
        <Button type="submit" className="h-12 w-full text-base lg:col-span-2" disabled={busy || !ready || missing} data-testid="car-save">Save</Button>
      </form>
    </div>
  );
}

/* ---------------- entries: credit card statements and gambling ---------------- */

function useEntryForm(kind: "card" | "gambling", uid: string | null, reload: () => Promise<void>, defaultCur: BudgetCurrency) {
  const [amount, setAmount] = useState(""), [date, setDate] = useState(todayISO()), [cur, setCur] = useState<BudgetCurrency>(defaultCur);
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const n = toNum(amount);
    if (!(n > 0)) return setErr("Type the amount.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Pick the date.");
    if (!uid) return setErr("Sign in again to save.");
    setBusy(true);
    const { error } = await createClient().from("fixed_entries").insert({ user_id: uid, kind, on_date: date, amount: round2(n), currency: cur });
    setBusy(false);
    if (error) return setErr(isMissing(error.message) ? SETUP : "Could not save. Check your connection.");
    setAmount(""); await reload();
  };
  const del = async (id: string) => { const { error } = await createClient().from("fixed_entries").delete().eq("id", id); if (error) setErr("Could not delete it."); else await reload(); };
  return { amount, setAmount, date, setDate, cur, setCur, err, busy, add, del };
}

function EntryList({ rows, onDelete }: { rows: FixedEntry[]; onDelete: (id: string) => void }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing added yet.</p>;
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 border-t py-2 text-sm first:border-0" data-testid="fixed-entry">
          <span>{r.on_date}</span>
          <span className="flex items-center gap-1"><b className="tabular-nums">{formatCurrency(r.amount, r.currency)}</b>
            <button type="button" aria-label={`Delete ${r.on_date}`} onClick={() => r.id && onDelete(r.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></span>
        </li>
      ))}
    </ul>
  );
}

export function CreditCardForm() {
  const router = useRouter();
  const { costs, entries, missing, ready, uid, reload } = useFixed();
  const mine = costs.find((c) => c.kind === "credit_card");
  const [mode, setMode] = useState<"monthly" | "statement">("statement");
  const [amount, setAmount] = useState(""), [cur, setCur] = useState<BudgetCurrency>("AWG"), [day, setDay] = useState(1);
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [filled, setFilled] = useState(false);
  const form = useEntryForm("card", uid, reload, cur);
  useEffect(() => {
    if (!ready || filled) return;
    setFilled(true);
    if (mine) { setMode(mine.schedule === "monthly" ? "monthly" : "statement"); if (mine.schedule === "monthly") { setAmount(String(mine.amount)); setCur(mine.currency); setDay(mine.day ?? 1); } }
  }, [ready, filled, mine]);

  const save = async (kind: FixedSchedule) => {
    setErr(null);
    if (!uid) return setErr("Sign in again to save.");
    let body: Omit<FixedCost, "id" | "active">;
    if (kind === "monthly") {
      const n = toNum(amount);
      if (!(n > 0)) return setErr("Type the amount that is deducted each month.");
      body = { kind: "credit_card", schedule: "monthly", amount: round2(n), amount2: null, currency: cur, day, due_month: null, due_month2: null, start_month: null, end_month: null };
    } else body = { kind: "credit_card", schedule: "statement", amount: 0, amount2: null, currency: "AWG", day: null, due_month: null, due_month2: null, start_month: null, end_month: null };
    setBusy(true);
    const { error } = await saveCost(uid, body);
    setBusy(false);
    if (error) return setErr(isMissing(error.message) ? SETUP : "Could not save. Check your connection.");
    if (kind === "monthly") router.push("/personal/fixed"); else await reload();
  };
  const stop = async () => { if (!uid) return; setBusy(true); const { error } = await removeCost(uid, "credit_card"); setBusy(false); if (error) return setErr("Could not stop it."); router.push("/personal/fixed"); };
  const cardEntries = entries.filter((e) => e.kind === "card");

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28 md:p-8">
      <Back href="/personal/fixed" text="Fixed costs" />
      <Title title="Credit card" sub="How you pay it" />
      {(err || form.err || missing) && <Alert>{missing ? SETUP : err || form.err}</Alert>}
      <Seg value={mode} onChange={(v) => setMode(v as "monthly" | "statement")} options={[{ v: "monthly", t: "Same amount every month" }, { v: "statement", t: "I enter what I spent" }]} />
      {mode === "monthly" ? (
        <form onSubmit={(e) => { e.preventDefault(); save("monthly"); }} className="space-y-3" data-testid="card-monthly">
          <div className="space-y-4 rounded-2xl border bg-card p-4">
            <div><label htmlFor="cc-amount" className={label}>Amount deducted each month</label><Money id="cc-amount" value={amount} onChange={setAmount} currency={cur} onCurrency={setCur} /></div>
            <div><label htmlFor="cc-day" className={label}>Deducted on day</label><DaySelect id="cc-day" value={day} onChange={setDay} /></div>
          </div>
          <Note>One amount is added to your spending every month.</Note>
          <Button type="submit" className="h-12 w-full text-base" disabled={busy || !ready || missing} data-testid="card-save">Save</Button>
        </form>
      ) : (
        <div className="space-y-3" data-testid="card-statement">
          <form onSubmit={async (e) => { e.preventDefault(); if (uid && (!mine || mine.schedule !== "statement")) await save("statement"); await form.add(e); }} className="space-y-3 rounded-2xl border bg-card p-4">
            <b className="block text-[15px]">Add what you spent</b>
            <div><label htmlFor="ce-amount" className={label}>Amount on your statement</label><Money id="ce-amount" value={form.amount} onChange={form.setAmount} currency={form.cur} onCurrency={form.setCur} /></div>
            <div><label htmlFor="ce-date" className={label}>Date</label><input id="ce-date" type="date" value={form.date} onChange={(e) => form.setDate(e.target.value)} className={field} /></div>
            <Button type="submit" className="h-12 w-full text-base" disabled={form.busy || missing} data-testid="card-add">Add</Button>
          </form>
          <Card className="rounded-2xl p-4"><b className="mb-1 block text-[15px]">Earlier entries</b><EntryList rows={cardEntries} onDelete={form.del} /></Card>
          <Note>It counts in the month of the date you pick.</Note>
        </div>
      )}
      {mine && <Button type="button" variant="outline" className="h-12 w-full" disabled={busy} onClick={stop} data-testid="card-stop">Stop tracking my credit card</Button>}
    </div>
  );
}

/* ---------------- gambling limit ---------------- */

export function GamblingForm() {
  const { costs, entries, missing, ready, uid, reload } = useFixed();
  const mine = costs.find((c) => c.kind === "gambling");
  const [limit, setLimit] = useState(""), [cur, setCur] = useState<BudgetCurrency>("AWG");
  const [err, setErr] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null), [filled, setFilled] = useState(false), [busy, setBusy] = useState(false);
  const form = useEntryForm("gambling", uid, reload, cur);
  useEffect(() => { if (!ready || filled) return; setFilled(true); if (mine) { setLimit(String(mine.amount)); setCur(mine.currency); } }, [ready, filled, mine]);

  const month = monthStartOf(todayISO());
  const rows = entries.filter((e) => e.kind === "gambling");
  const thisMonth = rows.filter((e) => monthStartOf(e.on_date) === month);
  const cap: BudgetCurrency = mine?.currency ?? cur;
  const spent = round2(thisMonth.reduce((t, e) => t + (convert(e.amount, e.currency, cap) ?? 0), 0));
  const lim = mine && mine.amount > 0 ? mine.amount : null;
  const state = gamblingState(spent, lim);

  const saveLimit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null);
    const n = toNum(limit);
    if (!(n > 0)) return setErr("Type the most you can afford each month.");
    if (!uid) return setErr("Sign in again to save.");
    setBusy(true);
    const { error } = await saveCost(uid, { kind: "gambling", schedule: "limit", amount: round2(n), amount2: null, currency: cur, day: null, due_month: null, due_month2: null, start_month: null, end_month: null });
    setBusy(false);
    if (error) return setErr(isMissing(error.message) ? SETUP : "Could not save. Check your connection.");
    setMsg("Limit saved."); await reload();
  };

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28 md:p-8" data-testid="gambling">
      <Back href="/personal/fixed" text="Fixed costs" />
      <Title title="Gambling limit" sub="Stay in control of what you spend" />
      {(err || form.err || missing) && <Alert>{missing ? SETUP : err || form.err}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}
      {lim && (
        <Card className={`rounded-2xl p-4 ${state === "over" ? "border-red-300" : ""}`} data-testid="gambling-status" data-state={state}>
          <div className="flex items-baseline justify-between text-[13px]"><b className="text-muted-foreground">This month</b><span className="text-muted-foreground">Limit {formatCurrency(lim, cap)}</span></div>
          <p className={`text-[30px] font-bold leading-tight tabular-nums ${state === "over" ? "text-red-700 dark:text-red-300" : ""}`}>{formatCurrency(spent, cap)} <span className="text-sm font-semibold">spent</span></p>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${Math.min(100, (spent / lim) * 100)}%`, background: state === "over" ? "#dc2626" : state === "near" ? "#d97706" : "#16a34a" }} /></div>
          {state === "over" && <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-900 dark:bg-red-950 dark:text-red-100" data-testid="gambling-over">You are over your limit by {formatCurrency(round2(spent - lim), cap)}.</p>}
          {state === "near" && <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="gambling-near">You have used 80% of your limit.</p>}
          {state === "ok" && <p className="mt-2 text-sm text-muted-foreground">{formatCurrency(round2(lim - spent), cap)} left this month.</p>}
        </Card>
      )}
      <form onSubmit={saveLimit} className="space-y-3 rounded-2xl border bg-card p-4" data-testid="gambling-limit-form">
        <div><label htmlFor="gl-limit" className={label}>What you can afford each month</label><Money id="gl-limit" value={limit} onChange={setLimit} currency={cur} onCurrency={setCur} /></div>
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || !ready || missing} data-testid="gambling-save-limit">Save limit</Button>
      </form>
      <form onSubmit={form.add} className="space-y-3 rounded-2xl border bg-card p-4" data-testid="gambling-add-form">
        <b className="block text-[15px]">Add what you spent</b>
        <div><label htmlFor="ge-amount" className={label}>Amount</label><Money id="ge-amount" value={form.amount} onChange={form.setAmount} currency={form.cur} onCurrency={form.setCur} /></div>
        <div><label htmlFor="ge-date" className={label}>Date</label><input id="ge-date" type="date" value={form.date} onChange={(e) => form.setDate(e.target.value)} className={field} /></div>
        <Button type="submit" className="h-12 w-full text-base" disabled={form.busy || missing} data-testid="gambling-add">Add</Button>
      </form>
      <Card className="rounded-2xl p-4"><b className="mb-1 block text-[15px]">This month</b><EntryList rows={thisMonth} onDelete={form.del} /></Card>
      <Note>You get a warning at <b>80%</b> and when you pass your limit. Only you see this. If gambling stops feeling like fun, talk to someone you trust.</Note>
    </div>
  );
}
