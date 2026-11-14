"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AccordionSection } from "@/components/ui/accordion";

/** Profile > Community prices: the switch for sharing receipt prices (store, item name and price only), and a way to delete what was shared. */
export function CommunityCard() {
  const [on, setOn] = useState<boolean | null>(null);
  const [available, setAvailable] = useState(true);
  const [mine, setMine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data, error } = await sb.from("profiles").select("share_prices").eq("id", session.user.id).single();
    if (error) { setAvailable(false); return; } // migration_shared_prices.sql has not been run
    setOn(data?.share_prices === true);
    const c = await sb.rpc("my_shared_count");
    setMine(c.error ? null : Number(c.data) || 0);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (on == null) return;
    setBusy(true); setErr(null); setMsg(null);
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setBusy(false); return; }
    const next = !on;
    const { error } = await sb.from("profiles").update({ share_prices: next }).eq("id", session.user.id);
    if (error) { setBusy(false); return setErr("Could not save that. Please try again."); }
    setOn(next);
    if (next) {
      // The Price tracker sends the prices the next time it is opened
      try { localStorage.removeItem(`price-share-sync:${session.user.id}`); } catch { /* storage can be blocked */ }
      setMsg("Sharing is on. Your prices are shared the next time you open the Price tracker.");
    } else setMsg("Sharing is off. Nothing more will be shared.");
    await load();
    setBusy(false);
  };

  const withdraw = async () => {
    setBusy(true); setErr(null); setMsg(null);
    const { data, error } = await createClient().rpc("unshare_my_prices");
    setBusy(false);
    if (error) return setErr("Could not delete them. Please try again.");
    setMsg(`Deleted ${Number(data) || 0} shared price${Number(data) === 1 ? "" : "s"}.`);
    await load();
  };

  if (!available) {
    return (
      <AccordionSection id="community-prices" title="Community prices" icon={<Share2 />} summary="Not set up yet" description="Help everyone find cheaper groceries.">
        <Alert variant="info">Community prices are not set up yet. An admin needs to run supabase/migration_shared_prices.sql.</Alert>
      </AccordionSection>
    );
  }
  return (
    <AccordionSection id="community-prices" title="Community prices" icon={<Share2 />} summary={on == null ? "" : on ? "Sharing is on" : "Off"} description="Help everyone find cheaper groceries. Off until you turn it on.">
      <div className="space-y-4" data-testid="community-card">
        {err && <Alert variant="error">{err}</Alert>}
        {msg && <Alert variant="success">{msg}</Alert>}
        <div className="flex items-center justify-between gap-3">
          <div>
            <label htmlFor="profile-share-toggle" className="text-base font-semibold">Share my prices</label>
            <p className="text-sm text-muted-foreground">{on ? "On. Thank you for helping." : "Off. Nothing is shared."}</p>
          </div>
          <button id="profile-share-toggle" type="button" role="switch" aria-checked={on === true} disabled={busy || on == null} onClick={toggle} data-testid="profile-share-toggle" className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
            <span className="sr-only">{on ? "On" : "Off"}</span>
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Your prices join a shared price list that nobody can trace back to you, so others can see when an item is cheaper somewhere else.</p>
        <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <li><b className="text-emerald-600">✓</b> Shared: the store name, the item name and the price. Nothing else.</li>
          <li><b className="text-red-600">✕</b> Never shared: your name, email, receipts, dates, location or totals.</li>
          <li><b className="text-emerald-600">✓</b> A price shows to others only after 3 or more people report it.</li>
          <li><b className="text-emerald-600">✓</b> Turn it off any time and delete what you shared.</li>
        </ul>
        {on && (
          <div className="flex flex-col gap-2">
            <Button className="h-11 w-full bg-red-600 text-white hover:bg-red-700" disabled={busy || !mine} onClick={withdraw} data-testid="profile-share-delete">Delete what I shared{mine ? ` (${mine} price${mine === 1 ? "" : "s"})` : ""}</Button>
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground">Read the <Link href="/privacy" className="underline">Privacy Policy</Link></p>
      </div>
    </AccordionSection>
  );
}
