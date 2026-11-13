"use client";

import { setupNeeded } from "@/lib/setup-message";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseBudgetInput, type BudgetCurrency } from "@/lib/personal/budget";
import { plannedDeposits } from "@/lib/personal/savings";
import { fetchSavings } from "@/lib/personal/savings-data";
import { formatCurrency, todayISO } from "@/lib/utils";

const label = "mb-1.5 block text-[13px] font-bold";
const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "bg-card hover:bg-accent"}`;
const moneyBox = "flex items-center gap-2 rounded-xl border bg-background px-3";

function Toggle({ on, onChange, label: l }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={l} onClick={() => onChange(!on)} className={`flex h-[26px] w-11 shrink-0 items-center rounded-full p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "justify-end bg-blue-600" : "justify-start bg-slate-300 dark:bg-slate-600"}`}>
      <span className="h-5 w-5 rounded-full bg-white" />
    </button>
  );
}

/** Add a savings plan, or change one (?id=). One amount, every month with no end or until a date, and an optional starting balance and goal. */
export function SavingsPlanForm() {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<BudgetCurrency>("AWG");
  const [until, setUntil] = useState(false);
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState("");
  const [hasOpening, setHasOpening] = useState(false);
  const [opening, setOpening] = useState("");
  const [hasGoal, setHasGoal] = useState(false);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setEditId(id);
    fetchSavings(createClient()).then(({ plans, missing }) => {
      // The table is not there yet: say so now and keep Save off, instead of failing when it is tapped
      if (missing) { setError(setupNeeded("Savings", "migration_savings.sql")); setSetupMissing(true); }
      if (!id) return;
      const p = plans.find((x) => x.id === id);
      if (!p) return;
      setName(p.name); setAmount(String(p.amount)); setCurrency(p.currency); setStart(p.start_date);
      setUntil(!!p.end_date); setEnd(p.end_date ?? "");
      setHasOpening(p.opening_balance > 0); setOpening(p.opening_balance > 0 ? String(p.opening_balance) : "");
      setHasGoal(!!p.goal); setGoal(p.goal ? String(p.goal) : "");
    });
  }, []);

  const value = parseBudgetInput(amount);
  const planned = until && value && start && end && end >= start ? plannedDeposits(start, end, value) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give the plan a name, for example Emergency fund.");
    if (value == null) return setError("Type how much you put aside each month.");
    if (!start) return setError("Pick the date of the first deposit.");
    if (until && (!end || end < start)) return setError("The last deposit has to be on or after the first one.");
    const open = hasOpening ? parseBudgetInput(opening) : null;
    if (hasOpening && open == null) return setError("Type how much you have already saved, or turn that off.");
    const goalValue = hasGoal ? parseBudgetInput(goal) : null;
    if (hasGoal && goalValue == null) return setError("Type your savings goal, or turn it off.");
    setBusy(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBusy(false); return setError("Sign in again to save."); }
    const body = { user_id: session.user.id, name: name.trim(), amount: value, currency, start_date: start, end_date: until ? end : null, opening_balance: open ?? 0, goal: goalValue };
    const { error: err } = editId ? await supabase.from("savings_plans").update(body).eq("id", editId) : await supabase.from("savings_plans").insert(body);
    setBusy(false);
    if (err) return setError(/relation|schema cache|does not exist/i.test(err.message) ? setupNeeded("Savings", "migration_savings.sql") : "Could not save the plan. Check your connection.");
    router.push(editId ? `/personal/savings/plan?id=${editId}` : "/personal/savings");
  };

  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8">
      <Link href={editId ? `/personal/savings/plan?id=${editId}` : "/personal/savings"} className="mb-2 inline-flex min-h-11 items-center gap-2 text-lg font-bold"><X className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> {editId ? "Change savings plan" : "Add a savings plan"}</Link>
      <p className="text-[13px] leading-snug text-muted-foreground">Set the amount once. It is counted every month from the start date, with nothing to type each time.</p>
      {error && <Alert className="mt-3">{error}</Alert>}

      <form onSubmit={save} className="mt-3 space-y-3" data-testid="savings-form">
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div>
            <label htmlFor="sv-name" className={label}>Name</label>
            <Input id="sv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" maxLength={80} className="h-12 text-base" />
          </div>
          <div>
            <label htmlFor="sv-amount" className={label}>Amount each month</label>
            <div className={moneyBox}>
              <input id="sv-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-14 min-w-0 flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none" />
              <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Currency">
                {(["AWG", "USD"] as const).map((c) => <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)} className={`min-h-10 px-3 text-sm font-semibold ${currency === c ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""}`}>{c}</button>)}
              </div>
            </div>
          </div>
          <div>
            <span className={label} id="sv-how">How long</span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="sv-how">
              <button type="button" aria-pressed={!until} onClick={() => setUntil(false)} className={chip(!until)}>Every month, no end</button>
              <button type="button" aria-pressed={until} onClick={() => setUntil(true)} className={chip(until)}>Every month until a date</button>
            </div>
          </div>
          <div>
            <label htmlFor="sv-start" className={label}>First deposit on</label>
            <Input id="sv-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-12" />
            <p className="mt-1.5 text-xs text-muted-foreground">It repeats on the same day each month. A date in the past counts the months already gone by.</p>
          </div>
          {until && (
            <div>
              <label htmlFor="sv-end" className={label}>Last deposit</label>
              <Input id="sv-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="h-12" />
              {planned && <p className="mt-1.5 text-xs text-muted-foreground" data-testid="savings-planned">That is {planned.count} {planned.count === 1 ? "deposit" : "deposits"}, {formatCurrency(planned.total, currency)} in total.</p>}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1"><b className="block text-[15px]">I already have savings</b><span className="block text-[13px] text-muted-foreground">Start from what you have put aside so far.</span></span>
            <Toggle on={hasOpening} onChange={setHasOpening} label="I already have savings" />
          </div>
          {hasOpening && (
            <div className="mt-3">
              <label htmlFor="sv-opening" className={label}>Already saved</label>
              <div className={moneyBox}><input id="sv-opening" inputMode="decimal" autoComplete="off" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" className="h-[54px] min-w-0 flex-1 bg-transparent text-xl font-bold tabular-nums outline-none" /><span className="text-sm text-muted-foreground">{currency}</span></div>
              <p className="mt-1.5 text-xs text-muted-foreground">Counts toward your total. It is not counted as spending this month, because you saved it before.</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1"><b className="block text-[15px]">Savings goal</b><span className="block text-[13px] text-muted-foreground">Optional. Shows how far along you are.</span></span>
            <Toggle on={hasGoal} onChange={setHasGoal} label="Savings goal" />
          </div>
          {hasGoal && (
            <div className={`${moneyBox} mt-3`}><input id="sv-goal" aria-label="Goal amount" inputMode="decimal" autoComplete="off" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="0" className="h-[54px] min-w-0 flex-1 bg-transparent text-xl font-bold tabular-nums outline-none" /><span className="text-sm text-muted-foreground">{currency}</span></div>
          )}
        </div>

        <Button type="submit" disabled={busy || setupMissing} className="h-[52px] w-full text-base" data-testid="savings-save">{busy ? "Saving…" : "Save plan"}</Button>
        {!editId && <p className="text-[13px] text-muted-foreground">Starting from today with nothing saved yet? Leave &lsquo;I already have savings&rsquo; off.</p>}
      </form>
    </div>
  );
}
