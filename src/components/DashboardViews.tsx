"use client";

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

  const tab = (v: View, label: string, Icon: typeof Briefcase) => (
    <button
      type="button"
      role="tab"
      id={`dash-tab-${v}`}
      aria-selected={view === v}
      aria-controls={`dash-panel-${v}`}
      onClick={() => choose(v)}
      className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${
        view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className={`h-5 w-5 ${view === v ? "text-primary" : ""}`} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <>
      <div role="tablist" aria-label="Dashboard view" className="flex w-full rounded-2xl bg-muted p-1 sm:inline-flex sm:w-auto">
        {tab("business", "Business", Briefcase)}
        {tab("personal", "Personal", Wallet)}
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
