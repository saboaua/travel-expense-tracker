"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Briefcase, FolderOpen, LogOut, User, Shield, Users, Activity, Settings as SettingsIcon, Wallet, CircleHelp, Tv,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { clearOfflineData } from "@/lib/offline-store";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { adminNavItems, IPTV_CLIENT_ROLE } from "@/lib/access";
import { resetAccessCache, useAccess } from "@/lib/use-access";
import { resetSharingCache } from "@/lib/use-sharing";
import { resetBrandCache, useBrand } from "@/lib/use-brand";
import { toneStyle, type IconTone } from "@/lib/icon-tones";
import { IconTile } from "@/components/ui/icon-tile";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { role, perms } = useAccess();
  const { appName, logoUrl, personalEnabled } = useBrand();

  const handleLogout = async () => {
    await fetch("/api/auth/logout-event", { method: "POST" }).catch(() => {});
    await clearOfflineData();
    resetAccessCache();
    resetSharingCache();
    resetBrandCache();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const userNav = role === IPTV_CLIENT_ROLE ? [{ href: "/my-subscription", label: "My subscription", icon: Tv, tone: "subscriptions" as IconTone }] : [
    { href: "/", label: "Dashboard", icon: Home, tone: "home" as IconTone },
    // Trips and Reports share one Business link; the switch between them is at the top of each page
    ...(perms.has("trips") || perms.has("reports") ? [{ href: perms.has("trips") ? "/trips" : "/reports", label: "Business", icon: Briefcase, tone: "travel" as IconTone }] : []),
    ...(personalEnabled && perms.has("personal") ? [{ href: "/personal", label: "Personal", icon: Wallet, tone: "spend" as IconTone }] : []),
    // Documents live inside Personal; a role that has Documents but not Personal still gets its own link
    ...(perms.has("documents") && !(personalEnabled && perms.has("personal")) ? [{ href: "/documents", label: "Documents", icon: FolderOpen, tone: "documents" as IconTone }] : []),
  ];

  const NAV_ICONS = { security: Activity, users: Users, settings: SettingsIcon, other: SettingsIcon } as const;
  const NAV_TONES: Record<string, IconTone> = { security: "security", users: "people", settings: "admin", other: "admin" };
  const adminNav = adminNavItems(role, perms).map((i) => ({ href: i.href, label: i.label, icon: NAV_ICONS[i.kind], tone: NAV_TONES[i.kind] ?? ("admin" as IconTone) }));

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r bg-card">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-16 px-4 border-b gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" decoding="async" className="h-8 w-8 object-contain rounded shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold shrink-0">TE</div>
          )}
          <span className="font-semibold text-base truncate">{appName}</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {userNav.map((item) => {
            const isActive = item.label === "Business" ? pathname.startsWith("/trips") || pathname.startsWith("/reports") : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)) || (item.href === "/personal" && pathname.startsWith("/documents"));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} style={toneStyle(item.tone)} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors", isActive ? "tone-tile font-semibold" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
                <IconTile tone={item.tone} className="h-8 w-8 rounded-lg"><Icon className="h-[18px] w-[18px]" /></IconTile> {item.label}
              </Link>
            );
          })}
          {adminNav.length > 0 && (
            <>
              <div className="pt-4 pb-2 px-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Shield className="h-3 w-3" /> {role === "admin" ? "Admin" : "Management"}</p>
              </div>
              {adminNav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} style={toneStyle(item.tone)} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors", isActive ? "tone-tile font-semibold" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
                    <IconTile tone={item.tone} className="h-8 w-8 rounded-lg"><Icon className="h-[18px] w-[18px]" /></IconTile> {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-3 border-t space-y-1">
          {/* Compact profile icon + role above dark mode (avoids repeating the welcome header avatar) */}
          <Link
            href="/profile"
            title="Your profile"
            style={toneStyle("profile")}
            className={cn(
              "flex h-10 w-full items-center justify-start gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              pathname.startsWith("/profile") ? "tone-tile font-semibold" : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <IconTile tone="profile" className="h-8 w-8 rounded-lg"><User className="h-[18px] w-[18px]" /></IconTile>
            <span className="truncate">Profile</span>
          </Link>
          <Link
            href="/help"
            style={toneStyle("help")}
            className={cn(
              "flex h-10 w-full items-center justify-start gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              pathname.startsWith("/help") ? "tone-tile font-semibold" : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <IconTile tone="help" className="h-8 w-8 rounded-lg"><CircleHelp className="h-[18px] w-[18px]" /></IconTile>
            <span className="truncate">Help</span>
          </Link>
          <ThemeToggle className="w-full justify-start gap-3 px-3" />
          <Button variant="ghost" className="w-full justify-start gap-3 px-3" onClick={handleLogout}>
            <IconTile tone="security" className="h-8 w-8 rounded-lg"><LogOut className="h-[18px] w-[18px]" /></IconTile> Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
