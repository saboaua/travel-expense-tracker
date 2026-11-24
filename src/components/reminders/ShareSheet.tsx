"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useSharing } from "@/lib/use-sharing";
import { activePartners } from "@/lib/sharing";
import { useReminderShares } from "./use-reminder-shares";
import { PersonAvatar } from "./PersonAvatar";

/**
 * Share one reminder with your partners, the same people as for loyalty cards: a switch for each, and for each one that is on,
 * whether they can mark it done or only view it. Free people see what Pro adds.
 */
export function ShareSheet({ reminderId, pro, onClose, onChanged }: { reminderId: string; pro: boolean; onClose: () => void; onChanged?: () => void }) {
  const { overview } = useSharing();
  const { shared, refresh } = useReminderShares();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const partners = activePartners(overview);
  const on = new Map((shared.get(reminderId) ?? []).map((s) => [s.partnershipId, s.canComplete]));
  useEffect(() => { setError(null); }, [reminderId]);

  async function set(pid: string, enable: boolean, may = true) {
    setBusy(pid); setError(null);
    const supabase = createClient();
    const r = enable
      ? await supabase.rpc("share_reminder_partner", { rid: reminderId, pid, may_complete: may })
      : await supabase.rpc("unshare_reminder_partner", { rid: reminderId, pid });
    setBusy(null);
    if (r.error) return setError(/does not exist|schema cache/i.test(r.error.message) ? "Sharing reminders is not set up yet. Run supabase/migration_reminder_partners.sql in the Supabase SQL Editor." : "Could not change sharing. Try again.");
    if (enable && r.data === "not_found") return setError("That partner is no longer active.");
    await refresh();
    onChanged?.();
  }

  return (
    <BottomSheet title="Share this reminder" onClose={onClose} testId="share-sheet">
      {!pro ? (
        <div className="space-y-3" data-testid="share-locked">
          <p className="flex items-center gap-2 font-semibold"><Crown className="h-5 w-5 text-amber-600" aria-hidden="true" />Sharing reminders is a Pro feature</p>
          <p className="text-sm text-muted-foreground">Share a reminder with your partner. They get the alert too, and can mark it done.</p>
          <Link href="/personal/pro" className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground">Get Pro</Link>
        </div>
      ) : partners.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center" data-testid="share-no-partner">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" aria-hidden="true"><Users className="h-6 w-6" /></span>
          <p className="font-extrabold">No one to share with yet</p>
          <p className="text-sm text-muted-foreground">Add a partner or family member once in Profile. Then you can share reminders, cards and trips with them.</p>
          <Link href="/profile#sharing" className="mt-1 flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Add a partner</Link>
        </div>
      ) : (
        <div className="space-y-2" data-testid="share-with">
          <p className="text-sm text-muted-foreground">They see it, get the phone alert, and can mark it done if you allow it. Nothing else is shared.</p>
          <ul className="divide-y">
            {partners.map((p) => {
              const name = p.name || p.email || "Partner";
              const enabled = on.has(p.id);
              const may = on.get(p.id) ?? true;
              return (
                <li key={p.id} className="py-2" data-testid="share-partner">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={name} size={36} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{name}</span>{p.email && <span className="block truncate text-xs text-muted-foreground">{p.email}</span>}</span>
                    <button type="button" role="switch" aria-checked={enabled} aria-label={`Share this reminder with ${name}`} disabled={busy === p.id} onClick={() => set(p.id, !enabled, true)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${enabled ? "bg-primary" : "bg-muted-foreground/40"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </div>
                  {enabled && (
                    <div className="mt-2 flex gap-2" role="radiogroup" aria-label={`What ${name} can do`}>
                      {[{ v: true, t: "Can mark done" }, { v: false, t: "View only" }].map((o) => (
                        <button key={o.t} type="button" role="radio" aria-checked={may === o.v} disabled={busy === p.id} onClick={() => may !== o.v && set(p.id, true, o.v)}
                          className={`min-h-10 flex-1 rounded-full border text-sm font-medium ${may === o.v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{o.t}</button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-4 w-4" aria-hidden="true" />Add or remove people in <Link href="/profile#sharing" className="font-semibold text-primary hover:underline">Profile</Link></p>
        </div>
      )}
    </BottomSheet>
  );
}
