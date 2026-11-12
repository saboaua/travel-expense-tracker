"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ReceiptCapture } from "@/components/personal/ReceiptCapture";
import { PRICE_CHECK_COLS } from "@/lib/columns";
import { useCurrencies } from "@/lib/use-currencies";
import { parseAmount, QUICK_DEFAULT_CURRENCY } from "@/lib/personal/quick-spend";
import { knownStores, recentProducts, type PriceCheck } from "@/lib/personal/price-notes";
import { addDaysISO, formatCurrency, todayISO } from "@/lib/utils";
import { browserOutbox } from "@/lib/outbox";
import { browserBlobs } from "@/lib/offline-store";
import { applyRows, makeRowApi, saveRow } from "@/lib/row-outbox";

const chip = (on: boolean) =>
  `inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "bg-card hover:bg-accent"}`;

/** Save a price you saw in a shop. It never counts as spending; the Price tracker compares it with your receipts. */
export function PriceCheckForm() {
  const currencies = useCurrencies();
  const [product, setProduct] = useState("");
  const [store, setStore] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(QUICK_DEFAULT_CURRENCY);
  const [size, setSize] = useState("");
  const [date, setDate] = useState(todayISO());
  const [pickDate, setPickDate] = useState(false);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PriceCheck[]>([]);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [lastProduct, setLastProduct] = useState<string | null>(null);
  const [storeNames, setStoreNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase.from("price_checks").select(PRICE_CHECK_COLS).order("seen_on", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    const items = await browserOutbox.list().catch(() => []);
    if (e && /relation|schema cache|does not exist/i.test(e.message)) setError("Run supabase/migration_price_notes.sql in Supabase first.");
    setRows(applyRows(((data ?? []) as unknown as PriceCheck[]), items, "price_checks"));
    const { data: rec } = await supabase.from("grocery_receipts").select("store").order("purchase_date", { ascending: false }).limit(200);
    setStoreNames(((rec ?? []) as { store: string }[]).map((r) => r.store));
  }, []);
  useEffect(() => { load(); }, [load]);

  const products = useMemo(() => recentProducts(rows), [rows]);
  const stores = useMemo(() => knownStores([...rows.map((r) => r.store), ...storeNames]), [rows, storeNames]);
  const choices = currencies.some((c) => c.code === "USD") && currencies.some((c) => c.code === QUICK_DEFAULT_CURRENCY) ? [QUICK_DEFAULT_CURRENCY, "USD"] : [];
  const others = currencies.filter((c) => !choices.includes(c.code));
  // What you have seen so far for the product being typed (latest price at each store)
  const soFar = useMemo(() => {
    const key = (lastProduct ?? product).trim().toLowerCase();
    if (!key) return [];
    const latest = new Map<string, PriceCheck>();
    for (const r of rows) if (r.product.trim().toLowerCase() === key && !latest.has(r.store.toLowerCase())) latest.set(r.store.toLowerCase(), r);
    return [...latest.values()].sort((a, b) => Number(a.price) - Number(b.price));
  }, [rows, product, lastProduct]);

  const save = async (another: boolean) => {
    setError(null); setSavedMsg(null);
    if (!product.trim()) return setError("What product is it?");
    if (!store.trim()) return setError("Which store?");
    const amt = parseAmount(price);
    if (amt == null) return setError("Enter the price you saw.");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      const row = { product: product.trim(), store: store.trim(), price: amt, currency, size: size.trim() || null, seen_on: date, notes: notes.trim() || null };
      const r = await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: uid, table: "price_checks", row,
        file, fileColumn: file ? "photo_path" : undefined, bucket: file ? "receipts" : undefined, folder: "personal/price-checks",
        keep: (path, blob) => browserBlobs.put(`receipts/${path}`, blob),
        label: `${row.product} at ${row.store}`, summary: "Price check · new",
      });
      setSavedMsg(`${r.queued ? "Saved on this phone, will send when you are online" : "Saved"}: ${row.product} at ${row.store}, ${formatCurrency(amt, currency)}`);
      setLastProduct(row.product);
      setPrice(""); setNotes(""); setFile(null); setPreview(null); setDate(todayISO()); setPickDate(false);
      if (another) setStore(""); else { setProduct(""); setStore(""); setSize(""); }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const yesterday = addDaysISO(todayISO(), -1);
  const label = "mb-1.5 block text-[13px] font-bold text-foreground/80";
  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8">
      <Link href="/personal/groceries" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Groceries</Link>
      <h1 className="text-xl font-bold">Price check</h1>
      <p className="mt-1 text-sm text-muted-foreground">Saw a price in a shop? Save it here to compare later. It never counts as spending.</p>

      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="mt-4 space-y-4 rounded-2xl border bg-card p-4" data-testid="price-check-form">
        <div>
          <label htmlFor="pc-product" className={label}>Product</label>
          <Input id="pc-product" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="C4 Energy" maxLength={160} className="h-12 text-base" />
          {products.length > 0 && (
            <div className="mt-2" data-testid="check-products">
              <div className="flex flex-wrap gap-2">
                {products.map((n) => <button key={n} type="button" onClick={() => setProduct(n)} className="inline-flex min-h-9 items-center rounded-full bg-blue-50 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-blue-950 dark:text-blue-200">{n}</button>)}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Products you checked before.</p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="pc-store" className={label}>Store</label>
          <Input id="pc-store" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Which store?" maxLength={120} className="h-12 text-base" />
          {stores.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" data-testid="check-stores">
              {stores.map((n) => <button key={n} type="button" aria-pressed={store.trim().toLowerCase() === n.toLowerCase()} onClick={() => setStore(n)} className={chip(store.trim().toLowerCase() === n.toLowerCase())}>{n}</button>)}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="pc-price" className={label}>Price</label>
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3">
            <input id="pc-price" inputMode="decimal" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="h-14 min-w-0 flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none" />
            {choices.length > 0 ? (
              <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Currency">
                {choices.map((c) => <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)} className={`min-h-10 px-3 text-sm font-semibold ${currency === c ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""}`}>{c}</button>)}
              </div>
            ) : null}
          </div>
          {(others.length > 0 || choices.length === 0) && (
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-2" aria-label="Currency">
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </Select>
          )}
        </div>

        <div>
          <label htmlFor="pc-size" className={label}>Size <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input id="pc-size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="30 servings, 2 lb, 500 ml" maxLength={60} />
          <p className="mt-1.5 text-xs text-muted-foreground">The size is added to the name, so the Price tracker pairs the same size at different stores.</p>
        </div>

        <div>
          <span className={label} id="pc-date">Date</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pc-date">
            <button type="button" aria-pressed={!pickDate && date === todayISO()} onClick={() => { setPickDate(false); setDate(todayISO()); }} className={chip(!pickDate && date === todayISO())}>Today</button>
            <button type="button" aria-pressed={!pickDate && date === yesterday} onClick={() => { setPickDate(false); setDate(yesterday); }} className={chip(!pickDate && date === yesterday)}>Yesterday</button>
            <button type="button" aria-pressed={pickDate} onClick={() => setPickDate(true)} className={chip(pickDate)}>Pick a date</button>
          </div>
          {pickDate && <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="mt-2 h-12" aria-label="Date" />}
        </div>

        <div>
          <span className={label}>Photo of the shelf tag <span className="font-normal text-muted-foreground">(optional)</span></span>
          <ReceiptCapture preview={preview} busy={false} maxSide={1600} onFile={(f, url) => { setFile(f); setPreview(url); }} onClear={() => { setFile(null); setPreview(null); }} />
        </div>

        <div>
          <label htmlFor="pc-note" className={label}>Note <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input id="pc-note" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Promo until Sunday" maxLength={500} />
        </div>

        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={saving} className="h-12 w-full text-base" data-testid="price-check-save">{saving ? "Saving..." : "Save price"}</Button>
        <Button type="button" variant="outline" disabled={saving} onClick={() => save(true)} className="h-12 w-full text-base" data-testid="price-check-another">Save and add another store</Button>
      </form>

      {savedMsg && (
        <div className="mt-4 rounded-2xl border bg-card p-4" data-testid="price-check-done">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" aria-hidden="true" />{savedMsg}</p>
          {soFar.length > 0 && (
            <>
              <p className="mt-2 text-[13px] text-muted-foreground">Seen so far, cheapest first:</p>
              <ul className="mt-1 divide-y" data-testid="seen-so-far">
                {soFar.map((r) => <li key={r.id} className="flex min-h-9 items-center justify-between text-sm"><span>{r.store}</span><b className="tabular-nums">{formatCurrency(Number(r.price), r.currency)}</b></li>)}
              </ul>
            </>
          )}
          <Link href="/personal/groceries/prices" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Compare in the Price tracker</Link>
        </div>
      )}
    </div>
  );
}
