"use client";

import { usePathname } from "next/navigation";
import { Crown, FileText, ListChecks } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { usePro } from "@/lib/use-pro";

/**
 * Switch between the two Personal sections, like Trips / Reports in Business: the Organizer is where everything is set up
 * (the dashboard reads from it), Reports is the Pro section with the spending numbers and the exports.
 */
export function PersonalTabs({ actions }: { actions?: React.ReactNode }) {
  const pathname = usePathname();
  const pro = usePro();
  const onReports = pathname === "/personal/reports" || pathname.startsWith("/personal/reports/");
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Tabs
        semantics="nav"
        label="Personal sections"
        size="lg"
        value={onReports ? "/personal/reports" : "/personal"}
        options={[
          { id: "/personal", label: "Organizer", icon: ListChecks, iconTone: "spend", href: "/personal" },
          { id: "/personal/reports", label: <>Reports{pro === false && <Crown className="h-4 w-4 text-amber-600" aria-label="Pro" />}</>, icon: FileText, iconTone: "reports", href: "/personal/reports" },
        ]}
      />
      {actions && <div className="flex flex-wrap items-center gap-3 [&>*]:max-sm:w-full">{actions}</div>}
    </div>
  );
}
