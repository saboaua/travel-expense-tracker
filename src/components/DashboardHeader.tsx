"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Cloud, Smartphone } from "lucide-react";
import { ScanLauncher } from "@/components/scan/ScanLauncher";
import type { HomePlace, ScanOption } from "@/lib/scan-destination";
import { NotificationBell } from "@/components/NotificationBell";
import type { AppNotification } from "@/lib/notifications";

type Props = {
  firstName: string | null;
  initials: string;
  avatarUrl: string | null;
  activeCount: number;
  /** Everywhere a receipt can go (trips, groceries, projects, documents) for this person */
  scanOptions: ScanOption[];
  /** The person's home place from their profile, so a scan at home suggests Personal */
  home?: HomePlace | null;
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

export function DashboardHeader({ firstName, initials, avatarUrl, activeCount, scanOptions, home = null, notifications = [], canUseTrips = true, weather }: Props) {
  const [greeting, setGreeting] = useState("Welcome back");
  const [online, setOnline] = useState(true);

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

  const name = firstName || "";
  const subtitle = `Track corporate expenses & itineraries \u2022 ${activeCount} active trip${activeCount !== 1 ? "s" : ""}`;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-end gap-3">
          <span data-testid="connection" data-online={online} className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${online ? "text-primary" : "text-amber-600"}`} title={online ? "Online: your receipts and trips are saved to the cloud as you go" : "You are offline: showing what is saved on this device. New expenses wait and are sent when you reconnect."}>
            {online ? <Cloud className="h-4 w-4" aria-hidden="true" /> : <Smartphone className="h-4 w-4" aria-hidden="true" />}
            {online ? "Online" : "Offline"}
          </span>
          <NotificationBell notifications={notifications} />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/profile" className="relative shrink-0" aria-label="Open your profile">
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" decoding="async" className="h-full w-full object-cover" />
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

        <ScanLauncher options={scanOptions} home={home} showNewTrip={canUseTrips} />
      </div>

    </>
  );
}
