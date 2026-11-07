"use client";

import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { ReceiptCapture } from "@/components/personal/ReceiptCapture";
import { ScanChip } from "@/components/scan/ScanChip";
import { takeQuickScan } from "@/lib/quick-scan";
import { useGroceryCategories } from "@/lib/use-categories";
import { guessGroceryCategory, normalizeItemName } from "@/lib/personal/grocery";
import { extractGroceryReceipt } from "@/lib/receipt-extract";
import { useCurrencies } from "@/lib/use-currencies";
import { formatCurrency, todayISO } from "@/lib/utils";
import { fetchReceiptBundle, itemsWithWaiting, overviewKey, receiptKey, type Overview, type ReceiptBundle } from "@/lib/offline-grocery";
import { browserBlobs, browserKv, loadWithCache } from "@/lib/offline-store";
import { browserOutbox, newId } from "@/lib/outbox";
import { isRowSave, makeRowApi, saveRow } from "@/lib/row-outbox";
import { OfflineNotice } from "@/components/OfflineNotice";

const BACK = "/personal/groceries";

type Row = { key: string; name: string; quantity: string; unit_price: string; line_total: string; category: string; unit: string };
const uid = () => Math.random().toString(36).slice(2);
const money = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function GroceryReceiptForm({ receiptId }: { receiptId?: string }) {
  const router = useRouter();
  const currencies = useCurrencies();
  const groceryCategories = useGroceryCategories();
  const categoryNames = useMemo(() => groceryCategories.map((c) => c.name), [groceryCategories]);
  /** Map a guessed/scanned category onto the admin-managed list (falls back to Other, then the first). */
  const allowed = (c: string) => categoryNames.find((n) => n.toLowerCase() === c.toLowerCase()) ?? categoryNames.find((n) => n.toLowerCase() === "other") ?? categoryNames[0] ?? c;
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
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // New receipt: default to the currency of the latest receipt. Edit: load everything.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession(); // read from the phone, so it works offline
      const owner = session?.user.id;
      if (!owner) return;
      if (!receiptId) {
        // Default to the currency most used on the receipts already saved
        const saved = await browserKv.get<Overview>(overviewKey(owner)).catch(() => null);
        const latest = saved?.value.receipts[0]?.currency;
        if (latest) setCurrency(latest);
        return;
      }
      const res = await loadWithCache<ReceiptBundle>(browserKv, receiptKey(owner, receiptId), () => fetchReceiptBundle(supabase, receiptId));
      const waiting = (await browserOutbox.list().catch(() => [])).filter((i) => i.userId === owner);
      const w = waiting.find((i) => i.id === receiptId && isRowSave(i) && i.table === "grocery_receipts");
      if (!res.ok && !w) return setError("Could not open this receipt. Open it once while online.");
      setSavedAt(res.ok && res.fromCache ? res.savedAt : null);
      const head = { ...(res.ok ? res.data.receipt : {}), ...(w && isRowSave(w) ? { ...w.row, ...(w.path !== undefined ? { receipt_path: w.path } : {}) } : {}) } as Partial<ReceiptBundle["receipt"]>;
      setStore(head.store ?? "");
      setDate(head.purchase_date ?? todayISO());
      setCurrency(head.currency ?? "USD");
      setTotal(String(head.total ?? ""));
      setNotes(head.notes || "");
      setExistingPath(head.receipt_path ?? null);
      setRows(
        itemsWithWaiting(receiptId, res.ok ? res.data.items : [], waiting).map((it) => ({
          key: it.id,
          name: it.name,
          quantity: String(Number(it.quantity)),
          unit_price: String(it.unit_price),
          line_total: String(it.line_total),
          category: it.category,
          unit: it.unit || "",
        }))
      );
      if (head.receipt_path) {
        const kept = await browserBlobs.get(`receipts/${head.receipt_path}`).catch(() => null);
        if (kept) setPreview(URL.createObjectURL(kept));
        else if (navigator.onLine) {
          const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(head.receipt_path, 3600);
          if (signed?.signedUrl) setPreview(signed.signedUrl);
        }
      }
    })();
  }, [receiptId]);

  // Photo sent here by Scan or Upload on the dashboard: show it and read it once the categories are known
  const quickHandled = useRef(false);
  useEffect(() => {
    if (receiptId || quickHandled.current || categoryNames.length === 0) return;
    quickHandled.current = true;
    if (new URLSearchParams(window.location.search).get("quick") !== "1") return;
    takeQuickScan("grocery").then((f) => {
      if (!f) return;
      setFile(f);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
      scan(f);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, guarded by quickHandled
  }, [categoryNames.length]);

  const scan = async (f: File) => {
    setScanning(true);
    setNote(null);
    try {
      const r = await extractGroceryReceipt(f, { currency, categories: categoryNames });
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
          category: allowed(it.category),
          unit: it.unit || "",
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
      const { data: { session } } = await supabase.auth.getSession();
      const owner = session?.user.id;
      if (!owner) throw new Error("Sign in again to save.");

      const head = { store: store.trim(), purchase_date: date, total: totalNum, currency, notes: notes.trim() || null };
      // The items are made here, with their own ids, and replace the receipt's items when it is sent
      const children = {
        table: "grocery_items",
        fk: "receipt_id",
        rows: clean.map((r) => ({
          id: newId(),
          user_id: owner,
          name: r.name.trim(),
          normalized_name: normalizeItemName(r.name),
          category: r.category,
          quantity: money(r.quantity),
          unit_price: money(r.unit_price),
          line_total: money(r.line_total),
          ...(r.unit ? { unit: r.unit } : {}),
        })),
      };
      const waitingList = await browserOutbox.list().catch(() => []);
      const saved = await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: owner, table: "grocery_receipts", id: receiptId, row: head, children,
        file, fileColumn: "receipt_path", bucket: "receipts", folder: "personal/groceries", currentPath: existingPath,
        waiting: waitingList.find((i) => i.id === receiptId) ?? null,
        keep: (path, blob) => browserBlobs.put(`receipts/${path}`, blob),
        label: head.store, summary: `Grocery receipt · ${receiptId ? "changed" : "new"}`,
      });
      // A receipt that is still waiting has no page of its own yet, so go to the list, where it shows as waiting
      router.push(saved.queued && !receiptId ? BACK : `${BACK}/${saved.id}`);
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
      {!receiptId && (
        <div className="mb-4 empty:hidden">
          <ScanChip currentKey="grocery" label="Groceries \u00b7 Personal" />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{receiptId ? "Edit grocery receipt" : "Add grocery receipt"}</CardTitle>
          <CardDescription>Scan the receipt, then check the items. Prices are tracked per item over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <OfflineNotice savedAt={savedAt} writable />
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
              {note && <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">{note}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 min-w-0 space-y-2 sm:col-span-3">
                <label className="text-sm font-medium">Store</label>
                <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Where did you shop?" maxLength={120} />
              </div>
              <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1">
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="min-w-0 space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <label className="text-sm font-medium">Receipt total</label>
                <Input type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={itemsSum ? itemsSum.toFixed(2) : "0.00"} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Items ({rows.length})</label>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setRows((rs) => [...rs, { key: uid(), name: "", quantity: "1", unit_price: "", line_total: "", category: "Other", unit: "" }])}>
                  <Plus className="h-4 w-4" /> Add item
                </Button>
              </div>

              {rows.map((r) => (
                <div key={r.key} className="space-y-2 rounded-xl border p-3">
                  <div className="flex gap-2">
                    <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} onBlur={() => r.category === "Other" && r.name && update(r.key, { category: allowed(guessGroceryCategory(r.name)) })} placeholder="Item name" maxLength={160} />
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove item">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {r.unit && <p className="text-xs text-muted-foreground">Weighed: {money(r.quantity)} {r.unit} @ {formatCurrency(money(r.unit_price), currency)}/{r.unit}</p>}
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className="text-xs text-muted-foreground">{r.unit ? `Weight (${r.unit})` : "Qty"}</label><Input type="number" step="any" min="0" value={r.quantity} onChange={(e) => setQty(r, e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground">{r.unit ? `Price per ${r.unit}` : "Price each"}</label><Input type="number" step="0.01" min="0" value={r.unit_price} onChange={(e) => setUnit(r, e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground">Line total</label><Input type="number" step="0.01" min="0" value={r.line_total} onChange={(e) => setLine(r, e.target.value)} /></div>
                  </div>
                  <Select className="h-9 px-2 py-1" value={r.category} onChange={(e) => update(r.key, { category: e.target.value })}>
                    {(categoryNames.includes(r.category) ? categoryNames : [r.category, ...categoryNames]).map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              ))}

              {rows.length > 0 && (
                <p className={`rounded-lg p-2 text-xs ${total && Math.abs(diff) > 0.05 ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                  Items add up to {formatCurrency(itemsSum, currency)}
                  {total && Math.abs(diff) > 0.05 ? `. Receipt total is ${formatCurrency(money(total), currency)} (${diff > 0 ? "+" : ""}${formatCurrency(diff, currency)}). That can be tax, bags or discounts, or a missed item.` : "."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={saving || scanning} className="w-full">{saving ? "Saving..." : "Save receipt"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
