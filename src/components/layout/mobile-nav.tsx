"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Briefcase, FolderOpen, User, Menu, X, Settings, Users, Activity, Shield, LogOut, Wallet, CircleHelp, Tv } from "lucide-react";
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

const baseItems = [
  { href: "/", label: "Home", icon: Home, feature: null, tone: "home" },
  { href: "/personal", label: "Personal", icon: Wallet, feature: "personal", tone: "spend" },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const { role, perms } = useAccess();
  const { personalEnabled } = useBrand();

  useEffect(() => { setOpen(false); }, [pathname]);

  const logout = async () => {
    await fetch("/api/auth/logout-event", { method: "POST" }).catch(() => {});
    await clearOfflineData();
    resetAccessCache();
    resetSharingCache();
    resetBrandCache();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  };

  const NAV_ICONS = { security: Activity, users: Users, settings: Settings, other: Settings } as const;
  const NAV_TONES: Record<string, IconTone> = { security: "security", users: "people", settings: "admin", other: "admin" };
  const adminItems = adminNavItems(role, perms).map((i) => ({ href: i.href, label: i.label, icon: NAV_ICONS[i.kind], tone: NAV_TONES[i.kind] ?? "admin" }));

  const personalShown = personalEnabled && perms.has("personal");
  const mainItems: { href: string; label: string; icon: typeof Home; tone: IconTone }[] = role === IPTV_CLIENT_ROLE ? [{ href: "/my-subscription", label: "My subscription", icon: Tv, tone: "subscriptions" as const }] : [
    ...baseItems.slice(0, 1),
    ...(perms.has("trips") || perms.has("reports") ? [{ href: perms.has("trips") ? "/trips" : "/reports", label: "Business", icon: Briefcase, tone: "travel" as const }] : []),
    ...baseItems.slice(1).filter((i) => (i.feature === null || perms.has(i.feature)) && (personalEnabled || i.href !== "/personal")),
    // Documents live inside Personal; a role that has Documents but not Personal still gets its own tab
    ...(perms.has("documents") && !personalShown ? [{ href: "/documents", label: "Docs", icon: FolderOpen, tone: "documents" as const }] : []),
  ];
  const menuActive = pathname.startsWith("/admin") || pathname.startsWith("/profile") || pathname.startsWith("/help");

  return (
    <>
      {open && (
        <div className="app-frame fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom)*0.3)] left-0 right-0 rounded-t-2xl border bg-card shadow-lg p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Menu</p>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg text-muted-foreground" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            {/* Profile above admin / management */}
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                pathname.startsWith("/profile") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
              )}
            >
              <IconTile tone="profile" className="h-8 w-8 rounded-lg"><User className="h-[18px] w-[18px]" /></IconTile> Profile
            </Link>
            <Link
              href="/help"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                pathname.startsWith("/help") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
              )}
            >
              <IconTile tone="help" className="h-8 w-8 rounded-lg"><CircleHelp className="h-[18px] w-[18px]" /></IconTile> Help
            </Link>

            {adminItems.length > 0 && (
              <div className="space-y-1">
                <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Shield className="h-3 w-3" /> {role === "admin" ? "Admin" : "Management"}</p>
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium", isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent")}>
                      <IconTile tone={item.tone} className="h-8 w-8 rounded-lg"><Icon className="h-[18px] w-[18px]" /></IconTile> {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="border-t pt-3 space-y-1">
              <ThemeToggle className="w-full justify-start gap-3 px-3" />
              <Button type="button" variant="ghost" className="w-full justify-start gap-3 px-3 text-red-600 hover:text-red-600" onClick={logout}>
                <IconTile tone="security" className="h-8 w-8 rounded-lg"><LogOut className="h-[18px] w-[18px]" /></IconTile> Sign out
              </Button>
            </div>
          </div>
        </div>
      )}

      <nav className="relative z-50 shrink-0 border-t bg-background pb-[calc(env(safe-area-inset-bottom)*0.3)] md:hidden print:hidden">
        <div className="flex items-center justify-around h-16">
          {mainItems.map((item) => {
            const isActive = item.label === "Business" ? pathname.startsWith("/trips") || pathname.startsWith("/reports") || pathname.startsWith("/projects") : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)) || (item.href === "/personal" && pathname.startsWith("/documents"));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} style={toneStyle(item.tone)} className={cn("flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-xs transition-colors", isActive ? "tone-ink font-semibold" : "text-muted-foreground hover:text-foreground")}>
                <span className={cn("flex h-7 w-14 items-center justify-center rounded-full", isActive ? "tone-tile" : "tone-ink opacity-80")}><Icon className="h-5 w-5" /></span> <span>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen((v) => !v)} style={toneStyle("admin")} className={cn("flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-xs transition-colors", open || menuActive ? "tone-ink font-semibold" : "text-muted-foreground")}>
            <span className={cn("flex h-7 w-14 items-center justify-center rounded-full", open || menuActive ? "tone-tile" : "tone-ink opacity-80")}><Menu className="h-5 w-5" /></span> <span>Menu</span>
          </button>
        </div>
      </nav>
    </>
  );
}
