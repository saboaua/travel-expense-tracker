"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, BellRing, Info, X } from "lucide-react";
import { badgeLabel, isDismissible, topSeverity, visibleNotifications, type AppNotification, type Severity } from "@/lib/notifications";

const STORAGE_KEY = "notifications-dismissed";

const BADGE: Record<Severity, string> = { urgent: "bg-red-600 text-white", warning: "bg-amber-500 text-white", info: "bg-primary text-primary-foreground" };
const ICON_WRAP: Record<Severity, string> = { urgent: "bg-red-100 text-red-700", warning: "bg-amber-100 text-amber-800", info: "bg-primary/10 text-primary" };
const ICON: Record<Severity, typeof Info> = { urgent: AlertTriangle, warning: BellRing, info: Info };

function readDismissed(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/**
 * Bell with a count bubble. The panel lists what needs attention, most important first.
 * Urgent items can't be dismissed; the others are snoozed for a week. Everything is keyboard
 * reachable, Escape closes the panel and focus returns to the bell.
 */
export function NotificationBell({ notifications }: { notifications: AppNotification[] }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => { setDismissed(readDismissed()); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = useMemo(() => visibleNotifications(notifications, dismissed, Date.now()), [notifications, dismissed]);
  const top = topSeverity(visible);

  const dismiss = (id: string) => {
    const next = { ...dismissed, [id]: Date.now() };
    setDismissed(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode: comes back next visit */ }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={visible.length ? `Notifications, ${visible.length} need attention` : "Notifications, nothing new"}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Bell className="h-5 w-5" />
        {top && (
          <span className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none ring-2 ring-card ${BADGE[top]} ${top === "urgent" ? "motion-safe:animate-pulse" : ""}`} aria-hidden="true">
            {badgeLabel(visible.length)}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <span className="text-xs text-muted-foreground">{visible.length ? `${visible.length} need attention` : "All caught up"}</span>
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing needs your attention right now.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto">
              {visible.map((n) => {
                const Icon = ICON[n.severity];
                return (
                  <li key={n.id} className="flex gap-3 p-4">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON_WRAP[n.severity]}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                      <Link href={n.href} onClick={() => setOpen(false)} className="mt-1.5 inline-block text-xs font-semibold text-primary hover:underline">
                        {n.cta}
                      </Link>
                    </div>
                    {isDismissible(n) && (
                      <button type="button" onClick={() => dismiss(n.id)} className="h-7 w-7 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label={`Dismiss: ${n.title}`} title="Hide for a week">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
