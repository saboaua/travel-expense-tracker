"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fetchPriceMatches, fetchPrices } from "@/lib/offline-grocery";
import { buildProducts } from "@/lib/personal/price-compare";
import { lastSharedLabel, oldPriceCount, sharedRows, shareNow } from "@/lib/personal/community";
import { AccordionSection } from "@/components/ui/accordion";
import { TIERS, plural, progress, readBadge, tierOf, type BadgeState } from "@/lib/personal/badges";
import { BadgeShield } from "@/components/profile/BadgeShield";
import { LevelUpNotice } from "@/components/profile/LevelUpNotice";

/** Profile > Community prices: the switch for sharing receipt prices (store, item name and price only), and a way to delete what was shared. */
export function CommunityCard() {
  const [on, setOn] = useState<boolean | null>(null);
  const [available, setAvailable] = useState(true);
  const [mine, setMine] = useState<number | null>(null);
  const [check, setCheck] = useState(0);
  const [last, setLast] = useState<{ at: string | null; count: number | null; error: boolean } | null>(null);
  const [badge, setBadge] = useState<BadgeState | null>(null);
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
    // when the nightly share last ran (null until migration_nightly_share.sql has been run)
    const st = await sb.from("profiles").select("share_last_at, share_last_count, share_last_error").eq("id", session.user.id).single();
    setLast(st.error ? null : { at: (st.data?.share_last_at as string | null) ?? null, count: (st.data?.share_last_count as number | null) ?? null, error: st.data?.share_last_error === true });
    const c = await sb.rpc("my_shared_count");
    setMine(c.error ? null : Number(c.data) || 0);
    const b = await sb.rpc("my_badge"); // null until migration_badges.sql has been run
    setBadge(b.error ? null : readBadge(b.data));
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
      // Prices are shared once a night, so a receipt can be fixed first. Say what tonight's run will send.
      await explainTonight();
    } else setMsg("Sharing is off. Nothing more will be shared.");
    await load();
    setBusy(false);
  };

  /** After turning sharing on: how many prices tonight's run will send (nothing is sent now). */
  const explainTonight = async () => {
    try {
      const sb = createClient();
      const [p, m] = await Promise.all([fetchPrices(sb), fetchPriceMatches(sb)]);
      if (p.error || !p.data) throw new Error("prices");
      const { products } = buildProducts(p.data, m.data ?? []);
      const ready = sharedRows(products, new Date()).length;
      const old = oldPriceCount(products, new Date());
      if (ready > 0) setMsg(`Sharing is on. Your prices are shared tonight. ${ready} price${ready === 1 ? "" : "s"} from your receipts will be sent in tonight's run.${old ? ` ${old} older than 60 days stay out.` : ""} Want it now? Tap Share my latest prices now.`);
      else if (old > 0) setMsg("Sharing is on. Nothing to share yet: your prices are older than 60 days. Scan a receipt and it is shared the next night.");
      else setMsg("Sharing is on. Nothing to share yet. Scan a receipt or add a price and it is shared the next night.");
    } catch { setMsg("Sharing is on. Your prices are shared tonight."); }
  };

  /** Shares the prices already logged, right away (when sharing is turned on, or from the button). */
  const sendNow = async (uid: string, justOn: boolean) => {
    const sb = createClient();
    try {
      const [p, m] = await Promise.all([fetchPrices(sb), fetchPriceMatches(sb)]);
      if (p.error || !p.data) throw new Error("prices");
      const { products } = buildProducts(p.data, m.data ?? []);
      const r = await shareNow(sb, uid, products, new Date());
      if (r.error) { setErr("Could not share your prices. Check your connection and try again."); }
      else {
        const base = justOn ? "Sharing is on. " : "";
        if (r.sent > 0) setMsg(`${base}Shared ${r.sent} price${r.sent === 1 ? "" : "s"} just now.${r.old ? ` ${r.old} older than 60 days stay on your phone.` : ""} Tonight's run keeps it up to date.`);
        else if (r.old > 0) setMsg(`${base}Nothing to share yet: your prices are older than 60 days. Scan a receipt and it is shared the next night.`);
        else setMsg(`${base}Nothing to share yet. Scan a receipt or add a price and it is shared the next night.`);
        if (r.sent > 0) { try { await fetch("/api/badge", { method: "POST" }); } catch { /* the alert is optional */ } setCheck((n) => n + 1); }
      }
    } catch { setErr("Could not read your prices. Please try again."); }
    await load();
  };
  const shareAgain = async () => {
    setBusy(true); setErr(null); setMsg(null);
    const { data: { session } } = await createClient().auth.getSession();
    if (session) await sendNow(session.user.id, false);
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
      <AccordionSection id="community-prices" title="Community prices" icon={<Share2 />} tone="badges" summary="Not set up yet" description="Help everyone find cheaper groceries.">
        <Alert variant="info">Community prices are not set up yet. An admin needs to run supabase/migration_shared_prices.sql.</Alert>
      </AccordionSection>
    );
  }
  return (
    <>
    <LevelUpNotice check={check} />
    <AccordionSection id="community-prices" title="Community prices" icon={<Share2 />} tone="badges" summary={on == null ? "" : on ? "Sharing is on" : "Off"} description="Help everyone find cheaper groceries. Off until you turn it on.">
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
        {on && <NightlyStatus last={last} />}
        {badge && <BadgePanel badge={badge} on={on === true} />}
        <p className="text-sm text-muted-foreground">Your prices join a shared price list that nobody can trace back to you, so others can see when an item is cheaper somewhere else.</p>
        <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <li><b className="text-emerald-600">✓</b> Shared: the store name, the item name, its size and the price. Nothing else.</li>
          <li><b className="text-emerald-600">✓</b> Read each night: if sharing is on, Lifolio reads your latest prices on the server to build that list. Receipts are never copied or stored by it.</li>
          <li><b className="text-red-600">✕</b> Never shared: your name, email, receipts, dates, location or totals.</li>
          <li><b className="text-emerald-600">✓</b> Only prices from the last 60 days are shared.</li>
          <li><b className="text-emerald-600">✓</b> A price shows to others only after 3 or more people report it.</li>
          <li><b className="text-emerald-600">✓</b> Turn it off any time and delete what you shared.</li>
        </ul>
        {on && (
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={shareAgain} data-testid="profile-share-now">Share my latest prices now</Button>
            <Button className="h-11 w-full bg-red-600 text-white hover:bg-red-700" disabled={busy || !mine} onClick={withdraw} data-testid="profile-share-delete">Delete what I shared{mine ? ` (${mine} price${mine === 1 ? "" : "s"})` : ""}</Button>
          </div>
        )}
        {on && badge && <p className="text-xs text-muted-foreground">Deleting restarts your count at 0. Badges you earned stay on your shelf.</p>}
        <p className="text-center text-xs text-muted-foreground">Read the <Link href="/privacy" className="underline">Privacy Policy</Link></p>
      </div>
    </AccordionSection>
    </>
  );
}

