"use client";

import { useState } from "react";
import { Briefcase, Check, ChevronLeft, ChevronRight, FileText, Globe, Hammer, Loader2, MapPin, MoreHorizontal, Plus, ShoppingBag, ShoppingCart, X } from "lucide-react";
import type { ReceiptType } from "@/lib/receipt-types";
import { TypeIcon } from "@/components/receipt-types/TypeIcon";
import { NewTypeForm } from "@/components/receipt-types/NewTypeForm";
import type { ScanOption } from "@/lib/scan-destination";

const ICON = { trip: Briefcase, project: Hammer, ptrip: Globe, grocery: ShoppingCart, shopping: ShoppingBag, type: MoreHorizontal, document: FileText } as const;

/** "Where does this go?" Bottom sheet on phones, centred dialog on larger screens. The best guess is already selected. */
export function ScanSheet({
  options,
  selected,
  onSelect,
  reason,
  preview,
  busy,
  onConfirm,
  onClose,
  title = "Where does this go?",
  types,
  onTypeCreated,
}: {
  options: ScanOption[];
  selected: string;
  onSelect: (key: string) => void;
  reason: string | null;
  preview: string | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  title?: string;
  /** Your receipt types: when given, an "Other" row opens them. */
  types?: ReceiptType[];
  /** A type was just made in the sheet: the caller adds it to its list at once. */
  onTypeCreated?: (t: ReceiptType) => void;
}) {
  const [view, setView] = useState<"main" | "types" | "new">("main");
  const typeOptions = options.filter((o) => o.kind === "type");
  const mainOptions = types ? options.filter((o) => o.kind !== "type") : options;
  const typeSel = types?.find((t) => `type:${t.id}` === selected) ?? null;
  const chosen = options.find((o) => o.key === selected);
  return (
    <div className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92%] w-full max-w-md flex-col rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-3">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-[72px] w-14 shrink-0 rounded-lg border object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{title}</h2>
            {reason && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{reason}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        </div>

        {view === "new" && types && (
          <div className="min-h-0 flex-1 overflow-y-auto pb-1">
            <p className="mb-3 text-base font-bold">New type</p>
            <NewTypeForm existing={types} onCancel={() => setView("types")} onSaved={(id, t) => { onTypeCreated?.(t); onSelect(`type:${id}`); setView("main"); }} />
          </div>
        )}
        {view === "types" && types && (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-1" data-testid="types-list">
            <button type="button" onClick={() => setView("main")} className="mb-1 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Back</button>
            {types.map((t) => {
              const on = selected === `type:${t.id}`;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => { onSelect(`type:${t.id}`); setView("main"); }} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 p-3 text-left ${on ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                  <TypeIcon icon={t.icon} color={t.color} className="h-10 w-10" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t.name}</span>
                  {on && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
            <button type="button" data-testid="new-type" onClick={() => setView("new")} className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-dashed p-3 text-left font-semibold text-primary hover:bg-primary/5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Plus className="h-5 w-5" aria-hidden="true" /></span>New type</button>
          </div>
        )}
        <div role="radiogroup" aria-label={title} className={`min-h-0 flex-1 space-y-2 overflow-y-auto pb-1 ${view === "main" ? "" : "hidden"}`}>
          {mainOptions.map((o) => {
            const on = o.key === selected;
            const Icon = ICON[o.kind];
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSelect(o.key)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${on ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{o.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.sub}</span>
                </span>
                {on && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
          {types && (
            <button type="button" role="radio" aria-checked={!!typeSel} data-testid="scan-other" onClick={() => setView("types")} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${typeSel ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
              {typeSel ? <TypeIcon icon={typeSel.icon} color={typeSel.color} className="h-10 w-10" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{typeSel ? `Other: ${typeSel.name}` : "Other"}</span><span className="block truncate text-xs text-muted-foreground">{typeSel ? "Tap to choose another type" : typeOptions.length ? typeOptions.slice(0, 3).map((o) => o.label).join(", ") + "…" : "Massage, health, pets… or make your own"}</span></span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || !chosen || view !== "main"}
          className="mt-3 inline-flex h-13 min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-70"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
          {chosen ? `Save to ${chosen.label}` : "Choose where"}
        </button>
        <p className="mt-2 text-center text-xs text-muted-foreground">We remember your choice for next time</p>
      </div>
    </div>
  );
}
