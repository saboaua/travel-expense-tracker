"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Download, Eye, FileText, IdCard, Plane, Plus, ShieldCheck, Stamp, Syringe, Hotel, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
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
};

const ICONS: Record<string, typeof FileText> = {
  passport: BadgeCheck,
  visa: Stamp,
  id: IdCard,
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

/** Travel documents on the business page: one tile per saved document, soonest to expire first. */
export function DocumentTiles({ tiles, total }: { tiles: DocTile[]; total: number }) {
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

  const download = async (t: DocTile) => {
    if (!t.filePath) return;
    setBusy(t.id);
    setError(null);
    const name = t.filePath.split("/").pop() || "document";
    const { data, error: err } = await createClient().storage.from(DOC_BUCKET).createSignedUrl(t.filePath, 3600, { download: name });
    setBusy(null);
    if (err || !data?.signedUrl) return setError("Could not download that file. Check your connection and try again.");
    window.location.assign(data.signedUrl);
  };

  return (
    <section aria-labelledby="doc-tiles-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="doc-tiles-heading" className="text-lg font-bold">Travel documents</h2>
          <p className="text-sm text-muted-foreground">Soonest to expire first</p>
        </div>
        <Link href="/documents" className="inline-flex h-10 shrink-0 items-center rounded-lg border bg-card px-4 text-sm font-semibold text-primary hover:bg-muted">
          {total > tiles.length ? `View all (${total})` : "View all"}
        </Link>
      </div>

      {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

      {tiles.length === 0 ? (
        <Link href="/documents" className="flex min-h-[8rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground sm:max-w-xs">
          <Plus className="h-6 w-6 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">Add a document</span>
          <span className="text-xs">Passport, visa, insurance…</span>
        </Link>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => {
            const Icon = ICONS[t.kind] ?? FileText;
            const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60";
            return (
              <Card key={t.id} className="p-3.5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="truncate text-sm font-bold" title={t.kindLabel}>{t.kindLabel}</p>
                      {t.level !== "none" && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[t.level]}`}>{t.statusLabel}</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{t.country ?? "\u00a0"}</p>
                  </div>
                  {t.filePath && (
                    <div className="-mr-1 -mt-1 flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => open(t)} disabled={busy === t.id} className={iconBtn} aria-label={`View ${t.kindLabel}`}>
                        {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                      <button type="button" onClick={() => download(t)} disabled={busy === t.id} className={iconBtn} aria-label={`Download ${t.kindLabel}`}>
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
                <dl className="mt-3 flex gap-6 border-t pt-2.5 text-sm">
                  {t.number && (
                    <div className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.numberLabel}</dt>
                      <dd className="font-semibold">{t.number}</dd>
                    </div>
                  )}
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.level === "expired" ? "Expired" : "Expires"}</dt>
                    <dd className="font-semibold">
                      {t.expiry ? formatDate(t.expiry) : "No expiry date"}
                      {t.countdown && <span className={`ml-1 font-medium ${t.level === "ok" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}`}>({t.countdown})</span>}
                    </dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}

      {viewing && <DocumentViewer {...viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
