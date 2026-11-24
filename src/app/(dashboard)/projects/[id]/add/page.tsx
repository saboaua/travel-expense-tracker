"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Camera, Loader2, ScanText, ScrollText, Upload, X } from "lucide-react";
import { AiScanMeter } from "@/components/pro/AiScanMeter";
import { BackLink } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CategoryButtons } from "@/components/ui/category-buttons";
import { ReceiptCropper } from "@/components/ReceiptCropper";
import { LongReceiptFlow } from "@/components/scan/LongReceiptFlow";
import { createClient } from "@/lib/supabase/client";
import { compressReceiptImage } from "@/lib/compress-image";
import { extractReceipt, howRead } from "@/lib/receipt-extract";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { useExpenseCategories } from "@/lib/use-categories";
import { formatCurrency, todayISO } from "@/lib/utils";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

/** Scan or upload a receipt into one project: the photo is read for store, date and total, then saved with the project. */
export default function AddProjectReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const currencies = useCurrencies();
  const categories = useExpenseCategories();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  const [longOpen, setLongOpen] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("1");
  const [category, setCategory] = useState("Other");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { createClient().from("business_projects").select("name").eq("id", id).maybeSingle().then(({ data }) => setName((data?.name as string) ?? "")); }, [id]);
  useEffect(() => { if (categories.length && !categories.some((c) => c.name === category)) setCategory(categories.find((c) => c.name === "Other")?.name ?? categories[0].name); }, [categories, category]);
  useEffect(() => {
    let live = true;
    if (currency === "USD") { setRate("1"); return; }
    fetch(`/api/fx?from=${currency}`).then((r) => r.json()).then((j) => { if (live && typeof j.rate === "number") setRate(String(j.rate)); }).catch(() => {});
    return () => { live = false; };
  }, [currency]);

  const usd = amount && Number.isFinite(Number(amount)) && Number.isFinite(Number(rate)) ? toUsd(Number(amount), Number(rate)) : null;

  const onCropped = async (cropped: File) => {
    setPendingCrop(null);
    setReading(true);
    let f = cropped;
    try { f = await compressReceiptImage(cropped); } catch { /* keep the cropped photo */ }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
    try {
      const r = await extractReceipt(f, { currency, categories: categories.map((c) => c.name) });
      const filled: string[] = [];
      if (r.merchant) { setMerchant(r.merchant); filled.push("store"); }
      if (r.amount != null) { setAmount(r.amount.toFixed(2)); filled.push("total"); }
      if (r.date) { setDate(r.date); filled.push("date"); }
      if (r.currency && r.currency !== currency && currencies.some((c) => c.code === r.currency)) { setCurrency(r.currency); filled.push("currency"); }
      const cat = r.category ? categories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase()) : null;
      if (cat) { setCategory(cat.name); filled.push("category"); }
      setNote(filled.length ? `Read (${howRead(r)}): ${filled.join(", ")}. Check it before saving.` : "Could not read the receipt. Enter the details by hand.");
    } catch {
      setNote("Could not read the receipt. Enter the details by hand.");
    }
    setReading(false);
  };
  const clear = () => { setFile(null); setPreview(null); setNote(null); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) return setError("Enter the receipt total.");
    setBusy(true); setError(null);
    let path: string | null = null;
    const supabase = createClient();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      if (!navigator.onLine) throw new Error("No connection. Project receipts need a connection to save.");
      if (file) {
        path = `${uid}/projects/${id}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (up.error) { path = null; throw new Error("The photo could not be saved. Try again."); }
      }
      const r = Number(rate) || (currency === "USD" ? 1 : 0);
      const { error: ins } = await supabase.from("business_project_receipts").insert({ user_id: uid, project_id: id, merchant: merchant.trim() || null, amount: amt, currency, exchange_rate: r || null, amount_usd: r ? toUsd(amt, r) : null, category, expense_date: date, notes: notes.trim() || null, receipt_path: path });
      if (ins) {
        if (path) await supabase.storage.from("receipts").remove([path]).catch(() => {});
        throw new Error("Could not save. Check your connection and try again.");
      }
      router.push(`/projects/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className={`${PAGE_WIDTH.formColumn} p-4 pb-28 md:p-8`}>
      <BackLink href={`/projects/${id}`} className="mb-6">Project</BackLink>
      <Card>
        <CardHeader>
          <CardTitle>Add receipt</CardTitle>
          <CardDescription>{name ? `For ${name}. ` : ""}Take a photo and we read the store, date and total.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-5">
            <div className="space-y-2">
              {preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Receipt preview" className="max-h-64 w-full rounded-lg border bg-muted object-contain" />
                  <button type="button" onClick={clear} aria-label="Remove the photo" className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><X className="h-4 w-4" /></button>
                  {reading && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40"><div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Reading receipt…</div></div>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" data-testid="project-take-photo" onClick={() => { input.current?.setAttribute("capture", "environment"); input.current?.click(); }} className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5"><Camera className="h-7 w-7 text-primary" /><span className="text-sm font-medium text-primary">Take photo</span></button>
                  <button type="button" onClick={() => { input.current?.removeAttribute("capture"); input.current?.click(); }} className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed"><Upload className="h-7 w-7 text-muted-foreground" /><span className="text-sm font-medium">Upload</span></button>
                </div>
              )}
              {!preview && (
                <button type="button" onClick={() => setLongOpen(true)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-left dark:border-violet-900 dark:bg-violet-950/30">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"><ScrollText className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-violet-900 dark:text-violet-200">Long receipt?</span><span className="block text-[13px] text-violet-800 dark:text-violet-300">Take it in parts. We join them for you.</span></span>
                </button>
              )}
              <input ref={input} type="file" accept="image/*" data-testid="project-receipt-input" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPendingCrop(f); }} />
              <AiScanMeter />
              {note && <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><ScanText className="mt-0.5 h-3.5 w-3.5 shrink-0" />{note}</p>}
            </div>

            <div className="space-y-2"><label htmlFor="pr-store" className="text-sm font-medium">Store</label><Input id="pr-store" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Ace Hardware" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-2"><label htmlFor="pr-amount" className="text-sm font-medium">Total *</label><Input id="pr-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required className="w-full min-w-0" /></div>
              <div className="min-w-0 space-y-2"><label htmlFor="pr-cur" className="text-sm font-medium">Currency</label><Select id="pr-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</Select></div>
            </div>
            {currency !== "USD" && <p className="text-xs text-muted-foreground">1 {currency} = {rate || "0"} USD{usd != null && ` · ${formatCurrency(usd, "USD")}`}</p>}
            <div className="space-y-2"><label htmlFor="pr-date" className="text-sm font-medium">Date *</label><Input id="pr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full min-w-0" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Category</label><CategoryButtons options={categories} value={category} onChange={setCategory} /></div>
            <div className="space-y-2"><label htmlFor="pr-notes" className="text-sm font-medium">Notes</label><Input id="pr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" disabled={busy || reading} data-testid="project-receipt-save">{busy ? "Saving…" : "Save receipt"}</Button>
          </form>
        </CardContent>
      </Card>
      {longOpen && <LongReceiptFlow onCancel={() => setLongOpen(false)} onDone={(f) => { setLongOpen(false); void onCropped(f); }} />}
      {pendingCrop && <ReceiptCropper file={pendingCrop} onDone={onCropped} onCancel={() => setPendingCrop(null)} />}
    </div>
  );
}
