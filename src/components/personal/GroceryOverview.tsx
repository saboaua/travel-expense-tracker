"use client";

import { TileButton } from "@/components/ui/TileButton";
import { PaidFilter, NO_FILTER, applyPaidFilter } from "@/components/personal/PaidFilter";
import { CardsThisMonth } from "@/components/personal/CardsThisMonth";
import { BackLink } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, CloudOff, Plus, Tag, TrendingUp, ShoppingCart, ShoppingBag, Map as MapIcon } from "lucide-react";
import { Bars } from "@/components/personal/Bars";
import { categoryTotals, monthlyTotals, monthOf, percentChange, topItems, type ReceiptLite } from "@/lib/personal/grocery";
import { fetchMonthItems, fetchOverview, monthItemsKey, monthItemsLoaded, overviewItemsWithWaiting, overviewKey, type Overview } from "@/lib/offline-grocery";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { createClient } from "@/lib/supabase/client";
import type { ItemLite } from "@/lib/personal/grocery";
import { isTotalOnly } from "@/lib/personal/quick-targets";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOutbox } from "@/lib/use-outbox";
import { applyRows, isRowSave, waitingRowIds } from "@/lib/row-outbox";
import { OfflineNotice } from "@/components/OfflineNotice";
import { isSpending } from "@/lib/personal/price-notes";
import { formatDate, todayISO } from "@/lib/utils";
import { useReceiptTypes } from "@/lib/use-receipt-types";
import { TypeIcon } from "@/components/receipt-types/TypeIcon";
import { TypeActions } from "@/components/receipt-types/TypeActions";
import { PaidTag, StoreTile } from "@/components/personal/PaidIcon";
import type { Filter, PaidWith } from "@/lib/paid-with";

