"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { currentSubscription, enablePush, healPush, isRegistered, pushSupport } from "@/lib/push-client";
import { pushState } from "@/lib/push-state";

const DISMISSED = "lifolio:push-banner-dismissed";
const RECHECK_MS = 60 * 60 * 1000;

/**
 * Keeps alerts working without anyone thinking about it. When the app opens (and when it comes back after an hour):
 *  - alerts were wanted and this phone's subscription is not saved on the server: save it again quietly
 *  - alerts were wanted but this device lost them (a new install, a reset phone): offer one tap to bring them back
 * A person who never turned alerts on is never touched, and neither is one on a shared phone who did not ask.
 */
export function PushKeeper() {
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);

  const check = useCallback(async () => {
    last.current = Date.now();
    try {
      if (pushSupport() !== "ok") return;
      const r = await fetch("/api/push/prefs", { cache: "no-store" });
      if (!r.ok) return;
      const wanted = Boolean((await r.json()).prefs?.wanted);
      const sub = await currentSubscription();
      const permission = Notification.permission;
      const registered = sub ? await isRegistered(sub.endpoint) : false;
      let st = pushState({ support: "ok", permission, hasSub: !!sub, registered, wanted });
      // Alerts that were turned on before this check existed: remember the wish
      if (st === "on" && !wanted) await fetch("/api/push/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs: { wanted: true } }) }).catch(() => {});
      // Permission is still there: no tap needed to put things right
      if ((st === "repair" || st === "restore") && wanted && permission === "granted" && (await healPush())) st = "on";
      let dismissed = false;
      try { dismissed = sessionStorage.getItem(DISMISSED) === "1"; } catch { /* ignore */ }
      setOffer(st === "restore" && !dismissed);
    } catch { /* offline: try again next time */ }
  }, []);

  useEffect(() => {
    void check();
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - last.current > RECHECK_MS) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check]);

  if (!offer) return null;
  const turnOn = async () => {
    setBusy(true);
    setError(null);
    const out = await enablePush();
    setBusy(false);
    if (out.ok) setOffer(false); else setError(out.error);
  };
  const dismiss = () => { try { sessionStorage.setItem(DISMISSED, "1"); } catch { /* ignore */ } setOffer(false); };
  return (
    <div role="status" data-testid="push-restore" className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom)*0.3)] z-40 rounded-2xl border bg-card p-3 shadow-lg md:inset-x-auto md:bottom-4 md:right-4 md:w-96">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Bell className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Alerts are off on this device</p>
          <p className="text-xs text-muted-foreground">You had them on before. Turn them back on to keep getting reminders here.</p>
          {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
          <button type="button" onClick={turnOn} disabled={busy} data-testid="push-restore-on" className="mt-2 h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-70">Turn alerts back on</button>
        </div>
        <button type="button" onClick={dismiss} aria-label="Not now" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  );
}
