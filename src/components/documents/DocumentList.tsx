"use client";

import { Tabs } from "@/components/ui/tabs";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Eye, EyeOff, FileText, FolderOpen, Image as ImageIcon, MoreVertical, Pencil, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { DOC_SCOPES, docScope, documentStatus, expiryMeter, kindLabel, maskNumber, type DocLevel, type TravelDocument } from "@/lib/documents";

const CHIP: Record<DocLevel, string> = {
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  soon: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  none: "bg-muted text-muted-foreground",
};
const BAR: Record<DocLevel, string> = { ok: "bg-emerald-500", soon: "bg-amber-500", critical: "bg-red-500", expired: "bg-red-500", none: "bg-muted-foreground" };
const ACCENT = BAR;
const ICON_TILE: Record<DocLevel, string> = {
  ok: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  none: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  soon: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};
const CAPTION: Record<DocLevel, string> = { ok: "text-emerald-700 dark:text-emerald-300", none: "text-muted-foreground", soon: "text-amber-800 dark:text-amber-300", critical: "text-red-700 dark:text-red-300", expired: "text-red-700 dark:text-red-300" };
const NEEDS_ATTENTION: DocLevel[] = ["soon", "critical", "expired"];

type Filter = "all" | "attention" | "valid";

function Tile({ icon: Icon, label, value, hint, tone }: { icon: typeof Clock; label: string; value: number; hint: string; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground sm:text-sm">{label}</span>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg sm:h-8 sm:w-8", tone)}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      </div>
      <p className="mt-2 text-2xl font-bold leading-none tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function SectionTitle({ dot, title, count, right }: { dot: string; title: string; count: number; right?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
        <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden="true" />
        {title}
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{count}</span>
      </h2>
      {right && <span className="text-sm text-muted-foreground">{right}</span>}
    </div>
  );
}

