"use client";

import { Briefcase, Check, FileText, Globe, Hammer, Loader2, MapPin, ShoppingCart, X } from "lucide-react";
import type { ScanOption } from "@/lib/scan-destination";

const ICON = { trip: Briefcase, project: Hammer, ptrip: Globe, grocery: ShoppingCart, document: FileText } as const;

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
}) {
  const chosen = options.find((o) => o.key === selected);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl">
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

        <div role="radiogroup" aria-label={title} className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-1">
          {options.map((o) => {
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
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || !chosen}
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
