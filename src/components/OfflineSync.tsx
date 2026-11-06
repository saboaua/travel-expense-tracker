"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserOf, makeHandlers } from "@/lib/offline-api";
import { nounFor, syncOutbox } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";

export const SYNC_NOW_EVENT = "expense-queue-sync-now";

/**
 * Sends waiting changes (receipts and, as they are added, other kinds) when the connection is back and shows a small "pending sync" pill while any are waiting.
 * Lives in the dashboard layout, so it works from every page.
 */
export function OfflineSync() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const running = useRef(false);
  const { items } = useOutbox(userId);

  useEffect(() => {
    // The session is read from the device, so this also works with no connection.
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, [supabase]);

  const sync = useCallback(async () => {
    if (!userId || running.current || !navigator.onLine) return;
    running.current = true;
    setSyncing(true);
    try {
      const result = await syncOutbox(makeHandlers(supabase), currentUserOf(supabase), userId);
      if (result && result.synced > 0) {
        setJustSynced(result.syncedKinds);
        router.refresh();
        setTimeout(() => setJustSynced([]), 5000);
      }
    } catch {
      // Storage problems or a dropped connection: the items stay queued and the next trigger tries again.
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [userId, supabase, router]);

  useEffect(() => {
    if (!userId) return;
    const onOnline = () => {
      setOnline(true);
      sync();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === "visible" && sync();
    setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(SYNC_NOW_EVENT, sync);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(sync, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(SYNC_NOW_EVENT, sync);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [userId, sync]);

  const needAttention = items.filter((i) => i.status !== "pending").length;
  const waiting = items.length - needAttention;

  if (items.length === 0 && justSynced.length === 0) return null;

  let icon = <CloudOff className="h-4 w-4" />;
  let text: string;
  let tone = "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
  if (items.length === 0) {
    icon = <CheckCircle2 className="h-4 w-4" />;
    const noun = nounFor(justSynced);
    text = justSynced.length === 1 ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} synced` : `${justSynced.length} ${noun} synced`;
    tone = "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100";
  } else if (syncing && waiting > 0) {
    icon = <Loader2 className="h-4 w-4 animate-spin" />;
    text = "Syncing…";
  } else if (waiting === 0) {
    icon = <TriangleAlert className="h-4 w-4" />;
    const noun = nounFor(items.filter((i) => i.status !== "pending").map((i) => i.kind));
    text = needAttention === 1 ? `1 ${noun} needs attention` : `${needAttention} ${noun} need attention`;
    tone = "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100";
  } else {
    text = `${waiting} ${nounFor(items.filter((i) => i.status === "pending").map((i) => i.kind), waiting)} pending sync${online ? "" : " · offline"}`;
  }

  return (
    <Link
      href="/pending"
      role="status"
      className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-40 inline-flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium shadow-lg md:bottom-4 md:left-[17rem] ${tone}`}
    >
      {icon}
      <span className="truncate">{text}</span>
    </Link>
  );
}
