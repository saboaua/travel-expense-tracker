"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Camera, Upload, X, ScanText, Loader2 } from "lucide-react";
import { runReceiptOcr } from "@/lib/ocr";
import { compressReceiptImage } from "@/lib/compress-image";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { formatCurrency } from "@/lib/utils";

const CATEGORIES = ["Meals", "Transport", "Lodging", "Fuel", "Office Supplies", "Entertainment", "Other"];
const selectClass = "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";

export default function AddExpensePage() {
  const currencies = useCurrencies();
  const params = useParams();
  const tripId = params.id as string;
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("1");
  const [rateSource, setRateSource] = useState("manual");
  const [category, setCategory] = useState("Meals");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("trips").select("currency").eq("id", tripId).single().then(({ data }) => {
      if (data?.currency) setCurrency(data.currency);
    });
  }, [supabase, tripId]);

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
      const result = await runReceiptOcr(selected);
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
      setOcrNote(filled.length > 0 ? `Auto-filled: ${filled.join(", ")}. Please verify before saving.` : "Could not detect fields automatically. Enter details manually.");
    } catch {
      setOcrNote("OCR failed. Enter details manually.");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setOcrLoading(true);
    let processed = selected;
    try {
      processed = await compressReceiptImage(selected);
    } catch {
      // fall back to original if compression fails
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let receiptPath: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `${user.id}/${tripId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("receipts").upload(fileName, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        receiptPath = fileName;
      }

      const rateNum = Number(rate) || (currency === "USD" ? 1 : 0);
      const amountNum = parseFloat(amount);
      const { error: insertError } = await supabase.from("expenses").insert({
        trip_id: tripId,
        user_id: user.id,
        merchant: merchant || null,
        amount: amountNum,
        currency,
        exchange_rate: rateNum,
        amount_usd: toUsd(amountNum, rateNum),
        category,
        expense_date: expenseDate,
        notes: notes || null,
        receipt_path: receiptPath,
      });
      if (insertError) throw insertError;

      router.push(`/trips/${tripId}`);
      router.refresh();
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
      <Card>
        <CardHeader>
          <CardTitle>Add Expense</CardTitle>
          <CardDescription>Take a photo \u2014 we'll try to read merchant, amount, and date automatically</CardDescription>
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
                    <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                      <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-2 text-sm">
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
                <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
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
              <label htmlFor="category" className="text-sm font-medium">Category</label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">Notes</label>
              <Input id="notes" placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || ocrLoading}>{loading ? "Saving..." : "Save Expense"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
