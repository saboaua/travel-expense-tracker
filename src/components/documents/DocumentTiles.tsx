"use client";

import { useState } from "react";
import { IconTile } from "@/components/ui/icon-tile";
import { BadgeCheck, Car, FileText, IdCard, Plane, ShieldCheck, Stamp, Syringe, Hotel, Loader2 } from "lucide-react";
import { EmptyTile, SectionCard } from "@/components/ui/section-card";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import { createClient } from "@/lib/supabase/client";
import { DOC_BUCKET } from "@/lib/document-upload";
import { formatDate } from "@/lib/utils";
import type { DocLevel } from "@/lib/documents";

export type DocTile = {
  id: string;
  kindLabel: string;
  kind: string;
  title: string;
  country: string | null;
  /** Already masked, e.g. "•••• 4821" */
  number: string | null;
  expiry: string | null;
  level: DocLevel;
  statusLabel: string;
  filePath: string | null;
  /** "Application ID", "Document No.", ... */
  numberLabel: string;
  /** "20 days" when the end is near, else null */
  countdown: string | null;
  /** Which dashboard lists it ("Show on" in Documents) */
  scope?: "personal" | "business" | "both";
};

const ICONS: Record<string, typeof FileText> = {
  passport: BadgeCheck,
  visa: Stamp,
  id: IdCard,
  license: Car,
  ticket: Plane,
  booking: Hotel,
  insurance: ShieldCheck,
  vaccination: Syringe,
};

const CHIP: Record<DocLevel, string> = {
  ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  soon: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  critical: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  expired: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  none: "",
};

/** Documents on Home: one card of rows, soonest to expire first. Tapping a row opens the file when there is one. */
export function DocumentTiles({ tiles, total, idPrefix = "doc-tiles" }: { tiles: DocTile[]; total: number; /** Two lists on one page (Personal and Business) need their own heading ids */ idPrefix?: string; gridClass?: string }) {
  const [viewing, setViewing] = useState<{ title: string; url: string; path: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (t: DocTile) => {
    if (!t.filePath) return;
    setBusy(t.id);
    setError(null);
    const { data, error: err } = await createClient().storage.from(DOC_BUCKET).createSignedUrl(t.filePath, 3600);
    setBusy(null);
    if (err || !data?.signedUrl) return setError("Could not open that file. Check your connection and try again.");
    setViewing({ title: t.kindLabel, url: data.signedUrl, path: t.filePath });
  };

  return (
    <SectionCard id={`${idPrefix}-heading`} testId={idPrefix} title="Documents" href="/documents" seeAll={total > tiles.length ? `See all (${total})` : "See all"}>
      {error && <p role="alert" className="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">{error}</p>}

      {tiles.length === 0 ? (
        <EmptyTile href="/documents" title="Add a document" text="Passport, ID, driver's license..." />
      ) : (
        <ul className="divide-y">
          {tiles.map((t) => {
            const Icon = ICONS[t.kind] ?? FileText;
            const body = (
              <>
                <IconTile tone="documents" className="h-10 w-10 rounded-xl">
                  {busy === t.id ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Icon className="h-5 w-5" />}
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold" title={t.kindLabel}>{t.kindLabel}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[t.country, t.number ? `${t.numberLabel} ${t.number}` : null].filter(Boolean).join(" · ") || "\u00a0"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t.level === "expired" ? "Expired" : "Expires"} {t.expiry ? formatDate(t.expiry) : "(no expiry date)"}
                    {t.countdown && <span className={t.level === "ok" ? "" : " font-medium text-amber-700 dark:text-amber-300"}> ({t.countdown})</span>}
                  </span>
                </span>
                {t.level !== "none" && <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${CHIP[t.level]}`}>{t.statusLabel}</span>}
              </>
            );
            const row = "flex min-h-[60px] w-full items-center gap-3 py-2 text-left";
            return (
              <li key={t.id}>
                {t.filePath ? (
                  <button type="button" onClick={() => open(t)} disabled={busy === t.id} aria-label={`View ${t.kindLabel}`} className={`${row} transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70`}>{body}</button>
                ) : (
                  <div className={row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {viewing && <DocumentViewer {...viewing} onClose={() => setViewing(null)} />}
    </SectionCard>
  );
}
