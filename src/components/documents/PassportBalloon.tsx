"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import type { RenewalAlert } from "@/lib/documents";
import { formatDate } from "@/lib/utils";

const SNOOZE_DAYS = 7;
const STYLES = {
  expired: "border-red-200 bg-red-50 text-red-900",
  critical: "border-red-200 bg-red-50 text-red-900",
  renew: "border-amber-200 bg-amber-50 text-amber-900",
} as const;

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
    <div role="status" className={`relative flex items-start gap-3 rounded-2xl border p-4 pr-10 shadow-sm ${STYLES[alert.level]}`}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70">
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
