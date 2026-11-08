"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import type { RenewalAlert } from "@/lib/documents";
import { daysBetween, formatDate, todayISO } from "@/lib/utils";

const SNOOZE_DAYS = 7;
// Three tones: red only when it needs action now (expired, or about to be, or it blocks a booked trip), amber while there is time
const TONES = {
  urgent: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
  soon: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
} as const;
const URGENT_DAYS = 90;

export function balloonTone(alert: Pick<RenewalAlert, "level" | "expiry" | "tripConflict">, today: string): keyof typeof TONES {
  if (alert.level === "expired" || alert.tripConflict) return "urgent";
  return daysBetween(today, alert.expiry) <= URGENT_DAYS ? "urgent" : "soon";
}

/** Dashboard balloon that tells the user to renew their passport. Dismissing hides it for a week. */
export function PassportBalloon({ alert }: { alert: RenewalAlert }) {
  const key = `passport-balloon:${alert.expiry}:${alert.level}`;
  const [hidden, setHidden] = useState(true); // hidden until we know it was not dismissed

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(key));
      setHidden(Boolean(at) && Date.now() - at < SNOOZE_DAYS * 86_400_000 && alert.level !== "expired");
    } catch {
      setHidden(false);
    }
  }, [key, alert.level]);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(key, String(Date.now())); } catch { /* private mode: it simply comes back next visit */ }
  };

  return (
    <div role="status" className={`relative flex items-start gap-3 rounded-xl border p-4 pr-10 shadow-sm ${TONES[balloonTone(alert, todayISO())]}`}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 dark:bg-white/10">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{alert.title}</p>
        <p className="mt-0.5 opacity-90">
          Expires {formatDate(alert.expiry)}. {alert.message}
          {alert.tripConflict && alert.title !== "Your passport may be too short for a trip" ? ` ${alert.tripConflict.tripName} needs it valid until ${formatDate(alert.tripConflict.mustBeValidUntil)}.` : ""}
        </p>
        <Link href="/documents" className="mt-2 inline-block text-sm font-semibold underline underline-offset-2">Open my documents</Link>
      </div>
      {alert.level !== "expired" && (
        <button onClick={dismiss} className="absolute right-3 top-3 rounded p-1 opacity-70 hover:opacity-100" aria-label="Dismiss for a week">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
