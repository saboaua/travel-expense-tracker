"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * The one popup of the app: a sheet that slides up from the bottom of the phone, over the bottom menu, with a handle, a title and a
 * close button. A centred panel on larger screens. Tapping outside or pressing Escape closes it.
 */
export function BottomSheet({ title, onClose, children, testId, tall = false }: { title: string; onClose: () => void; children: React.ReactNode; testId?: string; tall?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} data-testid={testId} onClick={onClose}>
      <div className={`w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl ${tall ? "max-h-[94%]" : "max-h-[88%]"}`} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
