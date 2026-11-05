"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Loader2, Plus, ShieldCheck, WifiOff, X } from "lucide-react";
import { compressReceiptImage } from "@/lib/compress-image";
import { stashQuickScan } from "@/lib/quick-scan";
import { NotificationBell } from "@/components/NotificationBell";
import type { AppNotification } from "@/lib/notifications";

export type HeaderTrip = { id: string; name: string; destination: string | null; range: string };

type Props = {
  firstName: string | null;
  initials: string;
  avatarUrl: string | null;
  activeCount: number;
  /** Active trips, the most likely receipt target first */
  trips: HeaderTrip[];
  notifications?: AppNotification[];
  /** Hide Quick Scan / New Trip for roles without the Trips feature */
  canUseTrips?: boolean;
  /** Weather panel, shown beside the greeting */
  weather?: ReactNode;
};

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({ firstName, initials, avatarUrl, activeCount, trips, notifications = [], canUseTrips = true, weather }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [greeting, setGreeting] = useState("Welcome back");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<File | null>(null); // photo waiting for a trip choice
  const [choice, setChoice] = useState<string>(trips[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const go = async (file: File, tripId: string) => {
    setBusy(true);
    const stored = await stashQuickScan(file, tripId);
    router.push(`/trips/${tripId}/add-expense${stored ? "?quick=1" : ""}`);
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    setNotice(null);
    if (trips.length === 0) return setNotice("Create a trip first, then scan your receipts into it.");

    setBusy(true);
    let processed = selected;
    try {
      processed = await compressReceiptImage(selected);
    } catch {
      // keep original
    }
    if (trips.length === 1) return go(processed, trips[0].id);
    setBusy(false);
    setChoice(trips[0].id);
    setPending(processed);
  };

  const name = firstName || "";
  const subtitle = `Track corporate expenses & itineraries \u2022 ${activeCount} active trip${activeCount !== 1 ? "s" : ""}`;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-end gap-3">
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${online ? "text-primary" : "text-amber-600"}`} title={online ? "Your receipts and trips are saved to the cloud as you go" : "You are offline. Changes will not save until you reconnect."}>
            {online ? <ShieldCheck className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {online ? "Auto-Sync ON" : "Offline"}
          </span>
          <NotificationBell notifications={notifications} />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/profile" className="relative shrink-0" aria-label="Open your profile">
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </span>
              <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card ${online ? "bg-emerald-500" : "bg-slate-400"}`} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold md:text-2xl">
                {greeting}
                {name ? `, ${name}` : ""}
              </h1>
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        {weather}
        </div>

        {canUseTrips && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:max-w-md">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-70"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            Quick Scan
          </button>
          <Link
            href="/trips/new"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <Plus className="h-5 w-5" />
            New Trip
          </Link>
        </div>
        )}

        {notice && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {notice}{" "}
            <Link href="/trips/new" className="font-semibold underline">
              New trip
            </Link>
          </p>
        )}
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      </div>

      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Choose a trip for this receipt">
          <div className="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Which trip is this receipt for?</h2>
              <button type="button" onClick={() => setPending(null)} className="rounded-lg p-1 text-muted-foreground" aria-label="Cancel">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {trips.map((t) => (
                <label key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${choice === t.id ? "border-primary bg-primary/5" : ""}`}>
                  <input type="radio" name="trip" value={t.id} checked={choice === t.id} onChange={() => setChoice(t.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[t.destination, t.range].filter(Boolean).join(" \u00b7 ")}</span>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || !choice}
              onClick={() => pending && go(pending, choice)}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue
            </button>
          </div>
        </div>
      )}
    </>
  );
}
