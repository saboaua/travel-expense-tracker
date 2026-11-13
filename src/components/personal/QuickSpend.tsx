"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_BASE, PERSONAL_SPEND_COLS_MID, withColumnFallback3 } from "@/lib/columns";
import { useHouseAreas } from "@/lib/use-categories";
import { ReceiptCapture } from "@/components/personal/ReceiptCapture";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { AmountField } from "@/components/personal/AmountField";
import { useUsdRate } from "@/lib/personal/use-rate";
import { AREA_PREFIX, houseTarget, parseAmount, QUICK_CATEGORIES, QUICK_DEFAULT_CURRENCY, recentNames, quickSpends, summarizeSpends, type SpendRow } from "@/lib/personal/quick-spend";
import { openSigned } from "@/lib/open-signed";
import { fetchAll } from "@/lib/personal/fetch-all";
import { monthLabel, shiftMonth } from "@/lib/personal/utilities";
import { addDaysISO, formatCurrency, formatDate, todayISO } from "@/lib/utils";
import { browserOutbox } from "@/lib/outbox";
import { browserBlobs } from "@/lib/offline-store";
import { deleteRow, isRowSave, makeRowApi, saveRow } from "@/lib/row-outbox";

type Listed = SpendRow & { waiting?: boolean };

const chip = (on: boolean) =>
  `inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "bg-card hover:bg-accent"}`;

