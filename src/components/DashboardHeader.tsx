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
  const tripCount = `${activeCount} active trip${activeCount !== 1 ? "s" : ""}`;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
        {/* One row: who you are on the left, connection and notifications on the right. The weather drops below on a phone. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link href="/profile" className="relative shrink-0" aria-label="Open your profile">
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-primary text-base font-semibold text-primary-foreground md:h-14 md:w-14 md:text-lg">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" decoding="async" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card ${online ? "bg-emerald-500" : "bg-slate-400"}`} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold md:text-2xl">
              {greeting}
              {name ? `, ${name}` : ""}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              <span className="hidden md:inline">Track corporate expenses &amp; itineraries {"\u2022"} </span>
              {tripCount}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:order-3 md:gap-3">
            <span data-testid="connection" data-online={online} className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${online ? "text-primary" : "text-amber-600 dark:text-amber-400"}`} title={online ? "Online: your receipts and trips are saved to the cloud as you go" : "You are offline: showing what is saved on this device. New expenses wait and are sent when you reconnect."}>
              {online ? <Cloud className="h-4 w-4" aria-hidden="true" /> : <Smartphone className="h-4 w-4" aria-hidden="true" />}
              <span className={online ? "sr-only md:not-sr-only" : ""}>{online ? "Online" : "Offline"}</span>
            </span>
            <NotificationBell notifications={notifications} />
          </div>
          {/* Empty when there is no weather to show, so it takes no room */}
          <div className="basis-full empty:hidden md:order-2 md:basis-auto">{weather}</div>
        </div>

        <ScanLauncher options={scanOptions} home={home} showNewTrip={canUseTrips} />
      </div>
    </>
  );
}
