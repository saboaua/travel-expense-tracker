"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccess } from "@/lib/use-access";

/** Switch between the two business sections. Shown at the top of the Trips and Reports lists. */
export function BusinessTabs() {
  const pathname = usePathname();
  const { perms, loaded } = useAccess(pathname);
  const tabs = [
    { href: "/trips", label: "Trips", icon: Plane, on: perms.has("trips") },
    { href: "/reports", label: "Reports", icon: FileText, on: perms.has("reports") },
  ].filter((t) => t.on);

  // Reserve the height while the role loads so the page does not jump; nothing to switch with only one section
  if (!loaded) return <div className="h-14" aria-hidden="true" />;
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="Business sections" className="flex w-full rounded-2xl bg-muted p-1 sm:inline-flex sm:w-auto">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("h-5 w-5", active && "text-primary")} aria-hidden="true" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
