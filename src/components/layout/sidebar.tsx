"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Briefcase, FolderOpen, LogOut, User, Shield, Users, Activity, Settings as SettingsIcon, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { adminNavItems } from "@/lib/access";
import { useAccess } from "@/lib/use-access";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { role, perms } = useAccess(pathname);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState("Expense Tracker");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [personalEnabled, setPersonalEnabled] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: settings } = await supabase.from("app_settings").select("app_name, logo_url, primary_color").eq("id", 1).single();
      if (settings) {
        setAppName(settings.app_name || "Expense Tracker");
        setLogoUrl(settings.logo_url);
        if (settings.primary_color) {
          setPrimaryColor(settings.primary_color);
          document.documentElement.style.setProperty("--brand-primary", settings.primary_color);
        }
      }
      // Separate query so the sidebar keeps working before the personal migration has been run
      const { data: flag } = await supabase.from("app_settings").select("personal_enabled").eq("id", 1).single();
      if (flag && flag.personal_enabled === false) setPersonalEnabled(false);
      if (!user) return;
    }
    load();
  }, [supabase, pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout-event", { method: "POST" }).catch(() => {});
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const userNav = [
    { href: "/", label: "Dashboard", icon: Home },
    // Trips and Reports share one Business link; the switch between them is at the top of each page
    ...(perms.has("trips") || perms.has("reports") ? [{ href: perms.has("trips") ? "/trips" : "/reports", label: "Business", icon: Briefcase }] : []),
    ...(personalEnabled && perms.has("personal") ? [{ href: "/personal", label: "Personal", icon: Wallet }] : []),
    // Documents live inside Personal; a role that has Documents but not Personal still gets its own link
    ...(perms.has("documents") && !(personalEnabled && perms.has("personal")) ? [{ href: "/documents", label: "Documents", icon: FolderOpen }] : []),
  ];

  const NAV_ICONS = { security: Activity, users: Users, settings: SettingsIcon, other: SettingsIcon } as const;
  const adminNav = adminNavItems(role, perms).map((i) => ({ href: i.href, label: i.label, icon: NAV_ICONS[i.kind] }));

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r bg-card">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-16 px-4 border-b gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 object-contain rounded shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: primaryColor }}>TE</div>
          )}
          <span className="font-semibold text-base truncate">{appName}</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {userNav.map((item) => {
            const isActive = item.label === "Business" ? pathname.startsWith("/trips") || pathname.startsWith("/reports") : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)) || (item.href === "/personal" && pathname.startsWith("/documents"));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors", isActive ? "text-white" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")} style={isActive ? { backgroundColor: primaryColor } : undefined}>
                <Icon className="h-5 w-5" /> {item.label}
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
                  <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors", isActive ? "text-white" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")} style={isActive ? { backgroundColor: primaryColor } : undefined}>
                    <Icon className="h-5 w-5" /> {item.label}
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
            className={cn(
              "flex h-10 w-full items-center justify-start gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              pathname.startsWith("/profile") ? "text-white" : "hover:bg-accent hover:text-accent-foreground"
            )}
            style={pathname.startsWith("/profile") ? { backgroundColor: primaryColor } : undefined}
          >
            <User className="h-5 w-5 shrink-0" />
            <span className="truncate">Profile</span>
          </Link>
          <ThemeToggle className="w-full justify-start gap-3" />
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleLogout}>
            <LogOut className="h-5 w-5" /> Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
