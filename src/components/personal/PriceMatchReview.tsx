"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PAGE_WIDTH } from "@/components/layout/PageShell";
import { OfflineNotice } from "@/components/OfflineNotice";
import { setupNeeded } from "@/lib/setup-message";
import { createClient } from "@/lib/supabase/client";
import { buildProducts, pairOf, type MatchDecision, type Suggestion } from "@/lib/personal/price-compare";
import { fetchPriceMatches, fetchPrices, priceMatchesKey, pricesKey } from "@/lib/offline-grocery";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOnline } from "@/lib/use-online";
import type { TrackerRow } from "@/lib/personal/grocery";

const pairId = (s: Suggestion) => `${s.keyA}~${s.keyB}`;

/**
 * Every "same product?" question in one list. Both names sit side by side with their stores and latest price; Combine or Keep apart is
 * remembered. The AI's opinion (names only) shows as a tag and never decides: only a tap does.
 */
export function PriceMatchReview() {
  const { data, loading, savedAt } = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matchesQ = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const online = useOnline();
  const rows = useMemo(() => data ?? [], [data]);
  const decisions = useMemo(() => matchesQ.data ?? [], [matchesQ.data]);
  const { products, suggestions } = useMemo(() => buildProducts(rows, decisions), [rows, decisions]);
  const combined = products.filter((p) => p.names.length > 1).length;
  const [note, setNote] = useState<string | null>(null);
  const [ai, setAi] = useState<Record<string, boolean | null>>({});
  const shown = suggestions.slice(0, 40);

  // The AI's opinion for the questions on screen, 12 at a time; without it set up the tags simply do not appear
  useEffect(() => {
    if (!online) return;
    const todo = shown.filter((s) => !(pairId(s) in ai)).slice(0, 12);
    if (todo.length === 0) return;
    let off = false;
    fetch("/api/price-match/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pairs: todo.map((s) => ({ a: s.a.name, b: s.b.name })) }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { answers?: (boolean | null)[] } | null) => {
        if (off) return;
        setAi((prev) => { const next = { ...prev }; todo.forEach((s, i) => { next[pairId(s)] = j?.answers?.[i] ?? null; }); return next; });
      })
      .catch(() => { if (!off) setAi((prev) => { const next = { ...prev }; todo.forEach((s) => { next[pairId(s)] = null; }); return next; }); });
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the list of questions changes
  }, [online, shown.map(pairId).join("|")]);

  async function answer(s: Suggestion, same: boolean) {
    setNote(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) { setNote("Sign in again to save this."); return; }
    const [key_a, key_b] = pairOf(s.keyA, s.keyB);
    const { error } = await supabase.from("grocery_price_matches").upsert({ user_id: uid, key_a, key_b, same }, { onConflict: "user_id,key_a,key_b" });
    if (error) { setNote(/relation|schema cache/i.test(error.message) ? setupNeeded("Saving your answers", "migration_price_matches.sql") : "Could not save that. Try again."); return; }
    await matchesQ.reload();
  }

  const side = (name: string, stores: string[]) => (
    <div className="min-w-0 flex-1 rounded-xl border bg-muted/40 p-3">
      <p className="text-[15px] font-bold leading-snug">{name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{stores.join(", ")}</p>
    </div>
  );

  return (
    <div className={`${PAGE_WIDTH} space-y-4`} data-testid="price-match-review">
      <Link href="/personal/groceries/prices" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Price tracker</Link>
      <h1 className="text-2xl font-bold">Check matches</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">The app combined what is clearly the same. These are the ones it is not sure about. Your answer is remembered.</p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" data-testid="match-count">{suggestions.length} to check</span>
        <span className="text-muted-foreground">Combined on its own: {combined}</span>
      </p>
      <OfflineNotice savedAt={savedAt} />
      {note && <Alert variant="error">{note}</Alert>}
      {loading && rows.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && suggestions.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm" data-testid="match-empty"><Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />Nothing to check. Every product is matched.</div>
      )}
      <ul className="space-y-3">
        {shown.map((s) => {
          const opinion = ai[pairId(s)];
          return (
            <li key={pairId(s)} className="space-y-3 rounded-2xl border bg-card p-3.5" data-testid="match-card">
              <p className="text-sm text-muted-foreground">{s.reason}</p>
              <div className="flex gap-2">{side(s.a.name, s.a.stores)}{side(s.b.name, s.b.stores)}</div>
              {opinion === true && <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-900 dark:bg-violet-500/20 dark:text-violet-200" data-testid="match-ai">AI says: same product</span>}
              {opinion === false && <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-500/20 dark:text-slate-200" data-testid="match-ai">AI says: different</span>}
              <div className="flex gap-2">
                <Button className="h-12 flex-1" disabled={!online} onClick={() => answer(s, true)} data-testid="match-combine">Combine</Button>
                <Button variant="outline" className="h-12 flex-1" disabled={!online} onClick={() => answer(s, false)} data-testid="match-apart">Keep apart</Button>
              </div>
            </li>
          );
        })}
      </ul>
      {suggestions.length > shown.length && <p className="text-sm text-muted-foreground">{suggestions.length - shown.length} more after these.</p>}
    </div>
  );
}
