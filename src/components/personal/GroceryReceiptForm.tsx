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
import { AlertTriangle, ArrowLeft, Check, Eye, Plus, Sparkles, Trash2 } from "lucide-react";
import { ReceiptCapture } from "@/components/personal/ReceiptCapture";
import { ScanChip } from "@/components/scan/ScanChip";
import { takeQuickScan } from "@/lib/quick-scan";
import { useGroceryCategories } from "@/lib/use-categories";
import { guessGroceryCategory, normalizeItemName } from "@/lib/personal/grocery";
import { extractGroceryReceipt, howRead, scanNote, type LateUpdate } from "@/lib/receipt-extract";
import { useCurrencies } from "@/lib/use-currencies";
import { formatCurrency, todayISO } from "@/lib/utils";
import { fetchReceiptBundle, itemsWithWaiting, overviewKey, receiptKey, type Overview, type ReceiptBundle } from "@/lib/offline-grocery";
import { browserBlobs, browserKv, loadWithCache } from "@/lib/offline-store";
import { browserOutbox, newId } from "@/lib/outbox";
import { isRowSave, makeRowApi, saveRow } from "@/lib/row-outbox";
import { OfflineNotice } from "@/components/OfflineNotice";

const BACK = "/personal/groceries";

type Row = { key: string; name: string; quantity: string; unit_price: string; line_total: string; category: string; unit: string; flag?: string; alt?: number; confirmed?: boolean };
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
  const [incoming, setIncoming] = useState<File | null>(null);

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
    // The photo goes to the crop step first, then is read, the same as a photo picked on this screen
    takeQuickScan("grocery").then((f) => { if (f) setIncoming(f); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, guarded by quickHandled
  }, [categoryNames.length]);

  const blankRow = (): Row => ({ key: uid(), name: "", quantity: "1", unit_price: "", line_total: "", category: allowed("Other"), unit: "" });
  // Keys of the rows made by the latest scan, so a late suggestion lands on the right row even after edits or deletes
  const scanKeys = useRef<string[]>([]);
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [witness, setWitness] = useState(false); // the on-device reader compared its prices with the AI's
  const [secondLook, setSecondLook] = useState(0); // rows where the AI's second look read another price
  const scanId = useRef(0);

  /** Suggestions that arrive after the rows are on screen: they are attached to rows, never applied. */
  const applyLate = (id: number, u: LateUpdate) => {
    if (id !== scanId.current) return; // a newer scan replaced these rows
    setRows((rs) => rs.map((r) => {
      const i = scanKeys.current.indexOf(r.key);
      if (i < 0) return r;
      if (u.agree.includes(i) && !u.flags[i]) return { ...r, confirmed: true };
      if (!u.flags[i] && u.alts[i] == null) return r;
      return { ...r, flag: r.flag ?? u.flags[i], alt: r.alt ?? u.alts[i], confirmed: false };
    }));
    if (u.from === "ocr") setWitness(true);
    if (u.from === "ai") setSecondLook(Object.keys(u.alts).length);
    const n = Object.keys(u.flags).length;
    const extra = [n > 0 ? `${n} ${n === 1 ? "price looks" : "prices look"} uncertain.` : "", ...u.issues].filter(Boolean).join(" ");
    if (extra) setNote((cur) => (cur ? `${cur} ${extra}` : extra));
  };

  const scan = async (f: File) => {
    setScanning(true);
    setNote(null);
    const id = ++scanId.current;
    setWitness(false);
    setSecondLook(0);
    setOnlyCheck(false);
    try {
      const r = await extractGroceryReceipt(f, { currency, categories: categoryNames }, (u) => applyLate(id, u));
      if (r.store && !store) setStore(r.store);
      if (r.date) setDate(r.date);
      if (r.total != null) setTotal(r.total.toFixed(2));
      if (r.currency && r.currency !== currency && currencies.some((c) => c.code === r.currency)) setCurrency(r.currency);
      const made: Row[] = r.items.map((it) => ({
        key: uid(),
        name: it.name,
        quantity: String(it.quantity),
        unit_price: it.unit_price.toFixed(2),
        line_total: it.line_total.toFixed(2),
        category: allowed(it.category),
        unit: it.unit || "",
        flag: it.flag,
        alt: it.alt,
      }));
      scanKeys.current = made.map((m) => m.key);
      // Nothing readable: a blank row is ready so the items can be typed in straight away
      setRows(made.length > 0 ? made : [blankRow()]);
      setNote(
        r.items.length > 0
          ? `Read ${r.items.length} items (${howRead(r)}). ${scanNote(r) ? `${scanNote(r)} ` : ""}Check names and prices before saving.`
          : "No items could be read. Type them in below, or save just the total."
      );
    } catch {
      scanKeys.current = [];
      setRows((rs) => (rs.length > 0 ? rs : [blankRow()]));
      setNote("Could not read this receipt. Type the items in below, or save just the total.");
    } finally {
      setScanning(false);
    }
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const settle = (key: string) => update(key, { flag: undefined, alt: undefined, confirmed: true });
  const takeAlt = (r: Row) => {
    if (r.alt == null) return;
    const q = money(r.quantity) > 0 ? money(r.quantity) : 1;
    update(r.key, { line_total: r.alt.toFixed(2), unit_price: r2(r.alt / q).toFixed(2), flag: undefined, alt: undefined, confirmed: true });
  };

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
                incoming={incoming}
                onIncomingTaken={() => setIncoming(null)}
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

              {rows.some((r) => r.flag || r.confirmed) && (
                <div className="space-y-3 rounded-2xl border bg-card p-4" data-testid="scan-summary">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Eye className="h-5 w-5" /></span>
                    <div>
                      <p className="font-semibold">Read {rows.length} {rows.length === 1 ? "item" : "items"}</p>
                      <p className="text-xs text-muted-foreground">{witness ? "Two readers looked at the same photo" : "Checked against the receipt's own numbers"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rows.some((r) => r.confirmed) && <span className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-green-100 px-3 text-sm font-semibold text-green-800"><Check className="h-3.5 w-3.5" />{rows.filter((r) => r.confirmed).length} confirmed by both</span>}
                    {rows.some((r) => r.flag) && <span className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-amber-100 px-3 text-sm font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{rows.filter((r) => r.flag).length} to check</span>}
                  </div>
                  {rows.some((r) => r.flag) && (
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-medium">
                      <input type="checkbox" className="h-5 w-5" checked={onlyCheck} onChange={(e) => setOnlyCheck(e.target.checked)} />
                      Show only items to check
                    </label>
                  )}
                </div>
              )}
              {secondLook > 0 && (
                <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" data-testid="second-look">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <p><b>The AI took a second look.</b> The first reading did not add up to the receipt total, so it looked at the photo again. It read another price on {secondLook} {secondLook === 1 ? "row" : "rows"}: use it if it is right.</p>
                </div>
              )}

              {rows.filter((r) => !onlyCheck || r.flag).map((r) => (
                <div key={r.key} className={`space-y-2 rounded-xl border p-3 ${r.flag ? "border-amber-300 border-l-4 border-l-amber-400 bg-amber-50/40" : ""}`} data-flagged={r.flag ? "true" : undefined}>
                  {r.flag && (
                    <div className="space-y-2" data-testid="row-check">
                      <div className="flex items-center gap-2"><span className="inline-flex min-h-[26px] items-center gap-1 rounded-full bg-amber-100 px-2.5 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />Check</span></div>
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">{r.flag}.</p>
                      <div className="flex flex-wrap gap-2">
                        {r.alt != null ? (
                          <>
                            <Button type="button" variant="outline" className="min-h-[44px] flex-1" onClick={() => settle(r.key)}>Keep {formatCurrency(money(r.line_total), currency)}</Button>
                            <Button type="button" variant="outline" className="min-h-[44px] flex-1" onClick={() => takeAlt(r)}>Use {formatCurrency(r.alt, currency)}</Button>
                          </>
                        ) : (
                          <Button type="button" variant="outline" className="min-h-[44px] w-full" onClick={() => settle(r.key)}>It is right</Button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} onBlur={() => r.category === "Other" && r.name && update(r.key, { category: allowed(guessGroceryCategory(r.name)) })} placeholder="Item name" maxLength={160} />
                    {r.confirmed && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800" title="Both readers agree" aria-label="Both readers agree"><Check className="h-4 w-4" /></span>}
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

              {rows.length > 0 && (() => {
                const off = !!total && Math.abs(diff) > 0.05;
                return (
                  <div className={`flex items-start gap-3 rounded-2xl border p-3 text-sm ${off ? "border-amber-300 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-900"}`} data-testid="items-total">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${off ? "bg-amber-100" : "bg-green-100"}`}>{off ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}</span>
                    <p>
                      <b>Items add up to {formatCurrency(itemsSum, currency)}</b>
                      <br />
                      {off
                        ? `${formatCurrency(Math.abs(diff), currency)} ${diff > 0 ? "less" : "more"} than the receipt total, ${formatCurrency(money(total), currency)}. That can be tax, bags or discounts, or a missed or misread item.`
                        : total ? `Same as the receipt total, ${formatCurrency(money(total), currency)}` : "Enter the receipt total above to compare."}
                    </p>
                  </div>
                );
              })()}
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
