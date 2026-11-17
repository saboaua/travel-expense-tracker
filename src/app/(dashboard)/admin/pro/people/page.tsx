"use client";

import { ProSubHeader } from "@/components/admin/ProSubHeader";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { extendedEndsOn, planSummary, type ManualPeriod, type PlanRow } from "@/lib/plans";
import { METHOD_LABEL, priceFor, userReference, type PayMethod, type PaymentSettings } from "@/lib/payments";

type Person = { id: string; email: string | null; name: string; role: string; plan: PlanRow | null };
type Choice = ManualPeriod | "free";

const chip = "inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-[13.5px] font-bold";

export default function AdminPlansPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pro" | "free">("all");
  const [pick, setPick] = useState<string | null>(null);
  const [period, setPeriod] = useState<Choice>("monthly");
  const [endsOn, setEndsOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<PaymentSettings | null>(null);
  const [got, setGot] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState<PayMethod>("aruba_bank");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/plans");
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) setError(json.error || "Could not load.");
    else { setError(null); setPeople(json.people); setToday(json.today); }
    const set = await fetch("/api/admin/payment-settings").then((r) => r.json()).catch(() => ({}));
    setCfg(set.settings ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => people.map((p) => ({ p, s: planSummary(p.plan, today) })).filter(({ p, s }) => (p.role === "admin" ? false : filter === "all" ? true : filter === "pro" ? s.pro : !s.pro)), [people, today, filter]);
  const chosen = people.find((p) => p.id === pick) ?? null;

  const fillPayment = (c: Choice, id: string) => { setAmount(cfg && (c === "monthly" || c === "yearly") ? String(priceFor(cfg, c)) : ""); setPaidOn(today); setRef(userReference(id)); setNote(""); };
  const choose = (id: string) => { setPick(id); setNotice(null); setPeriod("monthly"); setEndsOn(extendedEndsOn("monthly", today, people.find((x) => x.id === id)?.plan) ?? ""); setGot(false); setMethod("aruba_bank"); fillPayment("monthly", id); };
  const changePeriod = (c: Choice) => { setPeriod(c); setEndsOn(c === "free" ? "" : extendedEndsOn(c, today, chosen?.plan) ?? ""); if (c === "gift" || c === "free") setGot(false); if (pick) fillPayment(c, pick); };
  const save = async (replace = false) => {
    if (!chosen) return;
    setSaving(true); setError(null); setNotice(null);
    const res = await fetch("/api/admin/plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: chosen.id, period, endsOn: period === "free" ? undefined : endsOn || null, replace: replace || undefined, payment: got && (period === "monthly" || period === "yearly") ? { amount, paid_on: paidOn, method, reference: ref, note } : undefined }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 409 && json.conflict) { if (window.confirm(`${json.error}\n\nReplace it anyway?`)) return save(true); return; }
    if (!res.ok) return setError(json.error || "Could not save.");
    setNotice(period === "free" ? `${chosen.name} is on the free plan.` : `Pro is on for ${chosen.name}.`);
    setPick(null);
    load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <ProSubHeader active="people" title="People and access" description="Who has Pro, and until when. Pro switches off by itself after its end date." />
      <Card><CardContent className="space-y-1 py-4 text-sm">
        <p className="font-semibold">Pro includes</p>
        <p className="text-muted-foreground">Excel and PDF reports of a project, with its name and every expense. More features can be added here later.</p>
      </CardContent></Card>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {(["all", "pro", "free"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn(chip, filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
            {f === "pro" && <Crown className="h-4 w-4" aria-hidden="true" />}{f === "free" && <Lock className="h-4 w-4" aria-hidden="true" />}{f === "all" ? "All" : f === "pro" ? "Pro" : "Free"}
          </button>
        ))}
      </div>

      <Card><CardContent className="divide-y p-0">
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {!loading && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nobody here yet.</p>}
        {rows.map(({ p, s }) => (
          <button key={p.id} type="button" onClick={() => choose(p.id)} className={cn("flex w-full items-center gap-3 p-4 text-left hover:bg-accent", pick === p.id && "bg-accent")} data-testid={`plan-person-${p.email}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-extrabold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200" aria-hidden="true">{(p.name || "?")[0].toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.name}</span><span className="block truncate text-sm text-muted-foreground">{p.email}</span></span>
            <span className="text-right"><span className={cn("block text-sm font-extrabold", s.pro ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{s.title}</span><span className="block text-xs text-muted-foreground">{s.sub}</span></span>
          </button>
        ))}
      </CardContent></Card>

      {chosen && (
        <Card data-testid="plan-editor"><CardContent className="space-y-4 py-4">
          <p className="font-semibold">Plan for {chosen.name}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Plan">
            {([["monthly", "Monthly"], ["yearly", "Yearly"], ["gift", "Free gift"], ["free", "Free (no Pro)"]] as [Choice, string][]).map(([c, l]) => (
              <button key={c} type="button" role="radio" aria-checked={period === c} onClick={() => changePeriod(c)} className={cn(chip, period === c ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{l}</button>
            ))}
          </div>
          {period !== "free" && (
            <div className="max-w-xs space-y-1.5">
              <label htmlFor="plan-ends" className="text-sm font-medium">Pro ends on</label>
              <Input id="plan-ends" type="date" value={endsOn} min={today} onChange={(e) => setEndsOn(e.target.value)} />
              <p className="text-xs text-muted-foreground">{period === "gift" ? "Leave it empty for no end date." : chosen.plan && planSummary(chosen.plan, today).pro ? `They have Pro ${chosen.plan.ends_on ? "until " + chosen.plan.ends_on : "with no end date"}. The new time is added on top of it.` : "Set when the paid time runs out. Pro switches off after this day."}</p>
            </div>
          )}
          {(period === "monthly" || period === "yearly") && (
            <div className="space-y-3 rounded-xl border p-3" data-testid="plan-payment">
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={got} onChange={(e) => setGot(e.target.checked)} data-testid="plan-got-paid" />Payment received for this plan</label>
              {got && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><label htmlFor="plan-amount" className="text-xs font-medium">Amount (AWG)</label><Input id="plan-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                    <div className="space-y-1"><label htmlFor="plan-paid-on" className="text-xs font-medium">Date received</label><Input id="plan-paid-on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
                  </div>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Paid with">
                    {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={cn(chip, method === m ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{METHOD_LABEL[m]}</button>)}
                  </div>
                  <div className="space-y-1"><label htmlFor="plan-ref" className="text-xs font-medium">Reference</label><Input id="plan-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
                  <div className="space-y-1"><label htmlFor="plan-note" className="text-xs font-medium">Note (optional)</label><Input id="plan-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                </>
              )}
            </div>
          )}
          <div className="flex gap-2"><Button onClick={() => save()} disabled={saving} data-testid="plan-save"><Check className="h-4 w-4" aria-hidden="true" />{period === "free" ? "Remove Pro" : "Turn on Pro"}</Button><Button variant="outline" onClick={() => setPick(null)}>Cancel</Button></div>
        </CardContent></Card>
      )}
    </div>
  );
}