/** View, Edit and Delete: three buttons on a wide screen, one menu on a phone. */
function RowActions({ doc, canView, onView, onEdit, onRemove }: { doc: TravelDocument; canView: boolean; onView: () => void; onEdit: () => void; onRemove: () => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [up, setUp] = useState(false);
  const close = () => menu.current?.removeAttribute("open");
  // Open upward when the menu would run under the bottom bar or off the screen
  const placeMenu = () => {
    const box = menu.current?.getBoundingClientRect();
    if (box && menu.current?.open) setUp(window.innerHeight - 96 - box.bottom < 170 && box.top > 170);
  };
  const item = "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent";
  return (
    <>
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        {doc.file_path && (
          <Button type="button" variant="outline" size="icon" disabled={!canView} onClick={onView} aria-label={`View ${doc.title}`} title={canView ? "View" : "Preparing preview…"}>
            <Eye className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" size="icon" onClick={onEdit} aria-label={`Edit ${doc.title}`} title="Edit"><Pencil className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={onRemove} aria-label={`Delete ${doc.title}`} title="Delete"><Trash2 className="h-4 w-4" /></Button>
      </div>
      <details ref={menu} onToggle={placeMenu} className="relative shrink-0 md:hidden">
        <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-accent [&::-webkit-details-marker]:hidden" aria-label={`More actions for ${doc.title}`}>
          <MoreVertical className="h-5 w-5" />
        </summary>
        <div className={cn("absolute right-0 z-20 w-40 rounded-lg border bg-card p-1 shadow-lg", up ? "bottom-full mb-1" : "mt-1")}>
          {doc.file_path && canView && <button type="button" className={item} onClick={() => { close(); onView(); }}><Eye className="h-4 w-4" /> View</button>}
          <button type="button" className={item} onClick={() => { close(); onEdit(); }}><Pencil className="h-4 w-4" /> Edit</button>
          <button type="button" className={cn(item, "text-red-600")} onClick={() => { close(); onRemove(); }}><Trash2 className="h-4 w-4" /> Delete</button>
        </div>
      </details>
    </>
  );
}

function DocumentTile({ doc, today, url, revealed, toggleReveal, onView, onEdit, onRemove }: {
  doc: TravelDocument; today: string; url: string | null; revealed: boolean; toggleReveal: () => void; onView: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const st = documentStatus(doc.kind, doc.expiry_date, today);
  const meter = expiryMeter(doc.kind, doc.expiry_date, today);
  const isPdf = doc.file_path?.toLowerCase().endsWith(".pdf");
  const Icon = doc.kind === "passport" ? ShieldCheck : isPdf ? FileText : ImageIcon;
  return (
    <li className="relative rounded-xl border bg-card p-4 pl-5 shadow-sm sm:pl-6 md:p-5 md:pl-7">
      {/* No overflow clipping on the card, so the phone menu can open over the cards below; the bar rounds itself */}
      <span className={cn("absolute inset-y-0 left-0 w-1.5 rounded-l-xl", meter ? ACCENT[st.level] : "bg-muted-foreground/30")} aria-hidden="true" />
      <div className="grid items-center gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)_auto]">
        <div className="flex min-w-0 items-center gap-3 pr-10 md:pr-0">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:h-11 md:w-11", ICON_TILE[st.level])}><Icon className="h-5 w-5" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold">{doc.title}</span>
              {meter && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", CHIP[st.level])}>{meter.label}</span>}
              {!doc.trip_id && docScope(doc) !== "both" && <span data-testid="doc-scope" className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">{DOC_SCOPES.find((o) => o.value === docScope(doc))?.label}</span>}
            </p>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              <span className="truncate">{kindLabel(doc.kind)}{doc.issuing_country ? ` · ${doc.issuing_country}` : ""}</span>
              {doc.document_number && (
                <span className="inline-flex items-center gap-1">
                  · <span className="font-mono">{revealed ? doc.document_number : maskNumber(doc.document_number)}</span>
                  <button type="button" onClick={toggleReveal} className="rounded p-0.5 hover:bg-accent" aria-label={revealed ? "Hide number" : "Show number"}>
                    {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </span>
              )}
            </p>
            {doc.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{doc.notes}</p>}
          </div>
        </div>
        <div data-testid="expiry-meter">
          {meter && doc.expiry_date ? (
            <>
              <div className="flex justify-between gap-3 text-xs sm:text-[13px]">
                <span className="text-muted-foreground">{meter.daysLeft < 0 ? "Expired" : "Expires"} {formatDate(doc.expiry_date)}</span>
                <span className={cn("shrink-0 font-semibold", CAPTION[st.level])}>{meter.caption}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Time left before this document expires" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter.pct}>
                <div className={cn("h-full rounded-full", BAR[st.level])} style={{ width: `${meter.pct}%` }} />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No expiry date</p>
          )}
        </div>
        <div className="absolute right-1 top-2.5 md:static"><RowActions doc={doc} canView={!!url} onView={onView} onEdit={onEdit} onRemove={onRemove} /></div>
      </div>
    </li>
  );
}

/**
 * The documents as tiles: summary tiles, filter and search, then "Needs attention" and "Valid" groups.
 * With `compact` (a trip's own documents) it is just the tiles.
 */
export function DocumentList({ docs, urls, revealed, toggleReveal, today, compact, onView, onEdit, onRemove }: {
  docs: TravelDocument[]; urls: Record<string, string>; revealed: Set<string>; toggleReveal: (id: string) => void; today: string; compact: boolean;
  onView: (d: TravelDocument, url: string) => void; onEdit: (d: TravelDocument) => void; onRemove: (d: TravelDocument) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const level = (d: TravelDocument) => documentStatus(d.kind, d.expiry_date, today).level;
  const attention = docs.filter((d) => NEEDS_ATTENTION.includes(level(d)));
  const valid = docs.filter((d) => !NEEDS_ATTENTION.includes(level(d)));
  const expiredCount = docs.filter((d) => level(d) === "expired").length;
  const soon = attention.filter((d) => level(d) !== "expired");
  const nextSoon = [...soon].sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""))[0];
  const nextMeter = nextSoon ? expiryMeter(nextSoon.kind, nextSoon.expiry_date, today) : null;

  const q = query.trim().toLowerCase();
  const matches = (d: TravelDocument) =>
    !q || [d.title, kindLabel(d.kind), d.issuing_country, d.document_number, d.notes].some((v) => (v || "").toLowerCase().includes(q));
  const groups = [
    { key: "attention", title: "Needs attention", dot: "bg-amber-500", right: "Renew these first", list: attention.filter(matches), show: filter !== "valid" },
    { key: "valid", title: "Valid", dot: "bg-emerald-500", right: "", list: valid.filter(matches), show: filter !== "attention" },
  ].filter((g) => g.show && g.list.length > 0);

  const tiles = (list: TravelDocument[]) => (
    <ul className="space-y-3">
      {list.map((d) => (
        <DocumentTile
          key={d.id} doc={d} today={today} url={d.file_path ? urls[d.file_path] ?? null : null} revealed={revealed.has(d.id)} toggleReveal={() => toggleReveal(d.id)}
          onView={() => { const u = d.file_path ? urls[d.file_path] : null; if (u) onView(d, u); }} onEdit={() => onEdit(d)} onRemove={() => onRemove(d)}
        />
      ))}
    </ul>
  );

  if (compact) return tiles(docs);

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: docs.length },
    { id: "attention", label: "Needs attention", count: attention.length },
    { id: "valid", label: "Valid", count: valid.length },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Tile icon={FolderOpen} label="Total" value={docs.length} hint="Documents stored" tone="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" />
        <Tile icon={CheckCircle2} label="Valid" value={valid.length} hint="Not close to expiry" tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" />
        <Tile icon={Clock} label="Expiring soon" value={soon.length} hint={nextSoon && nextMeter ? `Next: ${nextSoon.title}, ${nextMeter.caption.split(" · ")[0]}` : "Nothing to renew"} tone="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" />
        <Tile icon={AlertTriangle} label="Expired" value={expiredCount} hint={expiredCount ? "Needs a new document" : "None expired"} tone="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs label="Document filter" value={filter} onChange={(id) => setFilter(id as typeof filter)} options={tabs.map((t) => ({ id: t.id, label: t.id === "attention" ? <><span className="sm:hidden">Attention</span><span className="hidden sm:inline">Needs attention</span></> : t.label, count: t.count }))} />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, number, country" aria-label="Search documents"
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{q ? "No document matches your search." : "Nothing in this list."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-3">
            <SectionTitle dot={g.dot} title={g.title} count={g.list.length} right={g.right} />
            {tiles(g.list)}
          </section>
        ))
      )}
    </div>
  );
}
