"use client";

import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Camera, Loader2, ScanText, Trash2, Upload, X } from "lucide-react";
import { CategoryButtons } from "@/components/ui/category-buttons";
import { useExpenseCategories } from "@/lib/use-categories";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { formatCurrency } from "@/lib/utils";
import { compressReceiptImage } from "@/lib/compress-image";
import { extractReceipt, howRead } from "@/lib/receipt-extract";
import { EXPENSE_COLS } from "@/lib/columns";
import { browserBlobs, browserKv, loadWithCache } from "@/lib/offline-store";
import { browserOutbox } from "@/lib/outbox";
import { deleteExpenseChange, isExpenseUpdate, makeExpenseChangeApi, RECEIPT_BUCKET, saveExpenseChange, type ExpenseFields } from "@/lib/expense-outbox";
import { expenseKey } from "@/lib/offline-data";
import { OfflineNotice } from "@/components/OfflineNotice";


export default function EditExpensePage() {
  const currencies = useCurrencies();
  const params = useParams();
  const tripId = params.id as string;
  const expenseId = params.expenseId as string;
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("1");
  const [category, setCategory] = useState("Other");
  const categories = useExpenseCategories();
  const [expenseDate, setExpenseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);

  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      // The session is read from the phone, so this also works with no connection
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) { setError("Sign in again to open this expense."); setLoaded(true); return; }
      type Row = ExpenseFields & { receipt_path: string | null };
      const res = await loadWithCache<Row>(browserKv, expenseKey(uid, expenseId), () => supabase.from("expenses").select(EXPENSE_COLS).eq("id", expenseId).eq("trip_id", tripId).single() as unknown as PromiseLike<{ data: Row | null; error: unknown }>);
      if (!res.ok) {
        setError((res.error as { message?: string } | null)?.message || "Expense not found");
        setLoaded(true);
        return;
      }
      setSavedAt(res.fromCache ? res.savedAt : null);
      // A change waiting to be sent shows as if it were already saved
      const waiting = (await browserOutbox.list().catch(() => [])).find((i) => i.id === expenseId && i.userId === uid);
      const data: Row = { ...res.data };
      if (waiting && isExpenseUpdate(waiting)) {
        Object.assign(data, waiting.fields);
        if (waiting.path !== undefined) data.receipt_path = waiting.path;
      }
      setMerchant(data.merchant || "");
      setAmount(String(data.amount ?? ""));
      setCurrency(data.currency || "USD");
      setRate(data.exchange_rate != null ? String(data.exchange_rate) : "1");
      setCategory(data.category || "Other");
      setExpenseDate(data.expense_date || "");
      setNotes(data.notes || "");
      setReceiptPath(data.receipt_path || null);
      if (data.receipt_path) {
        const kept = await browserBlobs.get(`${RECEIPT_BUCKET}/${data.receipt_path}`).catch(() => null);
        if (kept) setReceiptUrl(URL.createObjectURL(kept));
        else if (!res.fromCache) {
          const { data: signed } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(data.receipt_path, 60 * 30);
          if (signed?.signedUrl) setReceiptUrl(signed.signedUrl);
        }
      }
      setLoaded(true);
    })();
  }, [supabase, expenseId, tripId]);

  const usd = amount && !Number.isNaN(Number(amount)) && !Number.isNaN(Number(rate)) ? toUsd(Number(amount), Number(rate)) : null;

  const pickFile = async (file: File) => {
    let processed = file;
    try {
      processed = await compressReceiptImage(file);
    } catch {
      // keep original
    }
    setNewFile(processed);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(processed);
  };

  /** Reads the receipt again (AI first, on-device OCR as the fallback) and puts what it finds into the form. Nothing is saved until Save. */
  const readAgain = async () => {
    setReading(true);
    setReadNote(null);
    try {
      let file = newFile;
      if (!file && receiptUrl) {
        const res = await fetch(receiptUrl);
        if (!res.ok) throw new Error("Could not open the receipt");
        const blob = await res.blob();
        file = new File([blob], "receipt.jpg", { type: blob.type || "image/jpeg" });
      }
      if (!file) throw new Error("No receipt to read");
      if (!file.type.startsWith("image/")) {
        setReadNote("Only photos can be read again. Enter the details by hand.");
        return;
      }
      const result = await extractReceipt(file, { currency, categories: categories.map((c) => c.name) });
      const found: string[] = [];
      if (result.merchant) { setMerchant(result.merchant); found.push("merchant"); }
      if (result.amount != null) { setAmount(result.amount.toFixed(2)); found.push("amount"); }
      if (result.date) { setExpenseDate(result.date); found.push("date"); }
      if (result.currency && result.currency !== currency && currencies.some((c) => c.code === result.currency)) {
        setCurrency(result.currency);
        found.push(`currency (${result.currency})`);
        // The rate belongs to the currency, so fetch the current one
        if (result.currency === "USD") setRate("1");
        else {
          try {
            const r = await fetch(`/api/fx?from=${result.currency}`);
            const d = await r.json();
            if (r.ok && typeof d.rate === "number") setRate(String(d.rate));
          } catch {
            // keep the old rate; it can be edited below
          }
        }
      }
      const cat = result.category ? categories.find((c) => c.name.toLowerCase() === result.category!.toLowerCase()) : null;
      if (cat) { setCategory(cat.name); found.push("category"); }
      const how = howRead(result);
      setReadNote(found.length ? `Read again (${how}): ${found.join(", ")}. Check the details, then save.` : "Could not read anything from this receipt. Enter the details by hand.");
    } catch (e) {
      setReadNote(e instanceof Error ? e.message : "Reading failed. Enter the details by hand.");
    } finally {
      setReading(false);
    }
  };

  const clearNew = () => {
    setNewFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save this expense.");
      const rateNum = Number(rate) || (currency === "USD" ? 1 : 0);
      const amountNum = parseFloat(amount);
      await saveExpenseChange({
        api: makeExpenseChangeApi(supabase), store: browserOutbox, userId: uid, expenseId, tripId,
        fields: { merchant: merchant || null, amount: amountNum, currency, exchange_rate: rateNum, amount_usd: toUsd(amountNum, rateNum), category, expense_date: expenseDate, notes: notes || null },
        file: newFile, currentPath: receiptPath,
        waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === expenseId) ?? null,
        keep: (path, blob) => browserBlobs.put(`${RECEIPT_BUCKET}/${path}`, blob),
      });
      router.push(`/trips/${tripId}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  };

  const confirm = useConfirm();
  const remove = async () => {
    if (!(await confirm({ title: "Delete expense?", message: "Delete this expense? This cannot be undone.", destructive: true }))) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete this expense.");
      await deleteExpenseChange({
        api: makeExpenseChangeApi(supabase), store: browserOutbox, userId: session.user.id, tripId,
        expense: { id: expenseId, merchant: merchant || null, receipt_path: receiptPath },
        waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === expenseId) ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setSaving(false);
      return;
    }
    router.push(`/trips/${tripId}`);
    router.refresh();
  };

  const shownImage = preview || receiptUrl;

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
      <Link href={`/trips/${tripId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to trip
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Edit Expense</CardTitle>
          <CardDescription>Change the details, replace the receipt, or delete this entry</CardDescription>
          <OfflineNotice savedAt={savedAt} writable />
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Receipt</label>
                {shownImage ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shownImage} alt="Receipt" decoding="async" className="w-full rounded-lg border max-h-80 object-contain bg-muted" />
                    {preview && <button type="button" onClick={clearNew} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white" aria-label="Cancel new receipt"><X className="h-4 w-4" /></button>}
                    {preview && <p className="absolute bottom-2 left-2 text-xs bg-black/60 text-white px-2 py-1 rounded">New receipt — save to keep it</p>}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No receipt uploaded yet.</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { fileInputRef.current?.setAttribute("capture", "environment"); fileInputRef.current?.click(); }} className="flex items-center justify-center gap-2 h-10 rounded-lg border text-sm"><Camera className="h-4 w-4" /> Take photo</button>
                  <button type="button" onClick={() => { fileInputRef.current?.removeAttribute("capture"); fileInputRef.current?.click(); }} className="flex items-center justify-center gap-2 h-10 rounded-lg border text-sm"><Upload className="h-4 w-4" /> Upload new</button>
                </div>
                {shownImage && (
                  <button type="button" onClick={readAgain} disabled={reading || saving} className="flex w-full items-center justify-center gap-2 h-10 rounded-lg border border-primary/40 bg-primary/5 text-sm font-medium text-primary disabled:opacity-60">
                    {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                    {reading ? "Reading the receipt…" : "Read receipt again"}
                  </button>
                )}
                {readNote && <p className="text-xs text-muted-foreground flex items-start gap-1.5"><ScanText className="h-3.5 w-3.5 mt-0.5 shrink-0" />{readNote}</p>}
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) pickFile(file); }} />
                <p className="text-xs text-muted-foreground">New photos are resized automatically.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Merchant</label>
                <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 min-w-0">
                  <label className="text-sm font-medium">Amount *</label>
                  <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full min-w-0" />
                </div>
                <div className="space-y-2 min-w-0">
                  <label className="text-sm font-medium">Currency</label>
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Rate to USD</label>
                <Input type="number" step="0.000001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
                <p className="text-xs text-muted-foreground">1 {currency} = {rate || "0"} USD{usd != null && ` \u00b7 ${formatCurrency(usd, "USD")}`}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date *</label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required className="w-full min-w-0" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <CategoryButtons options={categories} value={category} onChange={setCategory} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {error && <Alert>{error}</Alert>}
              <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving\u2026" : "Save changes"}</Button>
              <Button type="button" variant="outline" className="w-full gap-2 text-red-600" disabled={saving} onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete expense
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
