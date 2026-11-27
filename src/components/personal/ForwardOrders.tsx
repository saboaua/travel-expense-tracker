"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Copy, Crown, Lock, Plus, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useBrand } from "@/lib/use-brand";
import { BackLink } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PAGE_WIDTH } from "@/components/layout/PageShell";
import { onlinePaid, siteColor, siteLabel } from "@/lib/personal/online-orders";
import { PAID_WITH, type PaidWith } from "@/lib/paid-with";
import { useLimits } from "@/lib/use-limits";
import { featureLocked } from "@/lib/limits";
import { todayISO } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/utils";

type Recent = { id: string; store: string; purchase_date: string; total: number; currency: string; online_site: string | null; needs_check: boolean | null };

/** Forward an order email from Amazon, AliExpress or eBay to your private address and it appears as an online receipt to check. */
export function ForwardOrders() {
  const { appName } = useBrand();
  const [address, setAddress] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "off" | "error">("loading");
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [paid, setPaid] = useState<PaidWith>("credit");
  const lim = useLimits();
  const locked = !!lim && featureLocked(lim.limits, lim.who, "orders_email", todayISO());

  const load = useCallback(async () => {
    const a = await fetch("/api/email/address").then((r) => r.json()).catch(() => ({ setup: "error" }));
    if (a.address) { setAddress(a.address); setState("ready"); } else setState(a.configured === false || a.setup ? "error" : "off");
    const { data } = await createClient().from("grocery_receipts").select("id, store, purchase_date, total, currency, online_site, needs_check").eq("source", "email").order("created_at", { ascending: false }).limit(8);
    setRecent((data ?? []) as unknown as Recent[]);
    const pr = await createClient().from("online_order_prefs").select("paid_with").maybeSingle();
    setPaid(onlinePaid((pr.data as { paid_with?: string } | null)?.paid_with));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const choosePaid = async (p: PaidWith) => {
    setPaid(p);
    const sb = createClient();
    const { data: u } = await sb.auth.getUser();
    if (u.user) await sb.from("online_order_prefs").upsert({ user_id: u.user.id, paid_with: p, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  };
  const copy = async () => { if (!address) return; try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the address is selectable */ } };
  const step = (n: number, t: string) => <div className="flex items-start gap-3 text-sm leading-snug"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-extrabold text-indigo-900">{n}</span><span>{t}</span></div>;
  return (
    <div className={`${PAGE_WIDTH.formColumn} space-y-4 p-4 pb-28 md:p-8`}>
      <BackLink href="/personal/shopping/online">Online shopping</BackLink>
      <h1 className="text-2xl font-bold">Online orders</h1>
      {locked && (
        <div className="space-y-3" data-testid="orders-email-locked">
          <section className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Lock className="h-5 w-5" aria-hidden="true" /></span>
              <div><p className="font-bold">Forwarding order emails is a Pro feature</p><p className="text-sm text-muted-foreground">Forward an Amazon, AliExpress or eBay email and the order is added for you.</p></div>
            </div>
            <Link href="/personal/pro" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground" data-testid="orders-email-get-pro"><Crown className="h-5 w-5" aria-hidden="true" />Get Pro</Link>
          </section>
          <section className="space-y-2 rounded-2xl border bg-card p-4">
            <p className="font-bold">On the Free plan you can still</p>
            <Link href="/personal/shopping/new" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground" data-testid="free-photo"><Camera className="h-4 w-4" aria-hidden="true" />Take a photo of the order</Link>
            <Link href="/personal/shopping/new" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-background font-bold"><Upload className="h-4 w-4" aria-hidden="true" />Upload a screenshot or PDF</Link>
            <Link href="/personal/shopping/new?manual=1" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-background font-bold" data-testid="free-manual"><Plus className="h-4 w-4" aria-hidden="true" />Add the order by hand</Link>
            <p className="text-xs leading-relaxed text-muted-foreground">Choose Online and the site on the receipt form. It counts in your budget the same way.</p>
          </section>
          <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">Orders already added stay in your list. Emails you forward before Pro is on wait, and are added when Pro starts.</p>
        </div>
      )}
      {!locked && (<>
      <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="forward-card">
        <h2 className="font-bold">Forward your order emails</h2>
        {state === "ready" && address ? (
          <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2.5">
            <span className="min-w-0 flex-1 select-all break-all text-sm font-bold" data-testid="forward-address">{address}</span>
            <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={copy} data-testid="forward-copy"><Copy className="h-4 w-4" aria-hidden="true" />{copied ? "Copied" : "Copy"}</Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="forward-off">{state === "loading" ? "Loading your address…" : "Your forwarding address is not set up yet. Open Bill emails in Settings first, or ask the admin to finish the email setup."}</p>
        )}
        {step(1, "Open the order confirmation from Amazon, AliExpress or eBay.")}
        {step(2, "Forward it to the address above.")}
        {step(3, `The order shows up in ${appName} within a minute, ready to check.`)}
        <p className="text-[13px] leading-relaxed text-muted-foreground">Want it automatic? Set your email to forward messages from these senders and you never have to think about it.</p>
        <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">amazon.com</span><span className="rounded-full bg-red-100 px-2.5 py-1 text-red-900">aliexpress.com</span><span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">ebay.com</span></div>
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="online-paid">
        <h2 className="font-bold">Paid with, for forwarded orders</h2>
        <div role="radiogroup" aria-label="Paid with" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {[...PAID_WITH].sort((a, b) => ["credit", "debit", "cash"].indexOf(a.id) - ["credit", "debit", "cash"].indexOf(b.id)).map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={paid === o.id} onClick={() => void choosePaid(o.id)} data-testid={`online-paid-${o.id}`} className={`min-h-11 rounded-lg px-2 text-sm font-bold ${paid === o.id ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{o.id === "debit" ? "Debit card" : o.label}</button>
          ))}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">New orders are saved with this. You can still change it on any order.</p>
      </section>
      <section className="rounded-2xl border bg-card p-4" data-testid="forward-recent">
        <h2 className="font-bold">Recently forwarded</h2>
        {recent.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing forwarded yet.</p> : recent.map((o) => (
          <Link key={o.id} href={`/personal/shopping/${o.id}`} className="flex min-h-14 items-center gap-3 border-t py-2 first:mt-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: siteColor(o.online_site) }} aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block font-semibold">{formatCurrency(Number(o.total), o.currency)}</span><span className="block text-xs text-muted-foreground">{siteLabel(o.online_site)} · {formatDate(o.purchase_date)}</span></span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${o.needs_check ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`} data-testid={o.needs_check ? "forward-check" : "forward-added"}>{o.needs_check ? "Check it" : "Added"}</span>
          </Link>
        ))}
      </section>
      <Link href="/personal/shopping/new" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-background font-bold"><Camera className="h-4 w-4" aria-hidden="true" />Add from a screenshot</Link>
      </>)}
    </div>
  );
}
