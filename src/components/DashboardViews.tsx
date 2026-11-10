"use client";

import { Tabs } from "@/components/ui/tabs";
import PersonalHome from "@/components/personal/PersonalHome";
import { useEffect, useState, type ReactNode } from "react";
import { Briefcase, Wallet } from "lucide-react";
import type { DashboardProject, DashboardRow } from "@/lib/personal/dashboard";
import type { DocTile } from "@/components/documents/DocumentTiles";

type View = "business" | "personal";
const KEY = "dashboard-view";

/**
 * Sits right under the welcome section. The business dashboard (children) is left exactly as it is; this only decides
 * whether it or the personal analytics is shown. The page renders it only for roles that have "Personal dashboard".
 */
export function DashboardViews({ rows, projects, today, docs, docTotal, canDocuments, children }: { rows: DashboardRow[]; projects: DashboardProject[]; today: string; docs: DocTile[]; docTotal: number; canDocuments: boolean; children: ReactNode }) {
  const [view, setView] = useState<View>("personal");

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "business") setView("business");
    } catch {
      /* storage blocked: stay on personal */
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
        options={[{ id: "personal", label: "Personal", icon: Wallet }, { id: "business", label: "Business", icon: Briefcase }]}
      />
      <div id="dash-panel-business" role="tabpanel" aria-labelledby="dash-tab-business" hidden={view !== "business"} className="space-y-6">
        {children}
      </div>
      {view === "personal" && (
        <div id="dash-panel-personal" role="tabpanel" aria-labelledby="dash-tab-personal" className="space-y-6">
          <PersonalHome rows={rows} projects={projects} today={today} docs={docs} docTotal={docTotal} canDocuments={canDocuments} />
        </div>
      )}
    </>
  );
}
