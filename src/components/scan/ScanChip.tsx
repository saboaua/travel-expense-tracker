"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, FileText, Globe, Hammer, MapPin, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccess } from "@/lib/use-access";
import { PERSONAL_PROJECT_COLS } from "@/lib/columns";
import { peekQuickScan, setLastScanChoice, stashQuickScan } from "@/lib/quick-scan";
import { buildScanOptions, type ScanOption } from "@/lib/scan-destination";
import { ScanSheet } from "@/components/scan/ScanSheet";
import { formatDateRange } from "@/lib/utils";

const ICON = { trip: Briefcase, project: Hammer, ptrip: Globe, grocery: ShoppingCart, document: FileText } as const;

/**
 * Shown on the form a Scan or Upload opened. Says where the receipt is going and why, with a Change button that
 * moves the same photo somewhere else. Renders nothing when the page was not opened from Scan / Upload.
 */
export function ScanChip({ currentKey, label }: { currentKey: string; label: string }) {
  const router = useRouter();
  const { perms, loaded } = useAccess();
  const [state, setState] = useState<{ file: File; reason: string | null } | null>(null);
  const [options, setOptions] = useState<ScanOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(currentKey);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("quick") !== "1") return;
    peekQuickScan(currentKey).then(setState);
  }, [currentKey]);

  // The list is only needed when Change is tapped
  const openSheet = async () => {
    setOpen(true);
    if (options || !loaded) return;
    const supabase = createClient();
    const [t, p] = await Promise.all([
      supabase.from("trips").select("id, name, destination, start_date, end_date").eq("status", "active").order("start_date", { ascending: true }),
      supabase.from("personal_projects").select(PERSONAL_PROJECT_COLS).eq("status", "active").order("created_at", { ascending: false }),
    ]);
    setOptions(
      buildScanOptions({
        trips: (t.data || []).map((x) => ({ ...x, range: formatDateRange(x.start_date, x.end_date) })),
        projects: (p.data || []) as never,
        canTrips: perms.has("trips"),
        canPersonal: perms.has("personal"),
        canDocuments: perms.has("documents"),
      })
    );
  };

  if (!state) return null;
  const kind = currentKey.startsWith("trip:") ? "trip" : currentKey.startsWith("project:") ? "project" : currentKey.startsWith("ptrip:") ? "ptrip" : currentKey === "document" ? "document" : "grocery";
  const Icon = ICON[kind];

  const move = async () => {
    const next = options?.find((o) => o.key === pick);
    if (!next) return;
    if (next.key === currentKey) return setOpen(false);
    setBusy(true);
    setLastScanChoice(next.key);
    await stashQuickScan(state.file, next.key, "Changed by you");
    router.replace(`${next.href}?quick=1`);
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{label}</p>
          {state.reason && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{state.reason}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={openSheet} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-primary hover:bg-primary/10">
          Change
        </button>
      </div>
      {open && (
        <ScanSheet
          title="Move this receipt to…"
          options={options ?? []}
          selected={pick}
          onSelect={setPick}
          reason={null}
          preview={null}
          busy={busy || !options}
          onConfirm={move}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
