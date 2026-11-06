"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const MY_VERSION = process.env.NEXT_PUBLIC_BUILD_ID;
const CHECK_EVERY_MS = 5 * 60 * 1000;
const SNOOZE_MS = 60 * 60 * 1000;
const SNOOZE_KEY = "update-notice-snoozed";

function snoozedFor(version: string): boolean {
  try {
    const raw = sessionStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { version: string; until: number };
    return saved.version === version && saved.until > Date.now();
  } catch {
    return false;
  }
}

/**
 * Tells people a newer version of the app is live and offers to reload.
 * Checks when the tab becomes visible again and every few minutes while it stays open.
 */
export function UpdateNotice() {
  const [latest, setLatest] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!MY_VERSION || MY_VERSION === "local" || document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const { version } = (await res.json()) as { version?: string };
      if (version && version !== "unknown" && version !== MY_VERSION && !snoozedFor(version)) {
        setLatest(version);
      }
    } catch {
      // Offline or a blip: try again at the next check.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 10_000);
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [check]);

  if (!latest) return null;

  const notNow = () => {
    try {
      sessionStorage.setItem(SNOOZE_KEY, JSON.stringify({ version: latest, until: Date.now() + SNOOZE_MS }));
    } catch {
      // Private mode: it just reappears at the next check.
    }
    setLatest(null);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] mx-auto max-w-md rounded-xl border bg-card p-4 shadow-lg sm:left-auto sm:right-4 sm:mx-0 md:bottom-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <RefreshCw className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">A new version of this page is available</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Refresh to see the latest changes.</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={notNow}>
          Not now
        </Button>
        <Button type="button" size="sm" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
