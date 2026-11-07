"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { activePartners, kindLabel, sharedWith, type ShareKind } from "@/lib/sharing";
import { sharingAction, useSharing } from "@/lib/use-sharing";

/**
 * "Share with" row on a card or a trip (owner only). Nothing is shared unless a switch here is turned on for that one partner.
 */
export function ShareWith({ kind, itemId, className = "" }: { kind: ShareKind; itemId: string; className?: string }) {
  const { overview, refresh } = useSharing();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!overview || !overview.available || !overview.enabled) return null;
  const partners = activePartners(overview);
  const shared = sharedWith(overview, kind, itemId);
  const what = kind === "loyalty_card" ? "card" : "trip";

  if (partners.length === 0) {
    return (
      <p className={`rounded-lg border border-dashed p-3 text-xs text-muted-foreground ${className}`}>
        <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        Want to share this {what}? Add a partner in <Link href="/profile#sharing" className="font-semibold text-primary hover:underline">Profile</Link>.
      </p>
    );
  }

  async function toggle(partnershipId: string, name: string) {
    setError(null);
    const current = shared[partnershipId];
    if (current) {
      const ok = await confirm({ title: `Stop sharing this ${what}?`, message: `${name} will no longer see this ${kindLabel(kind)}.`, confirmLabel: "Stop sharing", destructive: true });
      if (!ok) return;
    }
    setBusy(partnershipId);
    const r = current ? await sharingAction("unshare", { share_id: current }) : await sharingAction("share", { partnership_id: partnershipId, kind, item_id: itemId });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    await refresh();
  }

  return (
    <div className={`rounded-xl border p-3 ${className}`} data-testid="share-with">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4" aria-hidden="true" /> Share with</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {kind === "loyalty_card" ? "They can see and scan this card. They cannot change or delete it." : "They see the trip name, destination and dates only. No expenses, receipts or notes."}
      </p>
      <ul className="mt-2 divide-y">
        {partners.map((p) => {
          const on = !!shared[p.id];
          const name = p.name || p.email || "Partner";
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm">{name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Share this ${what} with ${name}`}
                disabled={busy === p.id}
                onClick={() => toggle(p.id, name)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${on ? "bg-primary" : "bg-muted-foreground/40"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
