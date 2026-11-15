"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toUsd } from "@/lib/currencies";
import { browserOutbox } from "@/lib/outbox";
import { browserBlobs } from "@/lib/offline-store";
import { makeRowApi, saveRow } from "@/lib/row-outbox";
import { parseAmount } from "@/lib/personal/quick-spend";
import { cleanRef, dueLabel, kindLabel, monthLabel, monthStart, type BillRow } from "@/lib/personal/utilities";
import { formatDate, todayISO } from "@/lib/utils";
import { UtilityIcon, LateChip } from "@/components/personal/utility-ui";

/** The quick way to pay a bill you already added: confirm the amount, the day and, if you paid online, the reference number. */
export function MarkPaidSheet({ bill, onClose, onSaved }: { bill: BillRow; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [amount, setAmount] = useState(String(Number(bill.amount)));
  const [paidOn, setPaidOn] = useState(today);
  const [ref, setRef] = useState(bill.payment_ref ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const due = dueLabel(bill, today);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseAmount(amount);
    if (amt == null) return setError("Enter the amount you paid.");
    if (!paidOn || paidOn > today) return setError("Pick the day you paid, today or earlier.");
    const old = Number(bill.amount);
    const rate = Number(bill.exchange_rate);
    let usd = Number(bill.amount_usd);
    if (amt !== old) {
      if (bill.currency === "USD") usd = amt;
      else if (rate > 0) usd = toUsd(amt, rate);
      else if (old > 0 && usd > 0) usd = Math.round((usd * amt / old) * 100) / 100;
      else return setError("Open Edit all details to set the exchange rate for this amount.");
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      const cleaned = cleanRef(ref);
      // payment_ref is only sent when there is one (or one is being cleared), so a database without the new column keeps working
      const row: Record<string, unknown> = {
        paid_on: paidOn, due_date: null, amount: amt, amount_usd: usd,
        ...(cleaned || bill.payment_ref ? { payment_ref: cleaned } : {}),
        ...(bill.source === "email" ? { needs_check: false } : {}),
      };
      const waiting = (await browserOutbox.list().catch(() => [])).find((i) => i.id === bill.id) ?? null;
      await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: uid, table: "utility_bills", id: bill.id, row,
        currentPath: bill.receipt_path ?? null, keep: (path, blob) => browserBlobs.put(`receipts/${path}`, blob), waiting,
        label: `${kindLabel(bill.kind)} bill`, summary: "Utility bill · paid",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  const label = "mb-1 block text-[13px] font-bold text-foreground/80";
  return (
    <div className="app-frame fixed inset-0 z-[55] flex items-end justify-center md:items-center" data-testid="mark-paid">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <form role="dialog" aria-modal="true" aria-labelledby="mp-title" onSubmit={save} className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border bg-card p-4 pb-6 shadow-2xl md:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-muted-foreground/30 md:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <UtilityIcon kind={bill.kind} className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <h2 id="mp-title" className="truncate text-[17px] font-bold">{kindLabel(bill.kind)}{bill.provider ? <span className="font-medium text-muted-foreground"> · {bill.provider}</span> : null}</h2>
            <p className="text-[13px] text-muted-foreground">for {monthLabel(bill.bill_month).split(" ")[0]}{bill.due_date ? ` · due ${formatDate(bill.due_date)}` : ""}</p>
          </div>
          {due.state === "late" && <LateChip text={due.text} />}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="mp-amount" className={label}>Amount paid</label>
            <div className="flex items-center gap-2 rounded-xl border px-3">
              <span className="text-sm font-bold text-muted-foreground">{bill.currency}</span>
              <input ref={first} id="mp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums outline-none" />
            </div>
          </div>
          <div>
            <label htmlFor="mp-date" className={label}>Paid on</label>
            <Input id="mp-date" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className="h-12" />
          </div>
          <div>
            <label htmlFor="mp-ref" className={label}>Payment reference <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id="mp-ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} autoComplete="off" className="h-12" />
            <p className="mt-1 text-xs text-muted-foreground">The number from your online payment confirmation. It helps if the company asks for proof.</p>
          </div>
          <p className="text-xs text-muted-foreground">It will count in {monthLabel(monthStart(paidOn || today)).split(" ")[0]}, the month you paid it.</p>
          {error && <Alert>{error}</Alert>}
        </div>

        <Button type="submit" disabled={saving} className="mt-4 h-12 w-full text-base" data-testid="mark-paid-save">{saving ? "Saving..." : "Mark as paid"}</Button>
        <Link href={`/personal/utilities/add?id=${bill.id}`} className="mt-1 flex min-h-11 items-center justify-center text-sm font-semibold text-primary">Edit all details</Link>
      </form>
    </div>
  );
}
