"use client";

import { Banknote, CreditCard, Landmark } from "lucide-react";
import { PAID_WITH, rememberPaid, type PaidWith } from "@/lib/paid-with";

const ICON = { cash: Banknote, debit: Landmark, credit: CreditCard } as const;

/** Cash, Debit or Credit card. Tap the chosen one again to clear it. */
export function PaidWithPicker({ value, onChange, required = false, remember = true }: { value: PaidWith | null; onChange: (v: PaidWith | null) => void; /** a choice is always kept: tapping the chosen one does not clear it */ required?: boolean; /** keep the choice as the default for the next receipt */ remember?: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id="paid-with-label">Paid with{!required && <span className="font-normal text-muted-foreground"> (optional)</span>}</p>
      <div role="radiogroup" aria-labelledby="paid-with-label" className="grid grid-cols-3 gap-2" data-testid="paid-with">
        {PAID_WITH.map((o) => {
          const on = value === o.id;
          const Icon = ICON[o.id];
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} data-testid={`paid-${o.id}`}
              onClick={() => { const next = on && !required ? null : o.id; if (next && remember) rememberPaid(next); onChange(next); }}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border-2 text-[13px] font-bold transition-colors ${on ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground/80 hover:bg-muted"}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />{o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
