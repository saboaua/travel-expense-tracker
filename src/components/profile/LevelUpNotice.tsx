"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { levelUpToShow, progress, readBadge, tierOf, plural, type BadgeState } from "@/lib/personal/badges";
import { BadgeShield } from "@/components/profile/BadgeShield";
import { Button } from "@/components/ui/button";

/** Shown once when a new badge level is reached. `check` changes when prices were just shared, so it looks again. */
export function LevelUpNotice({ check = 0 }: { check?: number }) {
  const [b, setB] = useState<BadgeState | null>(null);
  useEffect(() => {
    (async () => {
      const r = await createClient().rpc("my_badge");
      if (!r.error) { const s = readBadge(r.data); setB(levelUpToShow(s) ? s : null); }
    })().catch(() => {});
  }, [check]);
  if (!b) return null;
  const t = tierOf(levelUpToShow(b));
  if (!t) return null;
  const p = progress(b.total);
  const done = async () => { setB(null); try { await createClient().rpc("ack_badge"); } catch { /* shown again next time */ } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-6" role="dialog" aria-modal="true" aria-label={`New badge: ${t.name}`} data-testid="level-up">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
        <div className="flex justify-center"><BadgeShield level={t.level} size={120} /></div>
        <p className="mt-3 text-sm text-muted-foreground">New badge</p>
        <p className="text-3xl font-extrabold" style={{ color: t.dark }}>{t.name}</p>
        <p className="mt-2 text-base">You have shared {plural(b.total)}. Thank you for helping everyone find cheaper groceries.</p>
        {p.next && (
          <div className="mt-4 text-sm text-muted-foreground">
            Next: {p.next.name} at {p.next.from.toLocaleString("en-US")}
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${p.pct}%` }} /></div>
          </div>
        )}
        <Button className="mt-5 h-12 w-full text-base" onClick={done} data-testid="level-up-done">Done</Button>
      </div>
    </div>
  );
}