type Receipt = ReceiptLite & { store: string; prices_only?: boolean | null; paid_with?: PaidWith | null };

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
function shift(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** A white tile: the icon on a tinted square, the label under it on a phone and beside it on a computer. */
function ActionTile({ href, label, tint, testid, children }: { href: string; label: string; tint: string; testid?: string; children: React.ReactNode }) {
  return (
    <Link href={href} data-testid={testid} className="flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-2 py-3 text-center shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[4.5rem] md:flex-row md:justify-start md:gap-3 md:px-4 md:text-left">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>{children}</span>
      <span className="text-sm font-semibold leading-tight md:text-base">{label}</span>
    </Link>
  );
}

function ReceiptRow({ id, unsent, base, children }: { id: string; unsent: boolean; base: string; children: React.ReactNode }) {
  return unsent
    ? <div className="flex min-h-16 items-center rounded-xl border p-3">{children}</div>
    : <Link href={`${base}/${id}`} className="flex min-h-16 items-center rounded-xl border p-3 transition-colors hover:bg-accent">{children}</Link>;
}

export function GroceryOverview({ area = "groceries", typeId }: { area?: "groceries" | "shopping"; typeId?: string }) {
  const typed = !!typeId;
  const shopping = area === "shopping" || typed; // a receipt type page reads like Shopping: no grocery price tools
  const { types, reload: reloadTypes } = useReceiptTypes();
  const rtype = typed ? types.find((t) => t.id === typeId) ?? null : null;
  const base = typed ? `/personal/types/${typeId}` : shopping ? "/personal/shopping" : "/personal/groceries";
  const today = todayISO();
  const { data, loading, error, savedAt, userId } = useCachedQuery<Overview>((uid) => overviewKey(uid), (sb) => fetchOverview(sb, today), []);
  const { items: pending } = useOutbox(userId);
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState(monthOf(today));
  const [monthSet, setMonthSet] = useState(false);

  const allReceipts = useMemo(
    () => (applyRows(data?.receipts ?? [], pending, "grocery_receipts").map((r) => ({ ...r, total: Number(r.total) })) as (Receipt & { area?: string | null })[])
      .filter((r) => typed ? r.area === "other" && (r as { type_id?: string | null }).type_id === typeId : r.area !== "other" && (r.area === "shopping") === shopping),
    [data, pending, shopping, typed, typeId]
  );
  const inArea = useMemo(() => new Set(allReceipts.map((r) => r.id)), [allReceipts]);
  // Receipts kept only for their prices are listed, but never counted in the totals, categories or top items
  const receipts = useMemo(() => allReceipts.filter(isSpending), [allReceipts]);
  // The overview brings the lines of this month and the one before; an older month loads its lines when it is opened
  const [older, setOlder] = useState<Record<string, ItemLite[]>>({});
  const [olderFailed, setOlderFailed] = useState<string | null>(null);
  const itemsReady = !data || monthItemsLoaded(data.itemsFrom, month, Object.keys(older));
  useEffect(() => {
    if (itemsReady || !userId) return;
    let live = true;
    loadWithCache<ItemLite[]>(browserKv, monthItemsKey(userId, month), () => fetchMonthItems(createClient(), month))
      .then((r) => { if (!live) return; if (r.ok) setOlder((o) => ({ ...o, [month]: r.data })); else setOlderFailed(month); })
      .catch(() => { if (live) setOlderFailed(month); });
    return () => { live = false; };
  }, [itemsReady, userId, month]);
  const items = useMemo(() => overviewItemsWithWaiting([...(data?.items ?? []), ...Object.values(older).flat()], pending).filter((x) => inArea.has(x.receipt_id)), [data, older, pending, inArea]);
  const withItems = useMemo(() => new Set(items.map((x) => x.receipt_id)), [items]);
  const waitingReceipts = useMemo(() => waitingRowIds(pending, "grocery_receipts"), [pending]);
  // A receipt that has not reached the server has no page of its own yet
  const unsent = useMemo(() => new Set(pending.filter((i) => isRowSave(i) && i.table === "grocery_receipts" && i.isNew).map((i) => i.id)), [pending]);
  // Start on the month of the latest receipt, and on the most used currency
  const mostUsed = useMemo(() => {
    const counts = new Map<string, number>();
    receipts.forEach((x) => counts.set(x.currency, (counts.get(x.currency) || 0) + 1));
    return [...counts.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
  }, [receipts]);
  const currency = picked ?? mostUsed;
  const setCurrency = setPicked;
  useEffect(() => {
    if (monthSet || !data?.receipts.length) return;
    setMonth(monthOf(data.receipts[0].purchase_date));
    setMonthSet(true);
  }, [data, monthSet]);

  const currencies = useMemo(() => [...new Set(allReceipts.map((r) => r.currency))], [allReceipts]);
  const cur = currency || "USD";
  const totals = useMemo(() => monthlyTotals(receipts, cur), [receipts, cur]);
  const thisMonth = totals.find((t) => t.month === month);
  const prevMonth = totals.find((t) => t.month === shift(month, -1));
  const change = thisMonth && prevMonth ? percentChange(thisMonth.total, prevMonth.total) : null;

  const cats = useMemo(() => categoryTotals(receipts, items, month, cur), [receipts, items, month, cur]);
  const itemised = cats.reduce((s, c) => s + c.total, 0);
  const unitemised = thisMonth ? Math.round((thisMonth.total - itemised) * 100) / 100 : 0;
  const catRows = [...cats.map((c) => ({ label: c.category, value: c.total })), ...(itemsReady && unitemised > 0.01 ? [{ label: "Tax / not itemised", value: unitemised }] : [])];
  const top = useMemo(() => topItems(receipts, items, month, cur), [receipts, items, month, cur]);
  const monthReceipts = allReceipts.filter((r) => r.currency === cur && monthOf(r.purchase_date) === month);
  const [paidFilter, setPaidFilter] = useState<Filter>(NO_FILTER);
  const shownReceipts = applyPaidFilter(monthReceipts, paidFilter);
  const trend = totals.slice(-6).map((t) => ({ label: monthLabel(t.month).split(" ")[0], value: t.total }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-28 md:p-8">
      <BackLink href="/personal">Personal</BackLink>

      <div className="space-y-4 border-b pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">{rtype && <TypeIcon icon={rtype.icon} color={rtype.color} className="h-10 w-10" />}{!typed && (shopping ? <TileButton id="shopping" icon={ShoppingBag} tone="projects" /> : <TileButton id="groceries" icon={ShoppingCart} tone="groceries" />)}{typed ? rtype?.name ?? "Receipts" : shopping ? "Shopping" : "Groceries"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{typed ? "Your receipts of this type, month by month" : shopping ? "Clothes, electronics, home and other stores" : "Monthly spending, categories and item price changes"}</p>
          </div>
          <Link href={`${base}/new`} className="block md:shrink-0"><Button className="h-12 w-full gap-2 rounded-2xl text-base shadow-md shadow-primary/30 md:h-11 md:w-auto md:px-8"><Plus className="h-5 w-5" /> {typed ? "Scan receipt" : shopping ? "Scan shopping receipt" : "Scan receipt"}</Button></Link>
        </div>
        {rtype && <TypeActions type={rtype} all={types} onChanged={reloadTypes} />}
        {!shopping && (
          <div className="grid grid-cols-3 gap-3 md:gap-4">
          <ActionTile href="/personal/groceries/prices" label="Price tracker" tint="bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"><TrendingUp className="h-5 w-5" aria-hidden="true" /></ActionTile>
          <ActionTile href="/personal/groceries/basket" label="Best Prices" testid="best-store-link" tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"><MapIcon className="h-5 w-5" aria-hidden="true" /></ActionTile>
          <ActionTile href="/personal/groceries/price-check" label="Add a price" testid="price-check-link" tint="bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"><Tag className="h-5 w-5" aria-hidden="true" /></ActionTile>
        </div>
        )}
      </div>

      {!shopping && (
        <Link href="/personal/shopping" data-testid="to-shopping" className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted/50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"><ShoppingBag className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">Looking for clothes, electronics or home items? They are in <strong>Shopping</strong>.</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
      <OfflineNotice savedAt={savedAt} writable />
      {error && <Alert>{error}</Alert>}

      {!loading && !error && allReceipts.length === 0 && (
        <Card><CardContent className="py-16 text-center">
          <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">{typed ? "No receipts of this type yet" : shopping ? "No shopping receipts yet" : "No grocery receipts yet"}</p>
          <Link href={`${base}/new`}><Button><Plus className="mr-2 h-4 w-4" /> {typed ? "Scan your first receipt" : shopping ? "Scan your first shopping receipt" : "Scan your first receipt"}</Button></Link>
        </CardContent></Card>
      )}

      {allReceipts.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setMonth(shift(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[10rem] text-center text-sm font-semibold">{monthLabel(month)}</span>
              <Button variant="outline" size="icon" onClick={() => setMonth(shift(month, 1))} disabled={month >= monthOf(todayISO())} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            {currencies.length > 1 && (
              <Select className="w-auto min-w-fit px-2" value={cur} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </Select>
            )}
          </div>

          <Card data-testid="month-summary">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Spent this month</p>
              <p className="mt-1 text-3xl font-bold md:text-4xl"><Money amount={thisMonth?.total || 0} currency={cur} /></p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">{thisMonth?.count || 0} receipt{(thisMonth?.count || 0) !== 1 ? "s" : ""}</span>
                {thisMonth && <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">Average <Money amount={thisMonth.total / thisMonth.count} currency={cur} /> {shopping ? "per receipt" : "per shop"}</span>}
                {change != null && <span className={`rounded-full border px-2.5 py-1 font-bold ${change > 0 ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>{change > 0 ? `${change}% more` : change < 0 ? `${Math.abs(change)}% less` : "Same"} than last month</span>}
                {change == null && <span className="text-muted-foreground">No data last month</span>}
              </div>
            </CardContent>
          </Card>

          <CardsThisMonth receipts={monthReceipts} month={month} currency={cur} label={typed ? rtype?.name ?? "Receipts" : shopping ? "Shopping" : "Groceries"} withSubs={shopping} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">{shopping ? "By category" : "Spending by category"}</CardTitle></CardHeader><CardContent>{itemsReady ? <Bars rows={catRows} currency={cur} /> : <p className="text-sm text-muted-foreground" data-testid="items-loading" role="status">{olderFailed === month ? "This month's lines are not saved on this phone. Connect to see them." : "Loading this month's lines…"}</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Last months</CardTitle></CardHeader><CardContent><Bars rows={trend} currency={cur} /></CardContent></Card>
          </div>

          {itemsReady && top.length > 0 && (
            <Card><CardHeader><CardTitle className="text-base">Where the money went (top items)</CardTitle></CardHeader><CardContent><Bars rows={top.map((t) => ({ label: `${t.name} (${t.count}x)`, value: t.total }))} currency={cur} /></CardContent></Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Receipts in {monthLabel(month)}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <PaidFilter all={monthReceipts} shown={shownReceipts} filter={paidFilter} onChange={setPaidFilter} />
              {monthReceipts.length === 0 ? <p className="text-sm text-muted-foreground">No receipts this month.</p> : shownReceipts.length === 0 ? <p className="text-sm text-muted-foreground">No receipts for this choice.</p> : shownReceipts.map((r) => (
                <ReceiptRow key={r.id} id={r.id} base={base} unsent={unsent.has(r.id)}>
                  <StoreTile />
                  <div className="min-w-0 flex-1"><p className="font-medium">{r.store}</p><p className="text-xs text-muted-foreground">{formatDate(r.purchase_date)}{itemsReady && isTotalOnly(r, withItems) && <span className="ml-1.5 inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground" data-testid="total-only-tag">Total only</span>}{r.prices_only && <span className="ml-1.5 inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground" data-testid="prices-only-tag">Prices only</span>}{waitingReceipts.has(r.id) && <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600"><CloudOff className="inline h-3 w-3" aria-hidden="true" /> Waiting to sync</span>}</p></div>
                  <div className="flex shrink-0 flex-col items-end pl-3"><p className={`whitespace-nowrap font-semibold ${r.prices_only ? "text-muted-foreground" : ""}`}><Money amount={r.total} currency={cur} /></p><PaidTag paid={r.paid_with} /></div>
                </ReceiptRow>
              ))}
            </CardContent>
          </Card>

        </>
      )}
    </div>
  );
}
