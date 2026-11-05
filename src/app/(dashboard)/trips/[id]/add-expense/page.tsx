"use client";

import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Camera, Upload, X, ScanText, Loader2 } from "lucide-react";
import { CategoryButtons } from "@/components/ui/category-buttons";
import { useExpenseCategories } from "@/lib/use-categories";
import { extractReceipt } from "@/lib/receipt-extract";
import { compressReceiptImage } from "@/lib/compress-image";
import { ReceiptCropper } from "@/components/ReceiptCropper";
import { takeQuickScan } from "@/lib/quick-scan";
import { ScanChip } from "@/components/scan/ScanChip";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { formatCurrency, todayISO } from "@/lib/utils";
import { enqueueExpense, newExpenseId, pushExpense, type DuplicateMatch, type PushOutcome, type QueuedExpense } from "@/lib/offline-queue";
import { imageDhash } from "@/lib/image-hash";
import { DuplicateList } from "@/components/DuplicateList";
import { makeSyncApi } from "@/lib/offline-api";
import { SYNC_NOW_EVENT } from "@/components/OfflineSync";


export default function AddExpensePage() {
  const currencies = useCurrencies();
  const params = useParams();
  const tripId = params.id as string;
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("1");
  const [rateSource, setRateSource] = useState("manual");
  const [category, setCategory] = useState("Meals");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ item: QueuedExpense; matches: DuplicateMatch[] } | null>(null);
  const categories = useExpenseCategories();
  const [tripReady, setTripReady] = useState(false);
  const [tripName, setTripName] = useState("");
  const quickHandled = useRef(false);

  useEffect(() => {
    supabase.from("trips").select("name, currency").eq("id", tripId).single().then(({ data }) => {
      if (data?.currency) setCurrency(data.currency);
      if (data?.name) setTripName(data.name);
      setTripReady(true);
    });
  }, [supabase, tripId]);

  // Photo taken with Quick Scan on the dashboard: load it and read it automatically
  useEffect(() => {
    if (!tripReady || quickHandled.current) return;
    quickHandled.current = true;
    if (new URLSearchParams(window.location.search).get("quick") !== "1") return;
    takeQuickScan(`trip:${tripId}`).then((f) => {
      if (!f) return;
      setPendingCrop(f);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, guarded by quickHandled
  }, [tripReady]);

  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.name === category)) setCategory(categories[0].name);
  }, [categories, category]);

  useEffect(() => {
    let cancelled = false;
    async function loadRate() {
      if (currency === "USD") {
        setRate("1");
        setRateSource("usd");
        return;
      }
      try {
        const res = await fetch(`/api/fx?from=${currency}`);
        const data = await res.json();
        if (!cancelled && res.ok && typeof data.rate === "number") {
          setRate(String(data.rate));
          setRateSource("market");
        }
      } catch {
        if (!cancelled) setRateSource("manual");
      }
    }
    loadRate();
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const usd =
    amount && !Number.isNaN(Number(amount)) && !Number.isNaN(Number(rate))
      ? toUsd(Number(amount), Number(rate))
      : null;

  const runOcrOnFile = async (selected: File) => {
    setOcrLoading(true);
    setOcrNote(null);
    try {
      const result = await extractReceipt(selected, {
        currency,
        categories: categories.map((c) => c.name),
      });
      const filled: string[] = [];
      if (result.merchant && !merchant) {
        setMerchant(result.merchant);
        filled.push("merchant");
      }
      if (result.amount != null && !amount) {
        setAmount(result.amount.toFixed(2));
        filled.push("amount");
      }
      if (result.date) {
        setExpenseDate(result.date);
        filled.push("date");
      }
      // Only switch currency to one the app supports (the rate loads automatically)
      if (result.currency && result.currency !== currency && currencies.some((c) => c.code === result.currency)) {
        setCurrency(result.currency);
        filled.push(`currency (${result.currency})`);
      }
      const matchedCategory = result.category
        ? categories.find((c) => c.name.toLowerCase() === result.category!.toLowerCase())
        : null;
      if (matchedCategory) {
        setCategory(matchedCategory.name);
        filled.push("category");
      }
      const how = result.source === "ai" ? "AI" : "basic OCR";
      setOcrNote(
        filled.length > 0
          ? `Auto-filled (${how}): ${filled.join(", ")}. Please verify before saving.`
          : "Could not detect fields automatically. Enter details manually."
      );
    } catch {
      setOcrNote("OCR failed. Enter details manually.");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    setPendingCrop(selected);
  };

  const onCropped = async (cropped: File) => {
    setPendingCrop(null);
    setOcrLoading(true);
    let processed = cropped;
    try {
      processed = await compressReceiptImage(cropped);
    } catch {
      // fall back to cropped if compression fails
    }
    setFile(processed);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(processed);
    await runOcrOnFile(processed);
  };

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    setOcrNote(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    clearImage();
    setMerchant("");
    setAmount("");
    setNotes("");
    setExpenseDate(todayISO());
  };

  /** Saves one captured expense: straight away if online, on this device if not, or stops to ask if it looks like a duplicate. */
  const finish = async (item: QueuedExpense) => {
    setLoading(true);
    setError(null);
    setQueuedNote(null);
    setDuplicate(null);
    try {
      // Online: save straight away, as before. No connection (or it drops mid-save): keep it on this device and send it later.
      const outcome: PushOutcome = navigator.onLine ? await pushExpense(makeSyncApi(supabase), item) : { kind: "offline" };
      if (outcome.kind === "synced") {
        router.push(`/trips/${tripId}`);
        router.refresh();
        return;
      }
      if (outcome.kind === "duplicate") {
        setDuplicate({ item, matches: outcome.matches });
        setLoading(false);
        return;
      }
      if (outcome.kind === "offline") {
        if (!(await enqueueExpense(item))) throw new Error("No connection, and this device could not keep the receipt. Please try again when you are online.");
        setQueuedNote("Saved on this device. It will upload automatically when you are back online.");
        resetForm();
        window.dispatchEvent(new Event(SYNC_NOW_EVENT));
        setLoading(false);
        return;
      }
      throw new Error(outcome.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // The signed-in person is read from the device, so this works without a connection too.
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) throw new Error("Not authenticated");

      const rateNum = Number(rate) || (currency === "USD" ? 1 : 0);
      const amountNum = parseFloat(amount);
      await finish({
        id: newExpenseId(),
        userId,
        tripId,
        createdAt: Date.now(),
        merchant: merchant || null,
        amount: amountNum,
        currency,
        exchangeRate: rateNum,
        amountUsd: toUsd(amountNum, rateNum),
        category,
        expenseDate,
        notes: notes || null,
        image: file,
        imageName: file?.name ?? null,
        imageHash: file ? await imageDhash(file) : null,
        duplicateOk: false,
        uploaded: false,
        status: "pending",
        error: null,
        attempts: 0,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
      <Link href={`/trips/${tripId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to trip
      </Link>
      <div className="mb-4 empty:hidden">
        <ScanChip currentKey={`trip:${tripId}`} label={`${tripName || "This trip"} \u00b7 Business`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add Expense</CardTitle>
          <CardDescription>Take a photo — we&apos;ll try to read merchant, amount, and date automatically</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Receipt Photo</label>
              {preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Receipt preview" className="w-full rounded-lg border max-h-64 object-contain bg-muted" />
                  <button type="button" onClick={clearImage} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"><X className="h-4 w-4" /></button>
                  {ocrLoading && (
                    <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                      <div className="bg-white rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Reading receipt...
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => { fileInputRef.current?.setAttribute("capture", "environment"); fileInputRef.current?.click(); }} className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5">
                    <Camera className="h-7 w-7 text-primary" />
                    <span className="text-sm font-medium text-primary">Take Photo</span>
                  </button>
                  <button type="button" onClick={() => { fileInputRef.current?.removeAttribute("capture"); fileInputRef.current?.click(); }} className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border-2 border-dashed">
                    <Upload className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm font-medium">Upload</span>
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              {ocrNote && <p className="text-xs text-muted-foreground flex items-start gap-1.5"><ScanText className="h-3.5 w-3.5 mt-0.5 shrink-0" />{ocrNote}</p>}
              <p className="text-xs text-muted-foreground">Photos are automatically resized for storage and print quality.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="merchant" className="text-sm font-medium">Merchant</label>
              <Input id="merchant" placeholder="e.g. Hotel Hilton" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 min-w-0">
                <label htmlFor="amount" className="text-sm font-medium">Amount *</label>
                <Input id="amount" type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full min-w-0" />
              </div>
              <div className="space-y-2 min-w-0">
                <label htmlFor="currency" className="text-sm font-medium">Currency</label>
                <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="rate" className="text-sm font-medium">Rate to USD {rateSource === "market" ? "(today\u2019s rate)" : ""}</label>
              <Input id="rate" type="number" step="0.000001" min="0" value={rate} onChange={(e) => { setRate(e.target.value); setRateSource("manual"); }} />
              <p className="text-xs text-muted-foreground">1 {currency} = {rate || "0"} USD{usd != null && ` \u00b7 ${formatCurrency(usd, "USD")}`}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="date" className="text-sm font-medium">Date *</label>
              <Input id="date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required className="w-full min-w-0" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <CategoryButtons options={categories} value={category} onChange={setCategory} />
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">Notes</label>
              <Input id="notes" placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <Alert>{error}</Alert>}
            {duplicate && (
              <div ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })}>
              <Alert variant="warning" className="space-y-3">
                <p className="font-medium">This looks like a receipt you already saved.</p>
                <DuplicateList matches={duplicate.matches} />
                <p>Saving it again could mean claiming the same receipt twice.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => finish({ ...duplicate.item, duplicateOk: true })}>
                    Save anyway
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => { setDuplicate(null); resetForm(); }}>
                    Discard this receipt
                  </Button>
                </div>
              </Alert>
              </div>
            )}
            {queuedNote && (
              <Alert variant="info">
                {queuedNote} <Link href="/pending" className="font-medium underline">See waiting receipts</Link>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading || ocrLoading}>{loading ? "Saving..." : "Save Expense"}</Button>
          </form>
        </CardContent>
      </Card>

      {pendingCrop && (
        <ReceiptCropper
          file={pendingCrop}
          onDone={onCropped}
          onCancel={() => setPendingCrop(null)}
        />
      )}
    </div>
  );
}
