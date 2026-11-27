"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Sparkles } from "lucide-react";

type Usage = { limited: boolean; used?: number; limit?: number; exhausted?: boolean; resetsLabel?: string };

/** Free plan: "7 of 10 AI scans used this month". Shows nothing for Pro, admins, or before the limits start. Updates after every scan. */
export function AiScanMeter({ className = "" }: { className?: string }) {
  const [u, setU] = useState<Usage | null>(null);
  const load = useCallback(async () => {
    try { const r = await fetch("/api/ocr/usage", { cache: "no-store" }); if (r.ok) setU(await r.json()); } catch { /* offline: no counter */ }
  }, []);
  useEffect(() => { load(); window.addEventListener("lifolio:ai-scan", load); return () => window.removeEventListener("lifolio:ai-scan", load); }, [load]);
  if (!u?.limited || u.limit == null || u.used == null) return null;
  if (u.exhausted) {
    return (
      <div className={`rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100 ${className}`} role="status" data-testid="ai-meter-used-up">
        <p className="flex items-center gap-2 text-sm font-extrabold"><Sparkles className="h-4 w-4" aria-hidden="true" />AI scans used up: {u.used} of {u.limit}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed">Receipts are read on this phone, so check the amounts before you save. AI scanning is back on <b>{u.resetsLabel}</b>. Pro has no limit.</p>
        <Link href="/personal/pro" className="mt-2.5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-bold text-primary-foreground" data-testid="ai-meter-get-pro"><Crown className="h-4 w-4" aria-hidden="true" />Get Pro</Link>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100));
  return (
    <div className={`rounded-2xl border bg-card p-3.5 ${className}`} data-testid="ai-meter">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">AI scans this month</p><p className="text-[12.5px] text-muted-foreground"><span data-testid="ai-meter-count">{u.used} of {u.limit}</span> used on the Free plan. Scanning on the phone has no limit.</p></div>
      </div>
      <div className="mt-2.5 h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={u.used} aria-valuemin={0} aria-valuemax={u.limit}><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
