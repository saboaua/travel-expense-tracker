"use client";

import { BackLink } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, CloudOff, Plus, Tag, TrendingUp, ShoppingCart } from "lucide-react";
import { Bars } from "@/components/personal/Bars";
import { categoryTotals, monthlyTotals, monthOf, percentChange, topItems, type ReceiptLite } from "@/lib/personal/grocery";
import { fetchOverview, overviewItemsWithWaiting, overviewKey, type Overview } from "@/lib/offline-grocery";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOutbox } from "@/lib/use-outbox";
import { applyRows, isRowSave, waitingRowIds } from "@/lib/row-outbox";
import { OfflineNotice } from "@/components/OfflineNotice";
import { isSpending } from "@/lib/personal/price-notes";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";

type Receipt = ReceiptLite & { store: string; prices_only?: boolean | null };

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
function shift(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** A small map picture with the words Best store, so it is clear this opens a map. */
function BestStoreTile() {
  return (
    <Link href="/personal/groceries/basket" data-testid="best-store-link" className="col-span-2 block overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <svg viewBox="0 0 358 120" preserveAspectRatio="xMidYMid slice" className="block h-28 w-full" aria-hidden="true">
        <rect width="358" height="120" fill="#e6efe3" />
        <path d="M0 85 Q90 60 170 80 T358 55 L358 120 L0 120Z" fill="#cfe3f2" />
        <path d="M20 20 L340 40 M60 110 L120 0 M230 120 L270 0" stroke="#fff" strokeWidth="6" fill="none" />
        <path d="M0 60 L358 90" stroke="#f6e7b4" strokeWidth="5" fill="none" />
        <circle cx="180" cy="62" r="46" fill="#1d4ed81a" stroke="#1d4ed8" strokeDasharray="5 4" />
        <circle cx="150" cy="48" r="13" fill="#059669" stroke="#fff" strokeWidth="2" /><text x="150" y="53" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">1</text>
        <circle cx="215" cy="74" r="13" fill="#1d4ed8" stroke="#fff" strokeWidth="2" /><text x="215" y="79" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">2</text>
        <circle cx="198" cy="40" r="5" fill="#94a3b8" stroke="#fff" strokeWidth="2" />
        <circle cx="168" cy="82" r="7" fill="#2563eb" stroke="#fff" strokeWidth="3" />
      </svg>
      <span className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1"><span className="block text-base font-bold">Best store</span><span className="block text-sm text-muted-foreground">Where your list costs least, near you</span></span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary">Open map <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
      </span>
    </Link>
  );
}

function ReceiptRow({ id, unsent, children }: { id: string; unsent: boolean; children: React.ReactNode }) {
  return unsent
    ? <div className="flex items-center justify-between rounded-xl border p-3">{children}</div>
    : <Link href={`/personal/groceries/${id}`} className="flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-accent">{children}</Link>;
}

export function GroceryOverview() {
  const today = todayISO();
  const { data, loading, error, savedAt, userId } = useCachedQuery<Overview>((uid) => overviewKey(uid), (sb) => fetchOverview(sb, today), []);
  const { items: pending } = useOutbox(userId);
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState(monthOf(today));
  const [monthSet, setMonthSet] = useState(false);

  const allReceipts = useMemo(
    () => applyRows(data?.receipts ?? [], pending, "grocery_receipts").map((r) => ({ ...r, total: Number(r.total) })) as Receipt[],
    [data, pending]
  );
  // Receipts kept only for their prices are listed, but never counted in the totals, categories or top items
  const receipts = useMemo(() => allReceipts.filter(isSpending), [allReceipts]);
  const items = useMemo(() => overviewItemsWithWaiting(data?.items ?? [], pending), [data, pending]);
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
  const catRows = [...cats.map((c) => ({ label: c.category, value: c.total })), ...(unitemised > 0.01 ? [{ label: "Tax / not itemised", value: unitemised }] : [])];
  const top = useMemo(() => topItems(receipts, items, month, cur), [receipts, items, month, cur]);
  const monthReceipts = allReceipts.filter((r) => r.currency === cur && monthOf(r.purchase_date) === month);
  const trend = totals.slice(-6).map((t) => ({ label: monthLabel(t.month).split(" ")[0], value: t.total }));
  const fmt = (n: number) => formatCurrency(n, cur);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-28 md:p-8">
      <BackLink href="/personal">Personal</BackLink>

      <div className="space-y-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Groceries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monthly spending, categories and price changes</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/personal/groceries/new" className="col-span-2"><Button className="h-12 w-full gap-2 text-base"><Plus className="h-5 w-5" /> Scan receipt</Button></Link>
          <BestStoreTile />
          <Link href="/personal/groceries/prices"><Button variant="outline" className="h-12 w-full gap-2"><TrendingUp className="h-4 w-4" /> Price tracker</Button></Link>
          <Link href="/personal/groceries/price-check"><Button variant="outline" className="h-12 w-full gap-2" data-testid="price-check-link"><Tag className="h-4 w-4" /> Add a price</Button></Link>
        </div>
      </div>

      <OfflineNotice savedAt={savedAt} writable />
      {error && <Alert>{error}</Alert>}

      {!loading && !error && allReceipts.length === 0 && (
        <Card><CardContent className="py-16 text-center">
          <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">No grocery receipts yet</p>
          <Link href="/personal/groceries/new"><Button><Plus className="mr-2 h-4 w-4" /> Scan your first receipt</Button></Link>
        </CardContent></Card>
      )}

      {allReceipts.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMonth(shift(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[10rem] text-center text-sm font-semibold">{monthLabel(month)}</span>
              <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMonth(shift(month, 1))} disabled={month >= monthOf(todayISO())} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            {currencies.length > 1 && (
              <Select className="w-auto min-w-fit px-2" value={cur} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <Card><CardHeader className="pb-2"><CardDescription>Spent this month</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold sm:text-3xl">{fmt(thisMonth?.total || 0)}</p><p className="text-xs text-muted-foreground">{thisMonth?.count || 0} receipt{(thisMonth?.count || 0) !== 1 ? "s" : ""}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>vs last month</CardDescription></CardHeader><CardContent>
              {change == null ? <p className="text-2xl font-bold sm:text-3xl">—</p> : <p className={`text-2xl font-bold sm:text-3xl ${change > 0 ? "text-red-600" : "text-emerald-600"}`}>{change > 0 ? "+" : ""}{change}%</p>}
              <p className="text-xs text-muted-foreground">{prevMonth ? `Last month ${fmt(prevMonth.total)}` : "No data last month"}</p>
            </CardContent></Card>
            <Card className="col-span-2 sm:col-span-1"><CardHeader className="pb-2"><CardDescription>Average per shop</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold sm:text-3xl">{thisMonth ? fmt(thisMonth.total / thisMonth.count) : "—"}</p></CardContent></Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Spending by category</CardTitle></CardHeader><CardContent><Bars rows={catRows} format={fmt} /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Last months</CardTitle></CardHeader><CardContent><Bars rows={trend} format={fmt} /></CardContent></Card>
          </div>

          {top.length > 0 && (
            <Card><CardHeader><CardTitle className="text-base">Where the money went (top items)</CardTitle></CardHeader><CardContent><Bars rows={top.map((t) => ({ label: `${t.name} (${t.count}x)`, value: t.total }))} format={fmt} /></CardContent></Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Receipts in {monthLabel(month)}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {monthReceipts.length === 0 ? <p className="text-sm text-muted-foreground">No receipts this month.</p> : monthReceipts.map((r) => (
                <ReceiptRow key={r.id} id={r.id} unsent={unsent.has(r.id)}>
                  <div className="min-w-0"><p className="font-medium">{r.store}</p><p className="text-xs text-muted-foreground">{formatDate(r.purchase_date)}{r.prices_only && <span className="ml-1.5 inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground" data-testid="prices-only-tag">Prices only</span>}{waitingReceipts.has(r.id) && <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600"><CloudOff className="inline h-3 w-3" aria-hidden="true" /> Waiting to sync</span>}</p></div>
                  <p className={`shrink-0 whitespace-nowrap pl-3 font-semibold ${r.prices_only ? "text-muted-foreground" : ""}`}>{fmt(r.total)}</p>
                </ReceiptRow>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
