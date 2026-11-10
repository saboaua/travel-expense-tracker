"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarPlus, ExternalLink, Plus, TrendingUp, Upload, X, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION_COLS } from "@/lib/columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { cn, formatCurrency, formatDate, todayISO } from "@/lib/utils";
import { CURRENCIES } from "@/lib/currencies";
import {
  CYCLES, alerts, approxUsd, buildIcs, cycleLabel, daysUntil, importCsv, myShare, nextDue, renewalProgress, totalsByCurrency, upcoming, validateSub, withPrice,
  type Sub, type SubInput,
} from "@/lib/subscriptions";

const FILTERS = ["All", "Yearly", "Paused"] as const;
const blank = (today: string): SubInput => ({ name: "", price: "", currency: "USD", cycle: "monthly", next_payment: today, category: "", trial_ends: "", split_count: "1", remind_days: "3", cancel_url: "", notes: "" });
/** The bar that fills until the renewal: green while far, amber inside a week, red inside three days. */
function RenewalBar({ s, today }: { s: Sub; today: string }) {
  const p = renewalProgress(s, today);
  if (!p) return null;
  const tone = p.daysLeft <= 3 ? "bg-red-600" : p.daysLeft <= 7 ? "bg-amber-500" : "bg-primary";
  const text = p.daysLeft === 0 ? "Renews today" : p.daysLeft === 1 ? "Renews tomorrow" : `${p.daysLeft} days to renewal`;
  return (
    <span className="mt-1.5 block" data-testid="renewal-bar">
      <span role="progressbar" aria-label={`${s.name}: ${text}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} className="block h-2 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(p.pct, 3)}%` }} />
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
    </span>
  );
}

const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const field = "flex flex-col gap-1.5 text-sm font-medium";

function whenText(days: number) {
  return days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}

