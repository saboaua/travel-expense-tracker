"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useBrand } from "@/lib/use-brand";
import { BackLink } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PAGE_WIDTH } from "@/components/layout/PageShell";
import { siteColor, siteLabel } from "@/lib/personal/online-orders";
import { formatCurrency, formatDate } from "@/lib/utils";

type Recent = { id: string; store: string; purchase_date: string; total: number; currency: string; online_site: string | null; needs_check: boolean | null };

/** Forward an order email from Amazon, AliExpress or eBay to your private address and it appears as an online receipt to check. */
export function ForwardOrders() {
  const { appName } = useBrand();
  const [address, setAddress] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "off" | "error">("loading");
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  const load = useCallback(async () => {
    const a = await fetch("/api/email/address").then((r) => r.json()).catch(() => ({ setup: "error" }));
    if (a.address) { setAddress(a.address); setState("ready"); } else setState(a.configured === false || a.setup ? "error" : "off");
    const { data } = await createClient().from("grocery_receipts").select("id, store, purchase_date, total, currency, online_site, needs_check").eq("source", "email").order("created_at", { ascending: false }).limit(8);
    setRecent((data ?? []) as unknown as Recent[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const copy = async () => { if (!address) return; try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the address is selectable */ } };
  const step = (n: number, t: string) => <div className="flex items-start gap-3 text-sm leading-snug"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-extrabold text-indigo-900">{n}</span><span>{t}</span></div>;
  return (
    <div className={`${PAGE_WIDTH.formColumn} space-y-4 p-4 pb-28 md:p-8`}>
      <BackLink href="/personal/shopping/online">Online shopping</BackLink>
      <h1 className="text-2xl font-bold">Online orders</h1>
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
    </div>
  );
}
