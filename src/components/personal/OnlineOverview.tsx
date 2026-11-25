"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BackLink } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { PAGE_WIDTH } from "@/components/layout/PageShell";
import { arrivesText, mainCurrency, monthBySite, onItsWay, siteColor, siteLabel, type OnlineOrder } from "@/lib/personal/online-orders";
import { formatCurrency } from "@/lib/utils";

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const shift = (m: string, by: number) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + by, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthTitle = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** What was bought online: this month by site, and what is still on its way. Part of Shopping, so nothing is counted twice. */
export function OnlineOverview() {
  const [rows, setRows] = useState<OnlineOrder[] | null>(null);
  const [setup, setSetup] = useState(false);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  useEffect(() => {
    (async () => {
      const { data, error } = await createClient().from("grocery_receipts").select("id, store, purchase_date, total, currency, online_site, arrives_on").not("online_site", "is", null).order("purchase_date", { ascending: false }).limit(1000);
      if (error) { setSetup(true); setRows([]); return; }
      setRows((data ?? []) as unknown as OnlineOrder[]);
    })();
  }, []);
  const today = todayISO();
  const list = rows ?? [];
  const currency = useMemo(() => mainCurrency(list, month) ?? mainCurrency(list, today.slice(0, 7)) ?? "USD", [list, month, today]);
  const sum = useMemo(() => monthBySite(list, month, currency), [list, month, currency]);
  const way = useMemo(() => onItsWay(list, today), [list, today]);
  const top = Math.max(1, ...sum.sites.map((s) => Math.abs(s.total)));
  const nav = "flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <div className={`${PAGE_WIDTH.formColumn} space-y-4 p-4 pb-28 md:p-8`}>
      <BackLink href="/personal/shopping">Shopping</BackLink>
      <h1 className="text-2xl font-bold">Online shopping</h1>
      {setup && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">Online orders need one database step: run migration_online_orders.sql in Supabase.</p>}
      <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="online-total">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button type="button" className={nav} aria-label="Previous month" onClick={() => setMonth(shift(month, -1))}><ChevronLeft className="h-5 w-5" /></button>
            <span className="min-w-36 text-center font-bold" data-testid="online-month">{monthTitle(month)}</span>
            <button type="button" className={nav} aria-label="Next month" onClick={() => setMonth(shift(month, 1))}><ChevronRight className="h-5 w-5" /></button>
          </div>
          <Link href="/personal/shopping" className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-extrabold text-fuchsia-900">Shopping</Link>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Spent online</div>
          <div className="text-4xl font-extrabold"><Money amount={sum.total} currency={currency} /></div>
          <div className="mt-1 text-sm text-muted-foreground">{sum.orders} {sum.orders === 1 ? "order" : "orders"}</div>
        </div>
        <p className="text-[13px] text-muted-foreground">This is part of your Shopping budget, so nothing is counted twice.</p>
      </section>
      {sum.sites.length > 0 && (
        <section className="rounded-2xl border bg-card p-4" data-testid="online-sites">
          <h2 className="font-bold">By site</h2>
          {sum.sites.map((s) => (
            <div key={s.site} className="border-t py-3 first:mt-2" data-testid={`online-site-${s.site}`}>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: siteColor(s.site) }} aria-hidden="true" />{siteLabel(s.site)}</span><b>{formatCurrency(s.total, currency)}</b></div>
              <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${Math.max(3, Math.round((Math.abs(s.total) / top) * 100))}%`, background: siteColor(s.site) }} /></div>
              <div className="mt-1.5 text-xs text-muted-foreground">{s.orders} {s.orders === 1 ? "order" : "orders"}</div>
            </div>
          ))}
        </section>
      )}
      {rows && sum.sites.length === 0 && !setup && <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground" data-testid="online-empty">No online orders in {monthTitle(month)}. When you add a receipt, choose Online under Where did you buy it.</p>}
      {way.length > 0 && (
        <section className="rounded-2xl border bg-card p-4" data-testid="online-way">
          <h2 className="font-bold">On its way</h2>
          {way.map((o) => (
            <Link key={o.id} href={`/personal/shopping/${o.id}`} className="flex min-h-14 items-center gap-3 border-t py-2 first:mt-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted"><Package className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{o.store}</span><span className="block text-xs text-muted-foreground">{siteLabel(o.online_site)} · {formatCurrency(Number(o.total), o.currency)}</span></span>
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-extrabold text-indigo-900">{arrivesText(o.days)}</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
