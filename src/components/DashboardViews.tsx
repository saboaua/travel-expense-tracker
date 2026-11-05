"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
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

  const tab = (v: View, label: string) => (
    <button
      type="button"
      role="tab"
      id={`dash-tab-${v}`}
      aria-selected={view === v}
      aria-controls={`dash-panel-${v}`}
      onClick={() => choose(v)}
      className={`min-h-10 flex-1 rounded-lg px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${
        view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div role="tablist" aria-label="Dashboard view" className="flex w-full rounded-xl bg-muted p-1 sm:inline-flex sm:w-auto">
        {tab("business", "Business")}
        {tab("personal", "Personal")}
      </div>
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
