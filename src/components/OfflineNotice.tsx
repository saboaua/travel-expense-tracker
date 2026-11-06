"use client";

import { CloudOff } from "lucide-react";
import { useOnline } from "@/lib/use-online";

/** Shown on a screen that is displaying the copy saved on the phone, or when the connection is gone. */
export function OfflineNotice({ savedAt, writable = false }: { savedAt: number | null; writable?: boolean }) {
  const online = useOnline();
  if (online && savedAt === null) return null;
  const when = savedAt ? new Date(savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <p role="status" data-testid="offline-notice" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{online ? "Could not reach the server." : "You are offline."} Showing the copy saved on this phone{when ? ` (${when})` : ""}. {writable ? "Changes you make are kept here and sent when you are back online." : "Adding or changing things needs a connection for now."}</span>
    </p>
  );
}
