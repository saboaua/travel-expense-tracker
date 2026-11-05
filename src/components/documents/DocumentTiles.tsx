"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, FileText, IdCard, Plane, Plus, ShieldCheck, Stamp, Syringe, Hotel, Loader2 } from "lucide-react";
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
    setViewing({ title: t.title, url: data.signedUrl, path: t.filePath });
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
          {tiles.map((t) => {
            const Icon = ICONS[t.kind] ?? FileText;
            return (
              <Card key={t.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">{t.kindLabel}</p>
                    <p className="truncate text-sm font-bold" title={t.title}>{t.title}</p>
                  </div>
                  {t.level !== "none" && <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CHIP[t.level]}`}>{t.statusLabel}</span>}
                </div>
                <div className="space-y-0.5 text-sm text-muted-foreground">
                  {t.country && <p className="truncate">Issued by {t.country}</p>}
                  {t.number && <p>No. {t.number}</p>}
                  <p className="font-semibold text-foreground">
                    {t.expiry ? `${t.level === "expired" ? "Expired" : "Expires"} ${formatDate(t.expiry)}` : "No expiry date"}
                  </p>
                </div>
                {t.filePath ? (
                  <button
                    type="button"
                    onClick={() => open(t)}
                    disabled={busy === t.id}
                    className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-70"
                  >
                    {busy === t.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    View file
                  </button>
                ) : (
                  <Link href="/documents" className="mt-auto inline-flex h-10 items-center justify-center rounded-lg border text-sm font-medium text-muted-foreground hover:bg-muted">
                    No file attached
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {viewing && <DocumentViewer {...viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