export function SubscriptionsView() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const today = useMemo(() => todayISO(), []);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: SubInput } | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("subscriptions").select(SUBSCRIPTION_COLS).order("name");
    if (e) return setError(/does not exist|schema cache/i.test(e.message) ? "Subscriptions are not set up yet. Ask your administrator to run the latest database update." : "Could not load your subscriptions. Try again.");
    setError("");
    setSubs((data ?? []).map((r) => ({ ...r, price: Number(r.price), price_history: Array.isArray(r.price_history) ? r.price_history : [] })) as Sub[]);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => (subs ?? []).filter((s) => s.status === "active"), [subs]);
  const totals = useMemo(() => totalsByCurrency(subs ?? [], today), [subs, today]);
  const usd = approxUsd(totals);
  const monthly = usd ?? totals[0]?.monthly ?? 0;
  const headCurrency = usd != null ? "USD" : totals[0]?.currency ?? "USD";
  const looks = useMemo(() => alerts(subs ?? [], today), [subs, today]);
  const soon = useMemo(() => upcoming(subs ?? [], today, 30).slice(0, 8), [subs, today]);
  const categories = useMemo(() => [...new Set((subs ?? []).map((s) => s.category).filter((c): c is string => !!c))].sort(), [subs]);
  const shown = useMemo(() => (subs ?? []).filter((s) => {
    if (filter === "Yearly" && s.cycle !== "yearly") return false;
    if (filter === "Paused" && s.status === "active") return false;
    if (filter !== "Paused" && s.status === "cancelled") return false;
    return !category || s.category === category;
  }), [subs, filter, category]);

  const open = (s?: Sub) => {
    setFormError("");
    setEditing(s ? { id: s.id, form: { name: s.name, price: String(s.price), currency: s.currency, cycle: s.cycle, next_payment: s.next_payment, category: s.category ?? "", trial_ends: s.trial_ends ?? "", split_count: String(s.split_count), remind_days: String(s.remind_days), cancel_url: s.cancel_url ?? "", notes: s.notes ?? "" } } : { id: null, form: blank(today) });
  };

  const save = async () => {
    if (!editing) return;
    const v = validateSub(editing.form);
    if (!v.ok) return setFormError(v.error);
    setSaving(true);
    const existing = subs?.find((s) => s.id === editing.id);
    const history = withPrice(existing?.price_history ?? [], v.value.price, today);
    const row = { ...v.value, price_history: history, reminded_for: null };
    const { error: e } = editing.id
      ? await supabase.from("subscriptions").update(row).eq("id", editing.id)
      : await supabase.from("subscriptions").insert({ ...row, status: "active", user_id: (await supabase.auth.getUser()).data.user?.id });
    setSaving(false);
    if (e) return setFormError("Could not save. Check your connection and try again.");
    setEditing(null);
    await load();
  };

  const setStatus = async (s: Sub, status: Sub["status"]) => {
    await supabase.from("subscriptions").update({ status }).eq("id", s.id);
    await load();
  };
  const remove = async (s: Sub) => {
    if (!(await confirm({ title: `Delete ${s.name}?`, message: "This removes it and its price history.", confirmLabel: "Delete", destructive: true }))) return;
    await supabase.from("subscriptions").delete().eq("id", s.id);
    setEditing(null);
    await load();
  };

  const download = () => {
    const blob = new Blob([buildIcs(subs ?? [], today)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "subscriptions.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const onCsv = async (file: File | undefined) => {
    if (!file) return;
    const r = importCsv(await file.text(), today);
    if (!r.rows.length) return setNote(r.errors[0] ?? "Nothing to import.");
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error: e } = await supabase.from("subscriptions").insert(r.rows.map((x) => ({ ...x, status: "active", user_id: uid, price_history: withPrice([], x.price, today) })));
    setNote(e ? "Could not import the file." : `Imported ${r.rows.length} subscription${r.rows.length === 1 ? "" : "s"}.${r.errors.length ? ` ${r.errors.length} row${r.errors.length === 1 ? "" : "s"} skipped.` : ""}`);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  };

  const form = editing?.form;
  const set = (k: keyof SubInput, v: string) => setEditing((c) => (c ? { ...c, form: { ...c.form, [k]: v } } : c));
  const editingSub = subs?.find((s) => s.id === editing?.id);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Only you see these. No bank login needed.</p>
        </div>
        <Button onClick={() => open()} className="shrink-0"><Plus className="h-4 w-4" /> Add</Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}
      {note && <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm">{note}</p>}
      {!subs && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {subs && (
        <>
          <section className="rounded-2xl bg-primary p-5 text-primary-foreground">
            <p className="text-sm opacity-85">You spend per month</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-4xl font-bold tracking-tight">{formatCurrency(monthly, headCurrency)}</span>
              <span className="text-sm opacity-85">{formatCurrency(Math.round(monthly * 12), headCurrency)} a year</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white/15 px-2.5 py-1">{active.length} active</span>
              <span className="rounded-full bg-white/15 px-2.5 py-1">Yearly plans counted per month</span>
              {usd == null && totals.length > 1 && <span className="rounded-full bg-white/15 px-2.5 py-1">{totals.map((t) => formatCurrency(t.monthly, t.currency)).join(" + ")}</span>}
            </div>
          </section>

          {looks.length > 0 && (
            <>
              <h2 className={label}>Needs a look</h2>
              <Card className="divide-y">
                {looks.map((a) => {
                  const s = subs.find((x) => x.id === a.id)!;
                  return (
                    <div key={`${a.kind}-${a.id}`} className="flex items-center gap-3 p-3">
                      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", a.kind === "trial" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300")}>
                        {a.kind === "trial" ? <Clock className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                      </span>
                      <button type="button" onClick={() => open(s)} className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-semibold">{a.name}</span>
                        <span className="block text-sm text-muted-foreground">{a.text}</span>
                      </button>
                      {s.cancel_url && <a href={s.cancel_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold hover:bg-accent">Cancel link</a>}
                    </div>
                  );
                })}
              </Card>
            </>
          )}

          <div className="flex items-center justify-between">
            <h2 className={label}>Coming up</h2>
            {active.length > 0 && <button type="button" onClick={download} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary"><CalendarPlus className="h-4 w-4" /> Add to my calendar</button>}
          </div>
          {soon.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is due in the next 30 days.</p> : (
            <Card className="divide-y">
              {soon.map((s) => (
                <button key={s.id} type="button" onClick={() => open(s)} className="flex min-h-14 w-full items-center gap-3 p-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">{s.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="block text-sm text-muted-foreground">{whenText(daysUntil(s, today))} · {cycleLabel(s.cycle).toLowerCase()}{s.split_count > 1 ? ` · split ${s.split_count} ways` : ""}</span>
                    <RenewalBar s={s} today={today} />
                  </span>
                  <span className="text-right text-sm font-semibold">{formatCurrency(myShare(s), s.currency)}{s.split_count > 1 && <span className="block text-xs font-normal text-muted-foreground">of {formatCurrency(s.price, s.currency)}</span>}</span>
                </button>
              ))}
            </Card>
          )}

          <h2 className={label}>All my subscriptions</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("min-h-11 rounded-full border px-4 text-sm", filter === f ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card")}>{f}</button>
            ))}
            {categories.map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)} className={cn("min-h-11 rounded-full border px-4 text-sm", category === c ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card")}>{c}</button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{subs.length === 0 ? "Add your first subscription, or import a CSV file." : "Nothing matches this filter."}</p>
          ) : (
            <Card className="divide-y">
              {shown.map((s) => (
                <button key={s.id} type="button" onClick={() => open(s)} className="flex min-h-14 w-full items-center gap-3 p-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted font-bold">{s.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}{s.status !== "active" && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{s.status}</span>}</span>
                    <span className="block text-sm text-muted-foreground">{cycleLabel(s.cycle)} · next {formatDate(nextDue(s, today))}</span>
                    <RenewalBar s={s} today={today} />
                  </span>
                  <span className="text-sm font-semibold">{formatCurrency(myShare(s), s.currency)}</span>
                </button>
              ))}
            </Card>
          )}
          <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
            <span>Import a CSV with columns: name, price, currency, billing, date.</span>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary"><Upload className="h-4 w-4" /> Import</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Import a CSV file" onChange={(e) => void onCsv(e.target.files?.[0])} />
          </div>
        </>
      )}

      {editing && form && createPortal(
        <div className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label={editing.id ? "Edit subscription" : "Add a subscription"}>
          <div className="flex max-h-full w-full max-w-lg flex-col rounded-t-2xl bg-background md:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between px-5 pt-4">
              <h2 className="text-lg font-bold">{editing.id ? "Edit subscription" : "Add a subscription"}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-3">
            <label className={field}>Name<Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className={field}>Price<Input inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} /></label>
              <label className={field}>Currency
                <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                  {[...new Set([form.currency, ...CURRENCIES.map((c) => c.code)])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Billed</span>
              <div role="group" aria-label="Billed" className="flex gap-1 rounded-xl bg-muted p-1">
                {CYCLES.map((c) => <button key={c.key} type="button" aria-pressed={form.cycle === c.key} onClick={() => set("cycle", c.key)} className={cn("min-h-11 flex-1 rounded-lg text-sm", form.cycle === c.key ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}>{c.label}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={field}>Next payment<Input type="date" value={form.next_payment} onChange={(e) => set("next_payment", e.target.value)} /></label>
              <label className={field}>Free trial ends<Input type="date" value={form.trial_ends} onChange={(e) => set("trial_ends", e.target.value)} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={field}>Split between (people)<Input inputMode="numeric" value={form.split_count} onChange={(e) => set("split_count", e.target.value)} /></label>
              <label className={field}><span className="flex items-center gap-1"><Bell className="h-3.5 w-3.5" /> Remind me (days before)</span><Input inputMode="numeric" value={form.remind_days} onChange={(e) => set("remind_days", e.target.value)} /></label>
            </div>
            <label className={field}>Category<Input value={form.category} onChange={(e) => set("category", e.target.value)} maxLength={40} placeholder="Streaming, Software…" /></label>
            <label className={field}>Cancel link<Input value={form.cancel_url} onChange={(e) => set("cancel_url", e.target.value)} placeholder="https://" /></label>
            <label className={field}>Notes<Input value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} /></label>
            {editingSub && editingSub.price_history.length > 1 && (
              <div className="rounded-xl border p-3 text-sm">
                <p className="mb-1 font-semibold">Price history</p>
                {[...editingSub.price_history].reverse().map((h) => <p key={h.at} className="flex justify-between text-muted-foreground"><span>{h.at}</span><span>{formatCurrency(h.price, editingSub.currency)}</span></p>)}
              </div>
            )}
            {editingSub && (
              <div className="grid grid-cols-2 gap-2">
                {editingSub.status === "active"
                  ? <Button variant="outline" onClick={() => void setStatus(editingSub, "paused").then(() => setEditing(null))}>Pause</Button>
                  : <Button variant="outline" onClick={() => void setStatus(editingSub, "active").then(() => setEditing(null))}>Resume</Button>}
                <Button variant="outline" onClick={() => void setStatus(editingSub, "cancelled").then(() => setEditing(null))}>Mark cancelled</Button>
                {editingSub.cancel_url && <a href={editingSub.cancel_url} target="_blank" rel="noopener noreferrer" className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold hover:bg-accent"><ExternalLink className="h-4 w-4" /> Open cancel page</a>}
                <Button variant="destructive" className="col-span-2" onClick={() => void remove(editingSub)}>Delete</Button>
              </div>
            )}
            </div>
            <div className="shrink-0 space-y-2 border-t px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
              <Button onClick={save} disabled={saving} className="h-12 w-full text-base">{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
