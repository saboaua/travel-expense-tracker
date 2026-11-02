"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { ReceiptCapture } from "@/components/personal/ReceiptCapture";
import { GROCERY_CATEGORIES } from "@/lib/personal/constants";
import { guessGroceryCategory, normalizeItemName } from "@/lib/personal/grocery";
import { extractGroceryReceipt } from "@/lib/receipt-extract";
import { useCurrencies } from "@/lib/use-currencies";
import { formatCurrency, todayISO } from "@/lib/utils";

const selectClass = "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm";
const BACK = "/personal/groceries";

type Row = { key: string; name: string; quantity: string; unit_price: string; line_total: string; category: string };
const uid = () => Math.random().toString(36).slice(2);
const money = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function GroceryReceiptForm({ receiptId }: { receiptId?: string }) {
  const router = useRouter();
  const currencies = useCurrencies();
  const [store, setStore] = useState("");
  const [date, setDate] = useState(todayISO());
  const [currency, setCurrency] = useState("USD");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New receipt: default to the currency of the latest receipt. Edit: load everything.
  useEffect(() => {
    const supabase = createClient();
    if (!receiptId) {
      supabase.from("grocery_receipts").select("currency").order("purchase_date", { ascending: false }).limit(1).then(({ data }) => {
        if (data?.[0]?.currency) setCurrency(data[0].currency);
      });
      return;
    }
    (async () => {
      const [r, i] = await Promise.all([
        supabase.from("grocery_receipts").select("*").eq("id", receiptId).single(),
        supabase.from("grocery_items").select("*").eq("receipt_id", receiptId).order("created_at"),
      ]);
      if (!r.data) return setError("Receipt not found");
      setStore(r.data.store);
      setDate(r.data.purchase_date);
      setCurrency(r.data.currency);
      setTotal(String(r.data.total));
      setNotes(r.data.notes || "");
      setExistingPath(r.data.receipt_path);
      setRows(
        (i.data || []).map((it) => ({
          key: it.id,
          name: it.name,
          quantity: String(Number(it.quantity)),
          unit_price: String(it.unit_price),
          line_total: String(it.line_total),
          category: it.category,
        }))
      );
      if (r.data.receipt_path) {
        const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(r.data.receipt_path, 3600);
        if (signed?.signedUrl) setPreview(signed.signedUrl);
      }
    })();
  }, [receiptId]);

  const scan = async (f: File) => {
    setScanning(true);
    setNote(null);
    try {
      const r = await extractGroceryReceipt(f, { currency });
      if (r.store && !store) setStore(r.store);
      if (r.date) setDate(r.date);
      if (r.total != null) setTotal(r.total.toFixed(2));
      if (r.currency && r.currency !== currency && currencies.some((c) => c.code === r.currency)) setCurrency(r.currency);
      setRows(
        r.items.map((it) => ({
          key: uid(),
          name: it.name,
          quantity: String(it.quantity),
          unit_price: it.unit_price.toFixed(2),
          line_total: it.line_total.toFixed(2),
          category: it.category,
        }))
      );
      setNote(
        r.items.length > 0
          ? `Read ${r.items.length} items (${r.source === "ai" ? "AI" : "basic OCR"}). Check names and prices before saving.`
          : "No items could be read. Add them below, or save just the total."
      );
    } catch {
      setNote("Could not read this receipt. Enter the details manually.");
    } finally {
      setScanning(false);
    }
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Keep qty x unit = line total in sync while editing
  const setQty = (r: Row, v: string) => update(r.key, { quantity: v, line_total: String(r2(money(v) * money(r.unit_price))) });
  const setUnit = (r: Row, v: string) => update(r.key, { unit_price: v, line_total: String(r2(money(r.quantity) * money(v))) });
  const setLine = (r: Row, v: string) => update(r.key, { line_total: v, unit_price: money(r.quantity) > 0 ? String(r2(money(v) / money(r.quantity))) : r.unit_price });

  const itemsSum = useMemo(() => r2(rows.reduce((s, r) => s + money(r.line_total), 0)), [rows]);
  const diff = r2(money(total) - itemsSum);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!store.trim()) return setError("Enter the store name.");
    const totalNum = total ? money(total) : itemsSum;
    if (!(totalNum >= 0)) return setError("Enter a valid total.");
    const clean = rows.filter((r) => r.name.trim());
    if (clean.some((r) => !(money(r.quantity) > 0))) return setError("Every item needs a quantity above zero.");

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let receiptPath = existingPath;
      if (file) {
        const path = `${user.id}/personal/groceries/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        receiptPath = path;
      }

      const head = { store: store.trim(), purchase_date: date, total: totalNum, currency, notes: notes.trim() || null, receipt_path: receiptPath };
      let id = receiptId;
      let oldItemIds: string[] = [];

      if (receiptId) {
        const { data: old } = await supabase.from("grocery_items").select("id").eq("receipt_id", receiptId);
        oldItemIds = (old || []).map((o) => o.id);
        const { error } = await supabase.from("grocery_receipts").update(head).eq("id", receiptId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("grocery_receipts").insert({ ...head, user_id: user.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }

      if (clean.length > 0) {
        const { error } = await supabase.from("grocery_items").insert(
          clean.map((r) => ({
            receipt_id: id,
            user_id: user.id,
            name: r.name.trim(),
            normalized_name: normalizeItemName(r.name),
            category: r.category,
            quantity: money(r.quantity),
            unit_price: money(r.unit_price),
            line_total: money(r.line_total),
          }))
        );
        if (error) throw error;
      }
      // Remove the previous items only after the new ones were stored
      if (oldItemIds.length) await supabase.from("grocery_items").delete().in("id", oldItemIds);
      if (file && existingPath) await supabase.storage.from("receipts").remove([existingPath]).catch(() => {});

      router.push(`${BACK}/${id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8 pb-28">
      <Link href={receiptId ? `${BACK}/${receiptId}` : BACK} className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{receiptId ? "Edit grocery receipt" : "Add grocery receipt"}</CardTitle>
          <CardDescription>Scan the receipt, then check the items. Prices are tracked per item over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Receipt photo</label>
              <ReceiptCapture
                preview={preview}
                busy={scanning}
                busyLabel="Reading items..."
                maxSide={2400}
                onFile={(f, url) => { setFile(f); setPreview(url); scan(f); }}
                onClear={() => { setFile(null); setPreview(null); setNote(null); }}
              />
              {note && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{note}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Store</label>
                <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Where did you shop?" maxLength={120} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Receipt total</label>
                <Input type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={itemsSum ? itemsSum.toFixed(2) : "0.00"} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Items ({rows.length})</label>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setRows((rs) => [...rs, { key: uid(), name: "", quantity: "1", unit_price: "", line_total: "", category: "Other" }])}>
                  <Plus className="h-4 w-4" /> Add item
                </Button>
              </div>

              {rows.map((r) => (
                <div key={r.key} className="space-y-2 rounded-lg border p-3">
                  <div className="flex gap-2">
                    <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} onBlur={() => r.category === "Other" && r.name && update(r.key, { category: guessGroceryCategory(r.name) })} placeholder="Item name" maxLength={160} />
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove item">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className="text-xs text-muted-foreground">Qty</label><Input type="number" step="any" min="0" value={r.quantity} onChange={(e) => setQty(r, e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground">Price each</label><Input type="number" step="0.01" min="0" value={r.unit_price} onChange={(e) => setUnit(r, e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground">Line total</label><Input type="number" step="0.01" min="0" value={r.line_total} onChange={(e) => setLine(r, e.target.value)} /></div>
                  </div>
                  <select className={selectClass} value={r.category} onChange={(e) => update(r.key, { category: e.target.value })}>
                    {GROCERY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}

              {rows.length > 0 && (
                <p className={`rounded-md p-2 text-xs ${total && Math.abs(diff) > 0.05 ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                  Items add up to {formatCurrency(itemsSum, currency)}
                  {total && Math.abs(diff) > 0.05 ? `. Receipt total is ${formatCurrency(money(total), currency)} (${diff > 0 ? "+" : ""}${formatCurrency(diff, currency)}). That can be tax, bags or discounts, or a missed item.` : "."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={saving || scanning} className="w-full">{saving ? "Saving..." : "Save receipt"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
