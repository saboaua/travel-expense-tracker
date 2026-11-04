"use client";

import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, TrendingUp, ShoppingCart } from "lucide-react";
import { Bars } from "@/components/personal/Bars";
import { categoryTotals, monthlyTotals, monthOf, percentChange, topItems, type ItemLite, type ReceiptLite } from "@/lib/personal/grocery";
import { fetchAll } from "@/lib/personal/fetch-all";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";

type Receipt = ReceiptLite & { store: string };

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
function shift(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function GroceryOverview() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [month, setMonth] = useState(monthOf(todayISO()));

  useEffect(() => {
    const supabase = createClient();
    // Last 14 months are plenty for monthly comparison and keep the page quick
    const from = `${shift(monthOf(todayISO()), -13)}-01`;
    (async () => {
      try {
        const [r, i] = await Promise.all([
          fetchAll<Receipt>((a, b) => supabase.from("grocery_receipts").select("id, store, purchase_date, total, currency").gte("purchase_date", from).order("purchase_date", { ascending: false }).range(a, b)),
          fetchAll<ItemLite & { grocery_receipts: unknown }>((a, b) =>
            supabase.from("grocery_items").select("receipt_id, category, name, normalized_name, line_total, grocery_receipts!inner(purchase_date)").gte("grocery_receipts.purchase_date", from).range(a, b)
          ),
        ]);
        const rs = r.map((x) => ({ ...x, total: Number(x.total) }));
        setReceipts(rs);
        setItems(i.map((x) => ({ ...x, line_total: Number(x.line_total) })));
        if (rs[0]) {
          const counts = new Map<string, number>();
          rs.forEach((x) => counts.set(x.currency, (counts.get(x.currency) || 0) + 1));
          setCurrency([...counts.entries()].sort((p, q) => q[1] - p[1])[0][0]);
          setMonth(monthOf(rs[0].purchase_date));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load";
        setError(/relation|schema cache/i.test(msg) ? "Personal tables not found. Run supabase/migration_personal.sql in Supabase." : msg);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currencies = useMemo(() => [...new Set(receipts.map((r) => r.currency))], [receipts]);
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
  const monthReceipts = receipts.filter((r) => r.currency === cur && monthOf(r.purchase_date) === month);
  const trend = totals.slice(-6).map((t) => ({ label: monthLabel(t.month).split(" ")[0], value: t.total }));
  const fmt = (n: number) => formatCurrency(n, cur);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-28 md:p-8">
      <Link href="/personal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Personal</Link>

      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Groceries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monthly spending, categories and item price changes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/personal/groceries/prices"><Button variant="outline" className="gap-2"><TrendingUp className="h-4 w-4" /> Price tracker</Button></Link>
          <Link href="/personal/groceries/new"><Button className="gap-2"><Plus className="h-4 w-4" /> Scan receipt</Button></Link>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {!loading && !error && receipts.length === 0 && (
        <Card><CardContent className="py-16 text-center">
          <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">No grocery receipts yet</p>
          <Link href="/personal/groceries/new"><Button><Plus className="mr-2 h-4 w-4" /> Scan your first receipt</Button></Link>
        </CardContent></Card>
      )}

      {receipts.length > 0 && (
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

          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardDescription>Spent this month</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{fmt(thisMonth?.total || 0)}</p><p className="text-xs text-muted-foreground">{thisMonth?.count || 0} receipt{(thisMonth?.count || 0) !== 1 ? "s" : ""}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>vs last month</CardDescription></CardHeader><CardContent>
              {change == null ? <p className="text-3xl font-bold">—</p> : <p className={`text-3xl font-bold ${change > 0 ? "text-red-600" : "text-emerald-600"}`}>{change > 0 ? "+" : ""}{change}%</p>}
              <p className="text-xs text-muted-foreground">{prevMonth ? `Last month ${fmt(prevMonth.total)}` : "No data last month"}</p>
            </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Average per shop</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{thisMonth ? fmt(thisMonth.total / thisMonth.count) : "—"}</p></CardContent></Card>
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
                <Link key={r.id} href={`/personal/groceries/${r.id}`} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent">
                  <div><p className="font-medium">{r.store}</p><p className="text-xs text-muted-foreground">{formatDate(r.purchase_date)}</p></div>
                  <p className="font-semibold">{fmt(r.total)}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
