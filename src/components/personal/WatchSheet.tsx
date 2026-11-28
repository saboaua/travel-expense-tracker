"use client";

import { useState } from "react";
import Link from "next/link";
import { BellPlus, Crown } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { parseBudgetInput } from "@/lib/personal/budget";
import { round2 } from "@/lib/personal/money";
import { ruleWords, type Watch, type WatchRule } from "@/lib/personal/price-watch";
import { setupNeeded } from "@/lib/setup-message";
import { watchesStatus } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";
import { formatCurrency, todayISO } from "@/lib/utils";

export type WatchTarget = { key: string; name: string; currency: string; last: { price: number; store: string } | null; now: { price: number; store: string } | null };

/**
 * The sheet that starts (or changes) a price watch on one product. Two rules, both fixed now so the words on the list never move.
 * Free people have a number of watches; at the number the sheet says so and offers Pro instead of saving.
 */
export function WatchSheet({ target, existing, count, onClose, onSaved }: { target: WatchTarget; existing: Watch | null; count: number; onClose: () => void; onSaved: () => void }) {
  const lim = useLimits();
  const fmt = (n: number) => formatCurrency(n, target.currency);
  const [rule, setRule] = useState<WatchRule>(existing ? existing.rule : target.last ? "below_last" : "at_or_below");
  const [price, setPrice] = useState(existing?.rule === "at_or_below" ? String(existing.target) : target.last ? String(round2(target.last.price * 0.95)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = !existing && lim ? watchesStatus(lim.limits, lim.who, count, todayISO()) : null;
  const full = !!cap?.full;

  async function save() {
    setError(null);
    const value = rule === "below_last" ? target.last?.price ?? null : parseBudgetInput(price);
    if (value == null) return setError(rule === "below_last" ? "There is no price you paid to compare with. Choose a price instead." : "Enter a price, for example 3.80.");
    if (!lim) return setError("Still loading. Try again in a moment.");
    setBusy(true);
    const row = { user_id: lim.uid, product_key: target.key, name: target.name, currency: target.currency, rule, target: round2(value), paused: false, last_alert_price: null, last_alert_store: null, last_alert_on: null };
    const { error: e } = await createClient().from("price_watches").upsert(row, { onConflict: "user_id,product_key" });
    setBusy(false);
    if (e) return setError(/relation|schema cache|does not exist/i.test(e.message) ? setupNeeded("Price watches", "migration_price_watches.sql") : "Could not save. Try again.");
    onSaved();
  }

  async function stop() {
    if (!existing) return;
    setBusy(true);
    const { error: e } = await createClient().from("price_watches").delete().eq("id", existing.id);
    setBusy(false);
    if (e) return setError("Could not stop the watch. Try again.");
    onSaved();
  }

  return (
    <BottomSheet title={`Watch ${target.name}`} onClose={onClose} testId="watch-sheet">
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
          <BellPlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {target.last ? <>You last paid {fmt(target.last.price)} at {target.last.store}. </> : <>No purchase yet. </>}
            {target.now ? <>Cheapest right now: {fmt(target.now.price)} at {target.now.store}.</> : null}
          </span>
        </p>

        {full ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-testid="watch-full">
            <p className="font-semibold">You are watching {cap?.limit} products, the most on Free.</p>
            <p className="mt-1">Stop watching one, or get Pro to watch more.</p>
            <Link href="/personal/pro" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground" data-testid="watch-get-pro"><Crown className="h-4 w-4" aria-hidden="true" />Get Pro</Link>
          </div>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-semibold">Tell me when it is</legend>
            <label className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-[15px] ${rule === "below_last" ? "border-primary bg-primary/5" : ""} ${target.last ? "" : "opacity-50"}`}>
              <input type="radio" name="watch-rule" checked={rule === "below_last"} disabled={!target.last} onChange={() => setRule("below_last")} data-testid="watch-rule-below" />
              <span>{target.last ? `Cheaper than I last paid (${fmt(target.last.price)})` : "Cheaper than I last paid"}</span>
            </label>
            <label className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-[15px] ${rule === "at_or_below" ? "border-primary bg-primary/5" : ""}`}>
              <input type="radio" name="watch-rule" checked={rule === "at_or_below"} onChange={() => setRule("at_or_below")} data-testid="watch-rule-at" />
              <span className="flex-1">At or below</span>
              <Input aria-label={`Price in ${target.currency}`} inputMode="decimal" className="h-9 w-24" value={price} onChange={(e) => { setPrice(e.target.value); setRule("at_or_below"); }} data-testid="watch-price" />
            </label>
          </fieldset>
        )}

        {existing && <p className="text-[13px] text-muted-foreground" data-testid="watch-current">Now: {ruleWords(existing, fmt)}.</p>}
        {error && <p className="text-sm text-red-700 dark:text-red-300" role="alert" data-testid="watch-error">{error}</p>}

        <div className="flex gap-2 pt-1">
          {!full && <Button className="h-11 flex-1" onClick={save} disabled={busy} data-testid="watch-save">{existing ? "Save changes" : "Start watching"}</Button>}
          <Button variant="outline" className="h-11 flex-1" onClick={onClose} data-testid="watch-cancel">Cancel</Button>
        </div>
        {existing && <Button variant="ghost" className="h-11 w-full text-red-700 dark:text-red-300" onClick={stop} disabled={busy} data-testid="watch-stop">Stop watching</Button>}
        {!full && <p className="text-xs leading-snug text-muted-foreground">Checked every morning against your receipts, community prices and the Super Food Plaza, Ling &amp; Sons and Do it lists.</p>}
      </div>
    </BottomSheet>
  );
}
