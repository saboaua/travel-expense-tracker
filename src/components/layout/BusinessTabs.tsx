"use client";

import { usePathname } from "next/navigation";
import { FileText, Plane } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { useAccess } from "@/lib/use-access";

/** The title of the Business area, like the Personal page has: shown above the Trips / Reports switch. */
export function BusinessHeader() {
  return <PageHeader title="Business" description="Plan business trips, track their expenses and export your travel reports." />;
}

/**
 * Switch between the two business sections, with the page's main action beside it (below it on a phone).
 * `title` and `description` name the section for screen readers: the visible heading stays "Business".
 */
export function BusinessTabs({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const { perms, loaded } = useAccess(pathname);
  const tabs = [
    { href: "/trips", label: "Trips", icon: Plane, on: perms.has("trips") },
    { href: "/reports", label: "Reports", icon: FileText, on: perms.has("reports") },
  ].filter((t) => t.on);

  const active = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Reserve the height while the role loads so the page does not jump; nothing to switch with only one section */}
        {!loaded ? <div className="h-14" aria-hidden="true" /> : tabs.length < 2 ? <span /> : (
          <Tabs semantics="nav" label="Business sections" size="lg" value={active?.href ?? ""} options={tabs.map((t) => ({ id: t.href, label: t.label, icon: t.icon, href: t.href }))} />
        )}
        {actions && <div className="flex flex-wrap items-center gap-3 [&>*]:max-sm:w-full">{actions}</div>}
      </div>
      <h2 className="sr-only">{title}{description ? `: ${description}` : ""}</h2>
    </>
  );
}
