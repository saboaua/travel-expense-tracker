"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Plane, FileText, Settings, LogOut, User, Shield, Users, Activity, Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { UserRole } from "@/lib/roles";
import { canCreateUsers, canViewSecurity, canManageAppSettings } from "@/lib/roles";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("user");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState("Expense Tracker");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");

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
      if (!user) return;
      const { data } = await supabase.from("profiles").select("first_name, last_name, full_name, avatar_url, role").eq("id", user.id).single();
      if (data) {
        const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.full_name || user.email?.split("@")[0] || "User";
        setDisplayName(name);
        setAvatarUrl(data.avatar_url);
        setRole((data.role as UserRole) || "user");
      } else {
        setDisplayName(user.email?.split("@")[0] || "User");
      }
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
    { href: "/trips", label: "Trips", icon: Plane },
    { href: "/reports", label: "Reports", icon: FileText },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const adminNav = [
    ...(canCreateUsers(role) ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
    ...(canViewSecurity(role) ? [{ href: "/admin/security", label: "Security", icon: Activity }] : []),
    ...(canManageAppSettings(role) ? [{ href: "/admin/settings", label: "App Settings", icon: SettingsIcon }] : []),
  ];

  const roleLabel = role === "admin" ? "Admin" : role === "assistant" ? "Assistant" : null;

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r bg-card">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-16 px-4 border-b gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 object-contain rounded shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: primaryColor }}>TE</div>
          )}
          <span className="font-semibold text-base truncate">{appName}</span>
        </div>

        <Link href="/profile" className="flex items-center gap-3 px-4 py-3 border-b hover:bg-accent transition-colors">
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName || "User"} className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{displayName || "Loading..."}</p>
            <p className="text-xs text-muted-foreground">{roleLabel ? `${roleLabel} \u00b7 Profile` : "View profile"}</p>
          </div>
        </Link>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {userNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors", isActive ? "text-white" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")} style={isActive ? { backgroundColor: primaryColor } : undefined}>
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
                  <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors", isActive ? "text-white" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")} style={isActive ? { backgroundColor: primaryColor } : undefined}>
                    <Icon className="h-5 w-5" /> {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-3 border-t space-y-1">
          <ThemeToggle className="w-full justify-start gap-3" />
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleLogout}>
            <LogOut className="h-5 w-5" /> Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
