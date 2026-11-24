"use client";

import { TileButton } from "@/components/ui/TileButton";
import { Wallet } from "lucide-react";
import { setupNeeded } from "@/lib/setup-message";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BUDGET_AREAS, parseBudgetInput, pickBudget, type BudgetCurrency, type BudgetSetting } from "@/lib/personal/budget";
import { fetchBudgets } from "@/lib/personal/budget-data";
import { AREA_STYLE } from "@/components/personal/BudgetCard";
import { todayISO } from "@/lib/utils";
import { useReceiptTypes } from "@/lib/use-receipt-types";
import { saveReceiptType } from "@/lib/receipt-types-data";
import { TypeIcon } from "@/components/receipt-types/TypeIcon";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

const label = "mb-1.5 block text-[13px] font-bold";
const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "bg-card hover:bg-accent"}`;

/** Where you set the monthly budget: the amount, whether it is for every month or one, optional limits for each area, and an alert. */
export function BudgetForm() {
  const router = useRouter();
  const thisMonth = `${todayISO().slice(0, 7)}-01`;
  const monthName = new Date(`${thisMonth}T12:00:00`).toLocaleString("en-US", { month: "long" });
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<BudgetSetting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<BudgetCurrency>("AWG");
  const [onlyThisMonth, setOnlyThisMonth] = useState(false);
  const [useLimits, setUseLimits] = useState(false);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [alertOn, setAlertOn] = useState(false);
  const { types, reload: reloadTypes } = useReceiptTypes();
  const [typeLimits, setTypeLimits] = useState<Record<string, string>>({});
  const onDashboard = types.filter((t) => t.show_in_budget).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const typeLimitText = (t: { id: string; monthly_limit: number | null }) => typeLimits[t.id] ?? (t.monthly_limit ? String(t.monthly_limit) : "");
  const [busy, setBusy] = useState(false);

  const fill = (b: BudgetSetting | null) => {
    setAmount(b ? String(b.amount) : "");
    setCurrency(b?.currency ?? "AWG");
    setUseLimits(!!b && Object.keys(b.limits).length > 0);
    setLimits(Object.fromEntries(BUDGET_AREAS.map((a) => [a.key, b?.limits[a.key] ? String(b.limits[a.key]) : ""])));
    setAlertOn(!!b?.alert_at_80);
  };

  useEffect(() => {
    let alive = true;
    fetchBudgets(createClient()).then(({ rows: r, missing }) => {
      if (!alive) return;
      if (missing) { setError(setupNeeded("The monthly budget", "migration_budget.sql")); setSetupMissing(true); }
      setRows(r);
      fill(pickBudget(r, thisMonth));
      setOnlyThisMonth(!!r.find((x) => x.month === thisMonth));
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [thisMonth]);

  // Switching between "every month" and "only this month" shows the budget that applies to that choice
  const choose = (only: boolean) => {
    setOnlyThisMonth(only);
    fill((only ? rows.find((x) => x.month === thisMonth) : rows.find((x) => !x.month)) ?? pickBudget(rows, thisMonth));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = parseBudgetInput(amount);
    if (value == null) return setError("Type how much you plan to spend each month.");
    const out: Record<string, number> = {};
    if (useLimits) for (const a of BUDGET_AREAS) { const n = parseBudgetInput(limits[a.key] ?? ""); if (n != null) out[a.key] = n; }
    setBusy(true);
    const supabase = createClient();
    // Limits for your own types live on the type itself, so the type page and this form always agree
    if (useLimits) {
      for (const t of onDashboard) {
        const n = parseBudgetInput(typeLimitText(t));
        if (n === t.monthly_limit || (n == null && !t.monthly_limit)) continue;
        const r = await saveReceiptType(supabase, { name: t.name, icon: t.icon, color: t.color, show_in_budget: t.show_in_budget, monthly_limit: n }, t.id);
        if (r.error) { setBusy(false); return setError("Could not save the limit for " + t.name + ". Check your connection."); }
      }
      reloadTypes();
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBusy(false); return setError("Sign in again to save."); }
    const month = onlyThisMonth ? thisMonth : null;
    const existing = rows.find((x) => (x.month ?? null) === month);
    const body = { user_id: session.user.id, month, amount: value, currency, limits: out, alert_at_80: alertOn };
    const { error: err } = existing?.id ? await supabase.from("personal_budgets").update(body).eq("id", existing.id) : await supabase.from("personal_budgets").insert(body);
    setBusy(false);
    if (err) return setError(/relation|schema cache|does not exist/i.test(err.message) ? setupNeeded("The monthly budget", "migration_budget.sql") : "Could not save the budget. Check your connection.");
    router.push("/");
  };

  const remove = async () => {
    const existing = rows.find((x) => (x.month ?? null) === (onlyThisMonth ? thisMonth : null));
    if (!existing?.id) return;
    setBusy(true);
    const { error: err } = await createClient().from("personal_budgets").delete().eq("id", existing.id);
    setBusy(false);
    if (err) return setError("Could not remove the budget. Check your connection.");
    router.push("/");
  };

  const hasSaved = rows.some((x) => (x.month ?? null) === (onlyThisMonth ? thisMonth : null));
  return (
    <div className={`${PAGE_WIDTH.form} p-4 pb-28 md:p-8`}>
      <Link href="/personal" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Personal</Link>
      <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight md:text-3xl"><TileButton id="budget" icon={Wallet} tone="spend" />Monthly budget</h1>
      <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">What you plan to spend each month. Groceries, utilities, quick spends, fuel and house costs are counted against it.</p>
      {error && <Alert className="mt-3">{error}</Alert>}

      <form onSubmit={save} className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6 lg:gap-y-3 lg:space-y-0" data-testid="budget-form">
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div>
            <label htmlFor="bg-amount" className={label}>Budget per month</label>
            <div className="flex items-center gap-2 rounded-xl border bg-background px-3">
              <input id="bg-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" disabled={!loaded} className="h-14 min-w-0 flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none" />
              <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Currency">
                {(["AWG", "USD"] as const).map((c) => <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)} className={`min-h-10 px-3 text-sm font-semibold ${currency === c ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""}`}>{c}</button>)}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Spending in another currency is converted to this one.</p>
          </div>
          <div>
            <span className={label} id="bg-applies">Applies to</span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="bg-applies">
              <button type="button" aria-pressed={!onlyThisMonth} onClick={() => choose(false)} className={chip(!onlyThisMonth)}>Every month</button>
              <button type="button" aria-pressed={onlyThisMonth} onClick={() => choose(true)} className={chip(onlyThisMonth)}>Only {monthName}</button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Change it for one month without touching the others.</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1"><b className="block text-[15px]">Limits for each area</b><span className="block text-[13px] text-muted-foreground">Optional. Leave blank for no limit.</span></span>
            <Switch checked={useLimits} onChange={setUseLimits} label="Limits for each area" />
          </div>
          {useLimits && (
            <div className="mt-2" data-testid="budget-limits">
              {BUDGET_AREAS.map((a, i) => {
                const { color, icon: Icon } = AREA_STYLE[a.key];
                return (
                  <div key={a.key} className={`flex min-h-[60px] items-center gap-2.5 ${i ? "border-t" : ""}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${color}1a`, color }}><Icon className="h-[17px] w-[17px]" aria-hidden="true" /></span>
                    <label htmlFor={`bg-limit-${a.key}`} className="flex-1 text-[15px] font-bold">{a.label}</label>
                    <input id={`bg-limit-${a.key}`} inputMode="decimal" autoComplete="off" value={limits[a.key] ?? ""} onChange={(e) => setLimits({ ...limits, [a.key]: e.target.value })} placeholder="No limit" className="h-11 w-28 rounded-xl border bg-background px-3 text-[15px] tabular-nums" />
                  </div>
                );
              })}
              {onDashboard.length > 0 && (
                <div className="mt-2 border-t pt-3" data-testid="budget-type-limits">
                  <p className="text-[13px] font-bold text-muted-foreground">Your own types on the dashboard</p>
                  {onDashboard.map((t, i) => (
                    <div key={t.id} className={`flex min-h-[60px] items-center gap-2.5 ${i ? "border-t" : ""}`}>
                      <TypeIcon icon={t.icon} color={t.color} className="h-8 w-8" />
                      <label htmlFor={`bg-type-limit-${t.id}`} className="flex-1 text-[15px] font-bold">{t.name}</label>
                      <input id={`bg-type-limit-${t.id}`} inputMode="decimal" autoComplete="off" value={typeLimitText(t)} onChange={(e) => setTypeLimits({ ...typeLimits, [t.id]: e.target.value })} placeholder="No limit" className="h-11 w-28 rounded-xl border bg-background px-3 text-[15px] tabular-nums" />
                    </div>
                  ))}
                  <p className="pt-2 text-xs leading-snug text-muted-foreground">Types with the dashboard switch off share the Other line, which has no limit of its own. Turn a type on in Personal &gt; Other to give it one.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <span className="min-w-0 flex-1"><b className="block text-[15px]">Tell me at 80%</b><span className="block text-[13px] text-muted-foreground">A phone alert when you get close, and again if you go over. It never shows an amount.</span></span>
          <Switch checked={alertOn} onChange={setAlertOn} label="Tell me at 80%" />
        </div>

        <Button type="submit" disabled={busy || !loaded || setupMissing} className="h-[52px] w-full text-base lg:col-span-2 lg:w-64" data-testid="budget-save">{busy ? "Saving…" : "Save budget"}</Button>
        {hasSaved && <button type="button" onClick={remove} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-red-600 hover:text-red-700" data-testid="budget-remove">Remove this budget</button>}
      </form>
    </div>
  );
}
