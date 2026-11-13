"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ReceiptCapture } from "@/components/personal/ReceiptCapture";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { AmountField } from "@/components/personal/AmountField";
import { useUsdRate } from "@/lib/personal/use-rate";
import { parseAmount, QUICK_DEFAULT_CURRENCY } from "@/lib/personal/quick-spend";
import { useUtilityBills } from "@/lib/personal/use-utility-bills";
import { isKind, kindLabel, lastProvider, defaultBillMonth, usualLag, monthLabel, monthStart, shiftMonth, UTILITY_KINDS } from "@/lib/personal/utilities";
import { todayISO } from "@/lib/utils";
import { browserOutbox } from "@/lib/outbox";
import { browserBlobs } from "@/lib/offline-store";
import { makeRowApi, saveRow } from "@/lib/row-outbox";

const chip = (on: boolean) =>
  `inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "bg-card hover:bg-accent"}`;

/** Add a bill, or change one (?id=). Saves on this phone first, so it works with no signal. */
export function UtilityBillForm() {
  const router = useRouter();
  const currencies = useCurrencies();
  const { rows } = useUtilityBills();
  const [editId, setEditId] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("water");
  const [provider, setProvider] = useState("");
  const [providerTouched, setProviderTouched] = useState(false);
  const [month, setMonth] = useState(shiftMonth(monthStart(todayISO()), -1));
  const [monthTouched, setMonthTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(QUICK_DEFAULT_CURRENCY);
  const [paid, setPaid] = useState(true);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedEdit, setLoadedEdit] = useState(false);
  const [fromEmail, setFromEmail] = useState<{ check: boolean } | null>(null);
  const { rate, setRate } = useUsdRate(currency);
  // The rate a saved bill was entered with: editing it must not quietly swap in today's rate
  const [rateTouched, setRateTouched] = useState(false);
  const [savedRate, setSavedRate] = useState<{ currency: string; rate: number } | null>(null);

  // ?kind= presets the utility, ?id= opens an existing bill
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const k = q.get("kind");
    if (isKind(k)) setKind(k);
    setEditId(q.get("id"));
  }, []);
  useEffect(() => {
    if (!editId || !rows || loadedEdit) return;
    const b = rows.find((r) => r.id === editId);
    if (!b) return;
    setLoadedEdit(true);
    setKind(b.kind); setProvider(b.provider ?? ""); setProviderTouched(true); setMonth(b.bill_month); setMonthTouched(true);
    setAmount(Number(b.amount) > 0 ? String(b.amount) : ""); setCurrency(b.currency);
    // a bill that came by email and is still unpaid is opened to be paid: Paid, today, ready to confirm
    const emailDue = b.source === "email" && !b.paid_on;
    if (b.source === "email") setFromEmail({ check: !!b.needs_check });
    setPaid(emailDue ? true : !!b.paid_on); setPaidOn(b.paid_on ?? todayISO());
    setDueDate(b.due_date ?? ""); setNotes(b.notes ?? ""); setCurrentPath(b.receipt_path ?? null);
    if (Number(b.exchange_rate) > 0) setSavedRate({ currency: b.currency, rate: Number(b.exchange_rate) });
  }, [editId, rows, loadedEdit]);
  // The company you used last for this utility is filled in until you type your own
  useEffect(() => {
    if (!rows || editId || providerTouched) return;
    setProvider(lastProvider(rows, kind) ?? "");
  }, [rows, kind, editId, providerTouched]);

  // "Bill for" follows how late this company's bills usually are, until you pick a month yourself
  const lag = rows ? usualLag(rows, kind, provider) : 1;
  const hasHistory = !!rows?.some((r) => r.kind === kind && r.paid_on);
  useEffect(() => {
    if (editId || monthTouched || !rows) return;
    setMonth(defaultBillMonth(paid && paidOn ? paidOn : todayISO(), lag));
  }, [rows, editId, monthTouched, paid, paidOn, lag]);

  const months = Array.from({ length: 13 }, (_, i) => shiftMonth(monthStart(todayISO()), -i));
  if (!months.includes(month)) months.push(month);
  const choices = currencies.some((c) => c.code === "USD") && currencies.some((c) => c.code === QUICK_DEFAULT_CURRENCY) ? [QUICK_DEFAULT_CURRENCY, "USD"] : [];
  const others = currencies.filter((c) => !choices.includes(c.code));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseAmount(amount);
    if (amt == null) return setError("Enter the amount of the bill.");
    const rateNum = currency === "USD" ? 1 : savedRate && savedRate.currency === currency && !rateTouched ? savedRate.rate : Number(rate);
    if (!(rateNum > 0)) return setError("Enter an exchange rate to USD.");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      const row = {
        kind, provider: provider.trim() || null, bill_month: month, amount: amt, currency, exchange_rate: rateNum, amount_usd: toUsd(amt, rateNum),
        paid_on: paid ? paidOn || todayISO() : null, due_date: !paid && dueDate ? dueDate : null, notes: notes.trim() || null,
        ...(fromEmail ? { needs_check: false } : {}),
      };
      const waiting = (await browserOutbox.list().catch(() => [])).find((i) => i.id === editId) ?? null;
      await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: uid, table: "utility_bills", id: editId ?? undefined, row,
        file, fileColumn: file ? "receipt_path" : undefined, bucket: file ? "receipts" : undefined, folder: "personal/utilities", currentPath,
        keep: (path, blob) => browserBlobs.put(`receipts/${path}`, blob), waiting,
        label: `${kindLabel(kind)} bill`, summary: `Utility bill · ${editId ? "change" : "new"}`,
      });
      router.push("/personal/utilities");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-[13px] font-bold text-foreground/80";
  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8 lg:max-w-4xl">
      <Link href="/personal/utilities" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Utilities</Link>
      <h1 className="text-xl font-bold">{editId ? (fromEmail ? "Bill from email" : "Change bill") : "Add bill"}</h1>
      {fromEmail && (
        <p className="mt-2 flex gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[13px] leading-snug text-blue-900 dark:bg-blue-950 dark:text-blue-100" data-testid="util-email-banner"><Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{fromEmail.check ? "From your email. Check the amount and the month, then tap Save when you pay." : "From your email. Tap Save when you pay, or choose Not paid yet."}</p>
      )}

      <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl border bg-card p-4 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:space-y-0 lg:gap-y-4 lg:p-6" data-testid="util-form">
        <div>
          <span className={label} id="ub-kind">Utility</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ub-kind">
            {UTILITY_KINDS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setProviderTouched(false); }} className={chip(kind === k.id)}>{k.label}</button>)}
          </div>
        </div>

        <div>
          <label htmlFor="ub-provider" className={label}>Company</label>
          <Input id="ub-provider" value={provider} onChange={(e) => { setProvider(e.target.value); setProviderTouched(true); }} placeholder="Who sends the bill" maxLength={80} className="h-12 text-base" />
        </div>

        <div>
          <label htmlFor="ub-amount" className={label}>Amount</label>
          <AmountField id="ub-amount" amount={amount} onAmount={setAmount} currency={currency} onCurrency={setCurrency} choices={choices} others={others} rate={rate} onRate={(v) => { setRateTouched(true); setRate(v); }} />
        </div>

        <div>
          <span className={label} id="ub-paid">Payment</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ub-paid">
            <button type="button" aria-pressed={paid} onClick={() => setPaid(true)} className={chip(paid)}>Paid</button>
            <button type="button" aria-pressed={!paid} onClick={() => setPaid(false)} className={chip(!paid)}>Not paid yet</button>
          </div>
          {paid ? (
            <div className="mt-2"><label htmlFor="ub-paidon" className="mb-1 block text-xs text-muted-foreground">Paid on <span>(the month it counts in)</span></label><Input id="ub-paidon" type="date" value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} className="h-12" /></div>
          ) : (
            <div className="mt-2"><label htmlFor="ub-due" className="mb-1 block text-xs text-muted-foreground">Due date <span>(optional)</span></label><Input id="ub-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-12" /></div>
          )}
        </div>

        <div>
          <label htmlFor="ub-month" className={label}>This bill is for the month of</label>
          <Select id="ub-month" value={month} onChange={(e) => { setMonthTouched(true); setMonth(e.target.value); }}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="ub-month-hint">As printed on the bill.{hasHistory && !editId ? ` ${provider.trim() || kindLabel(kind)} is usually ${lag === 0 ? "the same month" : `${lag} month${lag === 1 ? "" : "s"} back`}.` : ""}</p>
        </div>

        <div>
          <span className={label}>Photo of the bill <span className="font-normal text-muted-foreground">(optional)</span></span>
          <ReceiptCapture preview={preview} busy={false} maxSide={1600} onFile={(f, url) => { setFile(f); setPreview(url); }} onClear={() => { setFile(null); setPreview(null); }} />
          {currentPath && !file && <p className="mt-1 text-xs text-muted-foreground">This bill has a photo. Add another to replace it.</p>}
        </div>

        <div>
          <label htmlFor="ub-note" className={label}>Note <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input id="ub-note" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Account number, meter reading" maxLength={500} />
        </div>

        {error && <Alert className="lg:col-span-2">{error}</Alert>}
        <Button type="submit" disabled={saving} className="h-12 w-full text-base lg:col-span-2 lg:w-64" data-testid="util-save">{saving ? "Saving..." : "Save bill"}</Button>
      </form>
    </div>
  );
}
