"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Plane, FileText, FolderOpen, User, Menu, X, Settings, Users, Activity, Shield, LogOut, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { UserRole } from "@/lib/roles";
import { canCreateUsers, canViewSecurity, canManageAppSettings } from "@/lib/roles";

const baseItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/trips", label: "Trips", icon: Plane },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/documents", label: "Docs", icon: FolderOpen },
  { href: "/personal", label: "Personal", icon: Wallet },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<UserRole>("user");
  const [personalEnabled, setPersonalEnabled] = useState(true);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (data?.role) setRole(data.role as UserRole);
      const { data: flag } = await supabase.from("app_settings").select("personal_enabled").eq("id", 1).single();
      if (flag && flag.personal_enabled === false) setPersonalEnabled(false);
    }
    loadRole();
  }, [supabase]);

  const logout = async () => {
    await fetch("/api/auth/logout-event", { method: "POST" }).catch(() => {});
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  };

  const adminItems = [
    // Users is under Global Settings for admins; assistants still get a direct link
    ...(canCreateUsers(role) && !canManageAppSettings(role) ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
    ...(canViewSecurity(role) ? [{ href: "/admin/security", label: "Security", icon: Activity }] : []),
    ...(canManageAppSettings(role) ? [{ href: "/admin/settings", label: "Global Settings", icon: Settings }] : []),
  ];

  const mainItems = personalEnabled ? baseItems : baseItems.filter((i) => i.href !== "/personal");
  const menuActive = pathname.startsWith("/admin") || pathname.startsWith("/profile");

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute bottom-16 left-0 right-0 rounded-t-2xl border bg-card shadow-lg p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Menu</p>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md text-muted-foreground" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            {/* Profile above admin / management */}
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium",
                pathname.startsWith("/profile") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
              )}
            >
              <User className="h-5 w-5" /> Profile
            </Link>

            {adminItems.length > 0 && (
              <div className="space-y-1">
                <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Shield className="h-3 w-3" /> {role === "admin" ? "Admin" : "Management"}</p>
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium", isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent")}>
                      <Icon className="h-5 w-5" /> {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="border-t pt-3 space-y-1">
              <ThemeToggle className="w-full justify-start gap-3" />
              <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-red-600 hover:text-red-600" onClick={logout}>
                <LogOut className="h-5 w-5" /> Sign out
              </Button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
        <div className="flex items-center justify-around h-16">
          {mainItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors", isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="h-5 w-5" /> <span>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen((v) => !v)} className={cn("flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors", open || menuActive ? "text-primary font-medium" : "text-muted-foreground")}>
            <Menu className="h-5 w-5" /> <span>Menu</span>
          </button>
        </div>
      </nav>
    </>
  );
}
