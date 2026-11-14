"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TIERS, plural, progress, readBadge, type BadgeState } from "@/lib/personal/badges";
import { BadgeShield } from "@/components/profile/BadgeShield";
import { LevelUpNotice } from "@/components/profile/LevelUpNotice";
import { BadgeShare } from "@/components/profile/BadgeShare";
import { Alert } from "@/components/ui/alert";

/** Profile > Your badges: every level, which are earned and what the next one needs. Only you see it. */
export default function BadgesPage() {
  const [b, setB] = useState<BadgeState | null>(null);
  const [missing, setMissing] = useState(false);
  const [sharing, setSharing] = useState<{ level: number; total: number } | null>(null);
  useEffect(() => {
    (async () => {
      const r = await createClient().rpc("my_badge");
      if (r.error) setMissing(true); else setB(readBadge(r.data));
    })().catch(() => setMissing(true));
  }, []);
  const p = progress(b?.total ?? 0);
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-8" data-testid="badge-shelf">
      <LevelUpNotice />
      <Link href="/profile" className="inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Profile</Link>
      <div><h1 className="text-2xl font-extrabold">Your badges</h1><p className="text-sm text-muted-foreground">Earned by sharing prices. Only you see them.</p></div>
      {missing && <Alert variant="info">Badges are not set up yet. An admin needs to run supabase/migration_badges.sql.</Alert>}
      {b && (
        <div className="space-y-3">
          {TIERS.map((t) => {
            const earned = b.best >= t.level;
            const now = b.level === t.level || (b.best === t.level && b.level < t.level);
            const sub = now
              ? (p.next && b.level === t.level ? `${plural(b.total)} shared. ${plural(p.toGo)} to go to ${p.next.name}.` : b.level === 5 ? "Top level. Thank you." : `Earned. Your count restarted at ${b.total.toLocaleString("en-US")}.`)
              : earned ? `Reached at ${t.from.toLocaleString("en-US")} prices shared.` : `Share ${plural(t.from)} to unlock.`;
            return (
              <div key={t.level} data-testid={`badge-tier-${t.name.toLowerCase()}`} className={`flex items-center gap-3 rounded-2xl border bg-card p-3 ${b.level === t.level ? "border-2 border-primary" : ""} ${earned ? "" : "opacity-80"}`}>
                <BadgeShield level={t.level} size={52} locked={!earned} />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2"><b className="text-base">{t.name}</b>
                    <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-bold">{b.level === t.level ? "Your level" : earned ? "Earned" : `${t.from.toLocaleString("en-US")} prices`}</span></div>
                  <p className="text-sm text-muted-foreground">{sub}</p>
                  {earned && <button type="button" onClick={() => setSharing({ level: t.level, total: b.level === t.level ? b.total : t.from })} className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-primary" data-testid={`share-${t.name.toLowerCase()}`}><Share2 className="h-4 w-4" aria-hidden="true" /> Share</button>}
                </div>
              </div>
            );
          })}
          <div className="rounded-2xl border bg-card p-3 text-sm">
            <b>How it counts</b>
            <p className="mt-1 leading-relaxed text-muted-foreground">One price per product and store. Sending a newer price for the same item does not count again, so quality beats volume. The count stays when old prices expire. Delete what you shared and the count starts again at 0; badges you earned stay here.</p>
          </div>
        </div>
      )}
      {sharing && <BadgeShare level={sharing.level} total={sharing.total} onClose={() => setSharing(null)} />}
    </div>
  );
}