/** Personal purchases with no receipt. Never touches business trips, which still need a receipt or invoice. */
export function QuickSpend() {
  const currencies = useCurrencies();
  const confirm = useConfirm();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(QUICK_DEFAULT_CURRENCY);
  const [what, setWhat] = useState("");
  const [category, setCategory] = useState<string>(QUICK_CATEGORIES[0]);
  const [date, setDate] = useState(todayISO());
  const [pickDate, setPickDate] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [rows, setRows] = useState<Listed[] | null>(null);
  // Looking back: the month shown in the list, and any one spend opened to change or delete
  const [viewMonth, setViewMonth] = useState(todayISO().slice(0, 7));
  const [older, setOlder] = useState<Listed[] | null>(null);
  const [editing, setEditing] = useState<Listed | null>(null);
  const [photoGone, setPhotoGone] = useState(false);
  const [rateTouched, setRateTouched] = useState(false);
  const { rate, setRate } = useUsdRate(currency);
  // House extras: an optional home project and a photo of the invoice
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const isHouse = category === "House";
  const areas = useHouseAreas();
  useEffect(() => {
    createClient().from("personal_projects").select("id, name").eq("kind", "home_project").eq("status", "active").order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setProjects((data ?? []) as { id: string; name: string }[]));
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) return;
    const since = addDaysISO(todayISO(), -60);
    const { data, error: e } = await withColumnFallback3((cols) => supabase.from("personal_spends").select(cols).gte("expense_date", since).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(300), PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_MID, PERSONAL_SPEND_COLS_BASE);
    const waiting = (await browserOutbox.list().catch(() => []))
      .filter((i) => isRowSave(i) && i.table === "personal_spends" && i.isNew)
      .map((i) => ({ id: i.id, ...(isRowSave(i) ? i.row : {}), waiting: true }) as unknown as Listed);
    if (e && !waiting.length) { setRows(/relation|schema cache/i.test(e.message) ? [] : null); if (/relation|schema cache/i.test(e.message)) setError("Run supabase/migration_quick_spend.sql in Supabase first."); return; }
    setRows([...waiting, ...((data ?? []) as unknown as Listed[])]);
  }, []);
  useEffect(() => { load(); }, [load]);
  // An earlier month is loaded on its own, so any spend can be found, not just the last two months
  const loadOlder = useCallback(async (m: string) => {
    const supabase = createClient();
    const from = `${m}-01`, to = `${shiftMonth(from, 1)}`;
    try {
      const data = await fetchAll<Listed>((a, b) => withColumnFallback3((cols) => supabase.from("personal_spends").select(cols).gte("expense_date", from).lt("expense_date", to).order("expense_date", { ascending: false }).order("id").range(a, b), PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_MID, PERSONAL_SPEND_COLS_BASE) as unknown as PromiseLike<{ data: Listed[] | null; error: { message: string } | null }>);
      setOlder(data);
    } catch { setOlder(null); setError("Could not load that month. Check your connection."); }
  }, []);
  const currentMonth = todayISO().slice(0, 7);
  useEffect(() => { if (viewMonth === currentMonth) setOlder(null); else loadOlder(viewMonth); }, [viewMonth, currentMonth, loadOlder]);

  const names = useMemo(() => recentNames(rows ?? []), [rows]);
  const month = todayISO().slice(0, 7);
  const thisMonth = useMemo(() => (rows ?? []).filter((r) => r.expense_date.startsWith(month)), [rows, month]);
  const shown = viewMonth === month ? thisMonth : older;
  const monthTotal = summarizeSpends(quickSpends(shown));
  const houseInMonth = summarizeSpends((shown ?? []).filter((r) => !quickSpends([r]).length));
  const choices = currencies.some((c) => c.code === "USD") && currencies.some((c) => c.code === QUICK_DEFAULT_CURRENCY) ? [QUICK_DEFAULT_CURRENCY, "USD"] : [];
  const others = currencies.filter((c) => !choices.includes(c.code));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setDone(null);
    const amt = parseAmount(amount);
    if (amt == null) return setError("Enter the amount you spent.");
    const rateNum = currency === "USD" ? 1 : Number(rate);
    if (!(rateNum > 0)) return setError("Enter an exchange rate to USD.");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      // Only sent when chosen, so a database without the House migrations still saves everything else
      const house = isHouse ? houseTarget(projectId) : {};
      // Changing a spend keeps the rate it was entered with unless you type another; the house columns are only cleared if it had them
      const keepRate = editing && editing.currency === currency && !rateTouched && Number(editing.exchange_rate) > 0 ? Number(editing.exchange_rate) : null;
      const rateUsed = currency === "USD" ? 1 : keepRate ?? rateNum;
      const cleared = editing && (editing.project_id || editing.house_area) ? { project_id: null, house_area: null } : {};
      const removePhoto = !!editing && !!editing.receipt_path && photoGone && !file;
      const row = { merchant: what.trim() || null, amount: amt, currency, exchange_rate: rateUsed, amount_usd: toUsd(amt, rateUsed), category, expense_date: date, notes: notes.trim() || null, ...cleared, ...house, ...(removePhoto ? { receipt_path: null } : {}) };
      const withPhoto = isHouse ? file : null;
      const waiting = editing ? (await browserOutbox.list().catch(() => [])).find((i) => i.id === editing.id) ?? null : null;
      const r = await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: uid, table: "personal_spends", row, id: editing?.id, waiting,
        file: withPhoto, fileColumn: withPhoto ? "receipt_path" : undefined, bucket: withPhoto ? "receipts" : undefined, folder: "personal/spends", currentPath: editing?.receipt_path ?? null,
        keep: (path, blob) => browserBlobs.put(`receipts/${path}`, blob),
        label: row.merchant || category, summary: editing ? "Quick spend · change" : "Quick spend · new",
      });
      // A photo you removed is deleted from storage too, so nothing is left behind
      if (removePhoto && editing?.receipt_path) await supabase.storage.from("receipts").remove([editing.receipt_path]).catch(() => {});
      setDone(`${r.queued ? "Saved on this phone, will send when you are online" : editing ? "Changed" : "Saved"}: ${formatCurrency(amt, currency)}${row.merchant ? ` · ${row.merchant}` : ""}`);
      clearForm();
      await load();
      if (viewMonth !== month) await loadOlder(viewMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const clearForm = () => {
    setEditing(null); setPhotoGone(false); setRateTouched(false);
    setAmount(""); setWhat(""); setNotes(""); setDate(todayISO()); setPickDate(false); setProjectId(""); setFile(null); setPreview(null);
  };
  /** Opens one spend, from any month, in the form above to change it */
  const startEdit = (r: Listed) => {
    setError(null); setDone(null);
    setEditing(r); setPhotoGone(false); setRateTouched(false); setFile(null); setPreview(null);
    setAmount(String(r.amount)); setCurrency(r.currency); setWhat(r.merchant ?? ""); setCategory(r.category);
    setDate(r.expense_date); setPickDate(r.expense_date !== todayISO() && r.expense_date !== addDaysISO(todayISO(), -1));
    setNotes((r as unknown as { notes?: string | null }).notes ?? "");
    setProjectId(r.project_id ?? (r.house_area ? `${AREA_PREFIX}${r.house_area}` : ""));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (r: Listed) => {
    if (!(await confirm({ title: "Delete this spend?", message: `${r.merchant || r.category}, ${formatCurrency(Number(r.amount), r.currency)}`, destructive: true }))) return;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete.");
      await deleteRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "personal_spends", id: r.id, paths: r.receipt_path ? [r.receipt_path] : [],
        waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === r.id) ?? null, label: r.merchant || r.category, summary: "Quick spend · delete",
      });
      if (editing?.id === r.id) clearForm();
      await load();
      if (viewMonth !== month) await loadOlder(viewMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  const yesterday = addDaysISO(todayISO(), -1);
  const label = "mb-1.5 block text-[13px] font-bold text-foreground/80";
  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:gap-x-8">
      <div className="lg:col-span-2">
      <Link href="/personal" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Personal</Link>
      <h1 className="text-xl font-bold">{editing ? "Change spend" : "Quick spend"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">For purchases with no receipt. It counts toward your personal spending and never goes to a business trip, which still needs a receipt or invoice.</p>

      </div>
      <form onSubmit={submit} className="mt-4 space-y-4 self-start rounded-2xl border bg-card p-4 lg:col-start-1 lg:row-start-2" data-testid="quick-spend-form">
        <div>
          <label htmlFor="qs-amount" className={label}>Amount</label>
          <AmountField id="qs-amount" amount={amount} onAmount={setAmount} currency={currency} onCurrency={setCurrency} choices={choices} others={others} rate={rate} onRate={(v) => { setRateTouched(true); setRate(v); }} />
        </div>

        <div>
          <label htmlFor="qs-what" className={label}>What was it?</label>
          <Input id="qs-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Coffee, peanuts, bus fare" maxLength={120} className="h-12 text-base" />
          {names.length > 0 && (
            <div className="mt-2" data-testid="recent-names">
              <div className="flex flex-wrap gap-2">
                {names.map((n) => (
                  <button key={n.name} type="button" onClick={() => { setWhat(n.name); setCategory(n.category); if (!amount) { setAmount(n.amount ? String(n.amount) : ""); setCurrency(n.currency); } }} className="inline-flex min-h-11 items-center rounded-full bg-blue-50 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-blue-950 dark:text-blue-200">{n.name}</button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Your recent ones. Tap to fill in the name, category and last amount.</p>
            </div>
          )}
        </div>

        <div>
          <span className={label} id="qs-cat">Category</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="qs-cat">
            {QUICK_CATEGORIES.map((c) => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={chip(category === c)}>{c}</button>)}
          </div>
        </div>

        {isHouse && (
          <div className="space-y-3 border-t pt-3" data-testid="house-extras">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">For the house</p>
            <div>
              <label htmlFor="qs-project" className={label}>Part of a project or an area <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Select id="qs-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">None: just a repair</option>
                {projects.length > 0 && <optgroup label="Your home projects">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
                {areas.length > 0 && <optgroup label="Areas of the house">{areas.map((a) => <option key={a.name} value={`${AREA_PREFIX}${a.name}`}>{a.name}</option>)}</optgroup>}
              </Select>
            </div>
            <div>
              <span className={label}>Photo of the invoice <span className="font-normal text-muted-foreground">(optional, good for warranty and returns)</span></span>
              {editing?.receipt_path && !photoGone && !file ? (
                <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2" data-testid="spend-photo-saved">
                  <span className="min-w-0 flex-1 text-sm font-semibold">Photo saved</span>
                  <button type="button" onClick={() => openSigned(async () => (await createClient().storage.from("receipts").createSignedUrl(editing.receipt_path!, 3600)).data?.signedUrl)} className="min-h-11 px-2 text-sm font-semibold text-primary">View</button>
                  <button type="button" onClick={() => setPhotoGone(true)} className="min-h-11 px-2 text-sm font-semibold text-red-600" data-testid="spend-photo-remove">Remove</button>
                </div>
              ) : (
                <ReceiptCapture preview={preview} busy={false} maxSide={1600} onFile={(f, url) => { setFile(f); setPreview(url); }} onClear={() => { setFile(null); setPreview(null); }} />
              )}
            </div>
          </div>
        )}

        <div>
          <span className={label} id="qs-date">Date</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="qs-date">
            <button type="button" aria-pressed={!pickDate && date === todayISO()} onClick={() => { setPickDate(false); setDate(todayISO()); }} className={chip(!pickDate && date === todayISO())}>Today</button>
            <button type="button" aria-pressed={!pickDate && date === yesterday} onClick={() => { setPickDate(false); setDate(yesterday); }} className={chip(!pickDate && date === yesterday)}>Yesterday</button>
            <button type="button" aria-pressed={pickDate} onClick={() => setPickDate(true)} className={chip(pickDate)}>Pick a date</button>
          </div>
          {pickDate && <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="mt-2 h-12" aria-label="Date" />}
        </div>

        <div>
          <label htmlFor="qs-note" className={label}>Note <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input id="qs-note" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note" maxLength={500} />
        </div>

        {error && <Alert>{error}</Alert>}
        {done && <Alert variant="success" data-testid="quick-spend-done">{done}</Alert>}
        <Button type="submit" disabled={saving} className="h-12 w-full text-base" data-testid="quick-spend-save">{saving ? "Saving..." : editing ? "Save changes" : "Save spend"}</Button>
        {editing && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={clearForm} data-testid="spend-edit-cancel">Cancel</Button>
            <button type="button" onClick={() => remove(editing)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950" data-testid="spend-edit-delete"><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete this spend</button>
          </div>
        )}
      </form>

      <div className="lg:col-start-2 lg:row-start-2 lg:min-w-0">
      <Link href="/personal/house" className="mt-6 inline-flex lg:mt-4 min-h-11 items-center gap-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="house-link">House &amp; repairs</Link>
      <div className="mt-4 flex items-center gap-1" data-testid="month-stepper">
        <button type="button" onClick={() => setViewMonth(shiftMonth(`${viewMonth}-01`, -1).slice(0, 7))} aria-label="Earlier month" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <h2 className="flex-1 text-center text-[17px] font-bold" data-testid="month-label">{viewMonth === month ? "This month" : monthLabel(`${viewMonth}-01`)}</h2>
        <button type="button" onClick={() => setViewMonth(shiftMonth(`${viewMonth}-01`, 1).slice(0, 7))} disabled={viewMonth >= month} aria-label="Later month" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-30"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      {monthTotal && <p className="mt-1 text-[26px] font-bold tabular-nums tracking-tight" data-testid="month-total">{formatCurrency(monthTotal.total, monthTotal.currency)} <span className="text-sm font-medium text-muted-foreground">in {monthTotal.count} {monthTotal.count === 1 ? "spend" : "spends"}</span></p>}
      {houseInMonth && <p className="mt-1 text-xs text-muted-foreground" data-testid="month-house-note">Not included: {formatCurrency(houseInMonth.total, houseInMonth.currency)} of house costs, counted under House &amp; repairs.</p>}
      <div className="mt-2 rounded-2xl border bg-card px-4" data-testid="spend-list">
        {rows === null || shown === null ? <p className="py-4 text-sm text-muted-foreground">&nbsp;</p> : shown.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{viewMonth === month ? "Nothing yet this month." : "Nothing in this month."}</p>
        ) : (
          <ul className="divide-y">
            {shown.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 py-2" data-testid="spend-row">
                <button type="button" onClick={() => startEdit(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="spend-open" aria-label={`Change ${r.merchant || r.category}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.merchant || r.category}</span>
                  <span className="block text-[13px] text-muted-foreground">{formatDate(r.expense_date)} · {r.category}{r.waiting ? " · waiting to send" : ""}</span>
                </span>
                <span className="text-[15px] font-bold tabular-nums">{formatCurrency(Number(r.amount), r.currency)}</span>
                </button>
                <button type="button" onClick={() => remove(r)} aria-label={`Delete ${r.merchant || r.category}`} className="flex h-11 w-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-red-950"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}
