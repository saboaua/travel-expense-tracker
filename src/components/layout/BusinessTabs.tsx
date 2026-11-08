"use client";

import { usePathname } from "next/navigation";
import { FileText, Plane } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
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

  const active = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return <Tabs semantics="nav" label="Business sections" size="lg" value={active?.href ?? ""} options={tabs.map((t) => ({ id: t.href, label: t.label, icon: t.icon, href: t.href }))} />;
}
