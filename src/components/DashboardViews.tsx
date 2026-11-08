"use client";

import { Tabs } from "@/components/ui/tabs";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { Briefcase, Wallet } from "lucide-react";
import type { DashboardProject, DashboardRow } from "@/lib/personal/dashboard";

const PersonalDashboard = dynamic(() => import("@/components/personal/PersonalDashboard"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-muted-foreground">Loading your personal dashboard…</p>,
});

type View = "business" | "personal";
const KEY = "dashboard-view";

/**
 * Sits right under the welcome section. The business dashboard (children) is left exactly as it is; this only decides
 * whether it or the personal analytics is shown. The page renders it only for roles that have "Personal dashboard".
 */
export function DashboardViews({ rows, projects, today, personalTiles, children }: { rows: DashboardRow[]; projects: DashboardProject[]; today: string; /** Groceries / Home Projects / Personal Travel tiles, top of the Personal view */ personalTiles?: ReactNode; children: ReactNode }) {
  const [view, setView] = useState<View>("business");

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "personal") setView("personal");
    } catch {
      /* storage blocked: stay on business */
    }
  }, []);

  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <Tabs
        label="Dashboard view"
        size="lg"
        value={view}
        onChange={(v) => choose(v as View)}
        idPrefix="dash-tab"
        panelPrefix="dash-panel"
        options={[{ id: "business", label: "Business", icon: Briefcase }, { id: "personal", label: "Personal", icon: Wallet }]}
      />
      <div id="dash-panel-business" role="tabpanel" aria-labelledby="dash-tab-business" hidden={view !== "business"} className="space-y-6">
        {children}
      </div>
      {view === "personal" && (
        <div id="dash-panel-personal" role="tabpanel" aria-labelledby="dash-tab-personal" className="space-y-6">
          {personalTiles}
          <PersonalDashboard rows={rows} projects={projects} today={today} />
        </div>
      )}
    </>
  );
}