/** Your badge, the way to the next level, and a link to all levels. Only you see it. */
function BadgePanel({ badge, on }: { badge: BadgeState; on: boolean }) {
  const p = progress(badge.total);
  const shown = tierOf(badge.best);
  return (
    <div className="space-y-3" data-testid="badge-panel">
      {shown ? (
        <div className="flex items-center gap-3.5 rounded-2xl p-3" style={{ background: shown.tint }}>
          <BadgeShield level={shown.level} size={72} />
          <div>
            <p className="text-xs text-muted-foreground">Your badge</p>
            <p className="text-2xl font-extrabold" style={{ color: shown.dark }} data-testid="badge-name">{shown.name}</p>
            <p className="text-sm text-muted-foreground">{plural(badge.total)} shared</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border p-3">
          <div className="flex">{TIERS.slice(0, 3).map((t) => <BadgeShield key={t.level} level={t.level} size={38} locked />)}</div>
          <div className="text-sm">
            <b>{on ? "Your first badge is close" : "Earn badges by sharing prices"}</b>
            <p className="text-muted-foreground">{on ? "Share 1 price to become a Helper. Open the Price tracker to send your latest prices." : "Turn sharing on to start. Only store, item and price leave your phone."}</p>
          </div>
        </div>
      )}
      {on && p.next && (
        <div>
          <div className="flex justify-between text-sm"><b>Next: {p.next.name}</b><span className="text-muted-foreground">{badge.total.toLocaleString("en-US")} of {p.next.from.toLocaleString("en-US")}</span></div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${p.pct}%` }} /></div>
          <p className="mt-1.5 text-xs text-muted-foreground">{plural(p.toGo)} to go.</p>
        </div>
      )}
      {on && !p.next && <p className="text-sm text-muted-foreground">You reached the top level. Thank you.</p>}
      <Link href="/profile/badges" data-testid="badge-shelf-link" className="flex min-h-[44px] items-center justify-between text-sm font-bold text-primary"><span>See all badges</span><span aria-hidden>›</span></Link>
      <p className="border-t pt-2.5 text-xs text-muted-foreground">Only you see your badge. Others never see it, and there is no leaderboard.</p>
    </div>
  );
}

/** When the nightly share last ran, and what a correction does. */
function NightlyStatus({ last }: { last: { at: string | null; count: number | null; error: boolean } | null }) {
  if (!last) return null; // migration_nightly_share.sql has not been run yet
  const when = lastSharedLabel(last.at, new Date());
  return (
    <div className={`rounded-2xl border p-3 ${last.error ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"}`} data-testid="nightly-status">
      {last.error ? (
        <>
          <p className="text-sm font-bold text-red-800 dark:text-red-200">Last night&apos;s share did not go through</p>
          <p className="mt-1 text-sm text-muted-foreground">It will try again tonight. You can also tap Share my latest prices now.</p>
        </>
      ) : (
        <>
          <div className="flex justify-between text-sm"><b className="text-emerald-900 dark:text-emerald-200">Shared once a night</b><span className="text-emerald-900 dark:text-emerald-200">Next: tonight</span></div>
          <p className="mt-1 text-sm">{when ? `Last shared: ${when}${last.count != null ? `, ${plural(last.count)}` : ""}` : "Not shared yet. The first share is tonight."}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">Fix a receipt before tonight and the corrected price is the one shared. Delete a receipt and its price leaves the shared list.</p>
        </>
      )}
    </div>
  );
}
