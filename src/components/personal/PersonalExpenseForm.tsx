"use client";

import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trash2 } from "lucide-react";
import { CategoryButtons } from "@/components/ui/category-buttons";
import { ReceiptCapture } from "@/components/personal/ReceiptCapture";
import { ScanChip } from "@/components/scan/ScanChip";
import { takeQuickScan } from "@/lib/quick-scan";
import { KIND_META, type PersonalKind } from "@/lib/personal/constants";
import { extractReceipt } from "@/lib/receipt-extract";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { useUsdRate } from "@/lib/personal/use-rate";
import { formatCurrency, todayISO } from "@/lib/utils";
import { PERSONAL_EXPENSE_COLS } from "@/lib/columns";


export function PersonalExpenseForm({ kind, projectId, expenseId }: { kind: PersonalKind; projectId: string; expenseId?: string }) {
  const meta = KIND_META[kind];
  const back = `${meta.path}/${projectId}`;
  const router = useRouter();
  const currencies = useCurrencies();
  const options = meta.categories.map((name) => ({ name, icon: null }));

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState(meta.categories[0]);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When editing, keep the saved exchange rate until the currency is changed on purpose
  const [rateLocked, setRateLocked] = useState(!!expenseId);
  const [projectName, setProjectName] = useState("");
  const { rate, setRate, source } = useUsdRate(currency, !rateLocked);

  // Default currency = the project's budget currency; load the expense when editing
  useEffect(() => {
    const supabase = createClient();
    supabase.from("personal_projects").select("name, currency").eq("id", projectId).single().then(({ data }) => {
      if (data?.currency && !expenseId) setCurrency(data.currency);
      if (data?.name) setProjectName(data.name);
    });
    if (!expenseId) return;
    supabase.from("personal_expenses").select(PERSONAL_EXPENSE_COLS).eq("id", expenseId).eq("project_id", projectId).single().then(async ({ data }) => {
      if (!data) return setError("Expense not found");
      setMerchant(data.merchant || "");
      setAmount(String(data.amount));
      setCurrency(data.currency);
      setRate(String(data.exchange_rate));
      setCategory(data.category);
      setDate(data.expense_date);
      setNotes(data.notes || "");
      setExistingPath(data.receipt_path);
      if (data.receipt_path) {
        const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(data.receipt_path, 3600);
        if (signed?.signedUrl) setPreview(signed.signedUrl);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads when the project or expense changes; the client and state setters are stable
  }, [projectId, expenseId]);

  const scan = async (f: File) => {
    setScanning(true);
    setNote(null);
    try {
      const r = await extractReceipt(f, { currency, categories: meta.categories });
      const filled: string[] = [];
      if (r.merchant && !merchant) { setMerchant(r.merchant); filled.push("merchant"); }
      if (r.amount != null && !amount) { setAmount(r.amount.toFixed(2)); filled.push("amount"); }
      if (r.date) { setDate(r.date); filled.push("date"); }
      if (r.currency && r.currency !== currency && currencies.some((c) => c.code === r.currency)) { setRateLocked(false); setCurrency(r.currency); filled.push(`currency (${r.currency})`); }
      const cat = r.category ? meta.categories.find((c) => c.toLowerCase() === r.category!.toLowerCase()) : null;
      if (cat) { setCategory(cat); filled.push("category"); }
      setNote(filled.length ? `Auto-filled (${r.source === "ai" ? "AI" : "basic OCR"}): ${filled.join(", ")}. Please verify before saving.` : "Could not read this receipt. Enter the details manually.");
    } catch {
      setNote("Could not read this receipt. Enter the details manually.");
    } finally {
      setScanning(false);
    }
  };

  // Photo sent here by Scan or Upload on the dashboard: show it and read it, as if it had just been picked
  const scanKey = `${kind === "home_project" ? "project" : "ptrip"}:${projectId}`;
  useEffect(() => {
    if (expenseId || new URLSearchParams(window.location.search).get("quick") !== "1") return;
    takeQuickScan(scanKey).then((f) => {
      if (!f) return;
      setFile(f);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
      scan(f);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the form opens
  }, []);

  const usd = amount && Number(rate) > 0 ? toUsd(Number(amount), Number(rate)) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountNum = parseFloat(amount);
    const rateNum = currency === "USD" ? 1 : Number(rate);
    if (!(amountNum >= 0)) return setError("Enter a valid amount.");
    if (!(rateNum > 0)) return setError("Enter an exchange rate to USD.");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let receiptPath = existingPath;
      if (file) {
        const path = `${user.id}/personal/${projectId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        if (existingPath) await supabase.storage.from("receipts").remove([existingPath]).catch(() => {});
        receiptPath = path;
      }

      const row = {
        merchant: merchant.trim() || null,
        amount: amountNum,
        currency,
        exchange_rate: rateNum,
        amount_usd: toUsd(amountNum, rateNum),
        category,
        expense_date: date,
        notes: notes.trim() || null,
        receipt_path: receiptPath,
      };
      const res = expenseId
        ? await supabase.from("personal_expenses").update(row).eq("id", expenseId)
        : await supabase.from("personal_expenses").insert({ ...row, user_id: user.id, project_id: projectId });
      if (res.error) throw res.error;
      router.push(back);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  const confirm = useConfirm();
  const remove = async () => {
    if (!expenseId || !(await confirm({ title: "Delete expense?", message: "Delete this expense?", destructive: true }))) return;
    const supabase = createClient();
    if (existingPath) await supabase.storage.from("receipts").remove([existingPath]).catch(() => {});
    const { error } = await supabase.from("personal_expenses").delete().eq("id", expenseId);
    if (error) return setError(error.message);
    router.push(back);
    router.refresh();
  };

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
      <Link href={back} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      {!expenseId && (
        <div className="mb-4 empty:hidden">
          <ScanChip currentKey={scanKey} label={`${projectName || "This project"} \u00b7 ${kind === "home_project" ? "Home project" : "Personal travel"}`} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{expenseId ? "Edit expense" : "Add expense"}</CardTitle>
          <CardDescription>Take a photo of the receipt and we will read merchant, amount and date for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Receipt photo</label>
              <ReceiptCapture
                preview={preview}
                busy={scanning}
                onFile={(f, url) => { setFile(f); setPreview(url); scan(f); }}
                onClear={() => { setFile(null); setPreview(null); setNote(null); }}
              />
              {note && <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">{note}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Merchant</label>
              <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Where did you buy it?" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Select value={currency} onChange={(e) => { setRateLocked(false); setCurrency(e.target.value); }}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </Select>
              </div>
            </div>

            {currency !== "USD" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Rate to USD <span className="font-normal text-muted-foreground">({source === "market" ? "market rate" : "enter manually"})</span></label>
                <Input type="number" step="any" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            )}
            {usd != null && currency !== "USD" && <p className="text-sm text-muted-foreground">≈ {formatCurrency(usd, "USD")}</p>}

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <CategoryButtons options={options} value={category} onChange={setCategory} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || scanning} className="flex-1">{saving ? "Saving..." : "Save expense"}</Button>
              {expenseId && <Button type="button" variant="outline" className="text-red-600" onClick={remove} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
