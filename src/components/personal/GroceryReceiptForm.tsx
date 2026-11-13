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
import { extractGroceryReceipt, GLARE_NOTE, howRead, scanNote, type LateUpdate } from "@/lib/receipt-extract";
import { useCurrencies } from "@/lib/use-currencies";
import { formatCurrency, todayISO } from "@/lib/utils";
import { fetchReceiptBundle, itemsWithWaiting, overviewKey, receiptKey, type Overview, type ReceiptBundle } from "@/lib/offline-grocery";
import { browserBlobs, browserKv, loadWithCache } from "@/lib/offline-store";
import { browserOutbox, newId } from "@/lib/outbox";
import { isRowSave, makeRowApi, saveRow } from "@/lib/row-outbox";
import { currencyForStore, itemName } from "@/lib/personal/price-notes";
import { dollarCall, homeCurrency } from "@/lib/personal/currency-guess";
import { AWG_PER_USD } from "@/lib/personal/dashboard";
import { isMissingColumn } from "@/lib/columns";
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
  // "Add by hand": no photo step, for when the camera or the scan does not work
  const [manual, setManual] = useState(false);
  // "Just keeping the prices": a receipt for something you did not pay for. Its items feed the Price tracker, but it is never counted as spending.
  const [pricesOnly, setPricesOnly] = useState(false);
  const wasPricesOnly = useRef(false);
  // Currency per store: the one used last at that shop is filled in until you choose your own
  const knownReceipts = useRef<{ store: string; currency: string; purchase_date: string }[]>([]);
  const currencyChosen = useRef(false);
  // Where you live: a "$" with no code means the local currency there. Asked once, never guessed silently.
  const homeRef = useRef<string | null>(null);
  const [dollarAsk, setDollarAsk] = useState<{ suggest: string; was: string } | null>(null);
  const [currencyNote, setCurrencyNote] = useState<{ text: string; undo: string | null; tone: "good" | "info" | "warn" } | null>(null);
  const [knownLoaded, setKnownLoaded] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("manual") === "1") { setManual(true); setRows((rs) => (rs.length ? rs : [{ key: uid(), name: "", quantity: "1", unit_price: "", line_total: "", category: "Other", unit: "" }])); } }, []);

  // The store you type brings back the currency used there last time, until you pick one yourself
  useEffect(() => {
    if (receiptId || currencyChosen.current || !knownLoaded) return;
    const c = currencyForStore(knownReceipts.current, store);
    if (c && currencies.some((x) => x.code === c)) setCurrency(c);
  }, [store, knownLoaded, currencies, receiptId]);

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
        knownReceipts.current = saved?.value.receipts ?? [];
        if (latest) setCurrency(latest);
        setKnownLoaded(true);
        // Your home place picks the starting currency when there are no receipts yet (Aruba: AWG, not USD)
        void (async () => {
          const { data, error: err } = await supabase.from("profiles").select("home_country").eq("id", owner).single();
          if (isMissingColumn(err) || err) return;
          homeRef.current = (data as { home_country?: string | null } | null)?.home_country ?? null;
          const hc = homeCurrency(homeRef.current);
          if (hc && !latest && !currencyChosen.current && currencies.some((x) => x.code === hc)) setCurrency(hc);
        })().catch(() => {});
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
      setPricesOnly(head.prices_only === true);
      wasPricesOnly.current = head.prices_only === true;
      currencyChosen.current = true;
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
    const extra = [u.glare ? GLARE_NOTE : "", n > 0 ? `${n} ${n === 1 ? "price looks" : "prices look"} uncertain.` : "", ...u.issues].filter(Boolean).join(" ");
    if (extra) setNote((cur) => (cur ? `${cur} ${extra}` : extra));
  };

  const scan = async (f: File) => {
    setScanning(true);
    setNote(null);
    setCurrencyNote(null);
    setDollarAsk(null);
    const id = ++scanId.current;
    setWitness(false);
    setSecondLook(0);
    setOnlyCheck(false);
    try {
      const r = await extractGroceryReceipt(f, { currency, categories: categoryNames }, (u) => applyLate(id, u));
      if (r.store && !store) setStore(r.store);
      if (r.date) setDate(r.date);
      if (r.total != null) setTotal(r.total.toFixed(2));
      const known = (c: string) => currencies.some((x) => x.code === c);
      const homeCur = homeCurrency(homeRef.current);
      if (r.currency && r.currency !== currency && known(r.currency)) {
        setCurrency(r.currency);
        setCurrencyNote({ text: `Currency set to ${r.currency} because the receipt says ${r.currency}. Amounts were not changed.`, undo: currency, tone: "info" });
      } else if (r.currency && homeCur && r.currency !== homeCur && r.currency === currency) {
        setCurrencyNote({ text: `This receipt says ${r.currency}, so it is kept in ${r.currency === "USD" ? "dollars" : r.currency}.`, undo: null, tone: "info" });
      } else {
        const call = dollarCall({ bareDollar: r.bareDollar, home: homeRef.current, formCurrency: currency, storeCurrency: currencyForStore(knownReceipts.current, r.store || store) });
        if (call.kind === "apply" && known(call.currency)) {
          setCurrency(call.currency);
          setCurrencyNote({ text: `Currency set to ${call.currency}, the one you used at ${r.store || store} before. Amounts were not changed.`, undo: currency, tone: "good" });
        } else if (call.kind === "ask" && known(call.suggest)) setDollarAsk({ suggest: call.suggest, was: currency });
        else if (call.kind === "hint") setCurrencyNote({ text: "Only a $ is printed, so I cannot tell which dollar. Set your home place in Profile and I can tell next time.", undo: null, tone: "warn" });
      }
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
    // A line with a price but no name is kept as Item 1, 2, 3 (some receipts only say "1 ITEM")
    const clean = rows.map((r, i) => ({ ...r, name: itemName(r.name, i + 1), keep: !!r.name.trim() || money(r.unit_price) > 0 || money(r.line_total) > 0 })).filter((r) => r.keep);
    if (clean.some((r) => !(money(r.quantity) > 0))) return setError("Every item needs a quantity above zero.");

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const owner = session?.user.id;
      if (!owner) throw new Error("Sign in again to save.");

      // Only sent when it matters, so a database without the price-notes migration still saves the receipt
      const head = { store: store.trim(), purchase_date: date, total: totalNum, currency, notes: notes.trim() || null, ...(pricesOnly || wasPricesOnly.current ? { prices_only: pricesOnly } : {}) };
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
          <CardTitle>{receiptId ? "Edit grocery receipt" : manual ? "Add receipt by hand" : "Add grocery receipt"}</CardTitle>
          <CardDescription>{manual ? "No photo? Type it in. Items you list still show up in the Price tracker. With only a total, it counts toward spending but not price comparison." : "Scan the receipt, then check the items. Prices are tracked per item over time."}</CardDescription>
        </CardHeader>
        <CardContent>
          <OfflineNotice savedAt={savedAt} writable />
          <form onSubmit={submit} className="space-y-5">
            {!receiptId && manual && (
              <button type="button" onClick={() => setManual(false)} className="min-h-11 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="scan-instead">Scan a photo instead</button>
            )}
            {(!manual || receiptId) && (
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
              {currencyNote && (
                <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${currencyNote.tone === "warn" ? "bg-amber-50 text-amber-900" : currencyNote.tone === "good" ? "bg-green-50 text-green-900" : "bg-blue-50 text-blue-900"}`} data-testid="currency-note" role="status">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{currencyNote.text}</span>
                  {currencyNote.undo && <button type="button" className="min-h-11 shrink-0 px-1 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="currency-undo" onClick={() => { currencyChosen.current = true; setCurrency(currencyNote.undo as string); setCurrencyNote(null); }}>Undo</button>}
                </div>
              )}
              {!receiptId && !preview && !scanning && (
                <button type="button" onClick={() => { setManual(true); setRows((rs) => (rs.length ? rs : [blankRow()])); }} className="min-h-11 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="add-by-hand">Camera not working? Add by hand</button>
              )}
            </div>
            )}

            {!receiptId && manual && (
              <div className="space-y-2" data-testid="manual-photo">
                <label className="text-sm font-medium">Photo of the receipt <span className="font-normal text-muted-foreground">(optional)</span></label>
                <ReceiptCapture preview={preview} busy={false} maxSide={2400} onFile={(f, url) => { setFile(f); setPreview(url); }} onClear={() => { setFile(null); setPreview(null); }} />
                <p className="text-xs text-muted-foreground">Worth keeping when the receipt only says &quot;1 ITEM&quot;. It is kept, not read.</p>
              </div>
            )}

            <div className="space-y-2" data-testid="whose-purchase">
              <span className="text-sm font-medium" id="whose">Whose purchase is this?</span>
              <div className="space-y-2" role="radiogroup" aria-labelledby="whose">
                {[{ on: false, title: "I paid for it", sub: "Counts toward your personal spending." }, { on: true, title: "Just keeping the prices", sub: "I did not pay for this, for example I bought it for someone. It is not counted in my spending." }].map((o) => (
                  <button key={o.title} type="button" role="radio" aria-checked={pricesOnly === o.on} onClick={() => setPricesOnly(o.on)} className={`flex min-h-14 w-full items-start gap-3 rounded-xl border-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${pricesOnly === o.on ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-input"}`}>
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${pricesOnly === o.on ? "border-blue-600" : "border-muted-foreground"}`}>{pricesOnly === o.on && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</span>
                    <span><b className="block text-[15px]">{o.title}</b><span className="text-[13px] text-muted-foreground">{o.sub}</span></span>
                  </button>
                ))}
              </div>
              {pricesOnly && <p className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100" data-testid="prices-only-note"><Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />The items still go to the Price tracker, so you can compare shops later. Nothing is added to your spending, budget or reports.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 min-w-0 space-y-2 sm:col-span-3">
                <label htmlFor="gr-store" className="text-sm font-medium">Store</label>
                <Input id="gr-store" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Where did you shop?" maxLength={120} />
              </div>
              <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1">
                <label htmlFor="gr-date" className="text-sm font-medium">Date</label>
                <Input id="gr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor="gr-currency" className="text-sm font-medium">Currency</label>
                <Select id="gr-currency" value={currency} onChange={(e) => { currencyChosen.current = true; setCurrency(e.target.value); }}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor="gr-total" className="text-sm font-medium">Receipt total</label>
                <Input id="gr-total" type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={itemsSum ? itemsSum.toFixed(2) : "0.00"} />
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
                    <Input aria-label={`Item ${rows.findIndex((x) => x.key === r.key) + 1} name`} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} onBlur={() => r.category === "Other" && r.name && update(r.key, { category: allowed(guessGroceryCategory(r.name)) })} placeholder={`Item name (blank saves as Item ${rows.findIndex((x) => x.key === r.key) + 1})`} maxLength={160} />
                    {r.confirmed && <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800" title="Both readers agree" aria-label="Both readers agree"><Check className="h-4 w-4" /></span>}
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove item">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {r.unit && <p className="text-xs text-muted-foreground">Weighed: {money(r.quantity)} {r.unit} @ {formatCurrency(money(r.unit_price), currency)}/{r.unit}</p>}
                  <div className="grid grid-cols-3 gap-2">
                    <div><label htmlFor={`gr-${r.key}-qty`} className="text-xs text-muted-foreground">{r.unit ? `Weight (${r.unit})` : "Qty"}</label><Input id={`gr-${r.key}-qty`} type="number" step="any" min="0" value={r.quantity} onChange={(e) => setQty(r, e.target.value)} /></div>
                    <div><label htmlFor={`gr-${r.key}-price`} className="text-xs text-muted-foreground">{r.unit ? `Price per ${r.unit}` : "Price each"}</label><Input id={`gr-${r.key}-price`} type="number" step="0.01" min="0" value={r.unit_price} onChange={(e) => setUnit(r, e.target.value)} /></div>
                    <div><label htmlFor={`gr-${r.key}-line`} className="text-xs text-muted-foreground">Line total</label><Input id={`gr-${r.key}-line`} type="number" step="0.01" min="0" value={r.line_total} onChange={(e) => setLine(r, e.target.value)} /></div>
                  </div>
                  <Select aria-label={`Item ${rows.findIndex((x) => x.key === r.key) + 1} category`} className="h-11 px-2 py-1" value={r.category} onChange={(e) => update(r.key, { category: e.target.value })}>
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
              <label htmlFor="gr-notes" className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="gr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={saving || scanning} className="w-full">{saving ? "Saving..." : pricesOnly ? "Save prices" : "Save receipt"}</Button>
          </form>
        </CardContent>
      </Card>
      {dollarAsk && (() => {
        const t = money(total);
        const was = dollarAsk.was;
        const pick = (code: string, text: string) => { currencyChosen.current = true; setCurrency(code); setDollarAsk(null); setCurrencyNote({ text, undo: code === dollarAsk.suggest ? was : null, tone: "good" }); };
        return (
          <div className="app-frame fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="dollar-title" data-testid="dollar-sheet">
            <div className="w-full max-w-md rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
                <div>
                  <h2 id="dollar-title" className="text-lg font-bold leading-tight">$ found on this receipt</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">The receipt only shows a <b>$</b> sign, no “USD”. You live in <b>{(homeRef.current || "").trim()}</b>, where shops price in florins, so this is most likely <b>{dollarAsk.suggest}</b> (Afl.).</p>
                </div>
              </div>
              {t > 0 && (
                <dl className="mt-3 space-y-1 rounded-xl border bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between gap-3"><dt>Total on the receipt</dt><dd className="font-semibold">{t.toFixed(2)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Switch to {dollarAsk.suggest}</dt><dd className="font-semibold text-green-700">{formatCurrency(t, dollarAsk.suggest)} · numbers stay the same</dd></div>
                  <div className="flex justify-between gap-3"><dt>Keep {was}</dt><dd className="font-semibold">{formatCurrency(t, was)}{was === "USD" ? ` ≈ ${formatCurrency(Math.round(t * AWG_PER_USD * 100) / 100, "AWG")}` : ""}</dd></div>
                </dl>
              )}
              <Button type="button" className="mt-4 min-h-12 w-full text-base" data-testid="dollar-switch" onClick={() => pick(dollarAsk.suggest, `Currency set to ${dollarAsk.suggest} because the receipt only showed $ and you live in ${(homeRef.current || "").trim()}. Amounts were not changed.`)}>Switch to {dollarAsk.suggest}</Button>
              <Button type="button" variant="outline" className="mt-2 min-h-12 w-full" data-testid="dollar-keep" onClick={() => pick(was, `Kept as ${was}.${store.trim() ? ` ${store.trim()} will use it next time you save.` : ""}`)}>{was === "USD" ? "Keep USD, it is a dollar receipt" : `Keep ${was}`}</Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">You can change it any time in Currency.</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

