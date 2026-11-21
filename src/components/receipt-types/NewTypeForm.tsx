"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cleanTypeInput, TYPE_COLORS, TYPE_ICONS, type ReceiptType } from "@/lib/receipt-types";
import { saveReceiptType } from "@/lib/receipt-types-data";
import { TypeIcon } from "@/components/receipt-types/TypeIcon";

/** Name, icon, colour and whether the type gets its own line in the monthly budget. Used in the scan sheet and in Settings. */
export function NewTypeForm({ existing, editing, onSaved, onCancel }: { existing: ReceiptType[]; editing?: ReceiptType | null; onSaved: (id: string, type: ReceiptType) => void; onCancel: () => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState<string>(editing?.icon ?? "heart");
  const [color, setColor] = useState<string>(editing?.color ?? TYPE_COLORS[0]);
  const [inBudget, setInBudget] = useState(editing ? editing.show_in_budget : true);
  const [limit, setLimit] = useState(editing?.monthly_limit ? String(editing.monthly_limit) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const res = cleanTypeInput({ name, icon, color, show_in_budget: inBudget, limit }, existing, editing?.id);
    if (!res.ok) return setError(res.error);
    setSaving(true);
    setError(null);
    const out = await saveReceiptType(createClient(), res.row, editing?.id);
    setSaving(false);
    if (out.error || !out.id) return setError(out.error ?? "Could not save. Try again.");
    onSaved(out.id, { id: out.id, ...res.row, sort_order: editing?.sort_order ?? existing.length });
  };

  return (
    <div className="space-y-4" data-testid="new-type-form">
      <div className="space-y-1.5">
        <label htmlFor="nt-name" className="text-sm font-medium">Name</label>
        <input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Massage, Gym, School…" className="h-11 w-full rounded-lg border bg-background px-3 text-base" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Icon</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Icon">
          {TYPE_ICONS.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={i} onClick={() => setIcon(i)} className={`rounded-xl p-0.5 ${icon === i ? "ring-2 ring-primary" : ""}`}><TypeIcon icon={i} color={color} className="h-10 w-10" /></button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Colour</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {TYPE_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`flex h-9 w-9 items-center justify-center rounded-full ${color === c ? "ring-2 ring-primary ring-offset-2" : ""}`} style={{ backgroundColor: c }}>{color === c && <Check className="h-4 w-4 text-white" aria-hidden="true" />}</button>
          ))}
        </div>
      </div>
      <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border p-3">
        <span><span className="block text-sm font-semibold">Show on my dashboard</span><span className="block text-xs text-muted-foreground">Gets its own line. Off: it is added to Other.</span></span>
        <input type="checkbox" role="switch" data-testid="nt-budget" checked={inBudget} onChange={(e) => setInBudget(e.target.checked)} className="h-6 w-11 shrink-0 accent-primary" />
      </label>
      {inBudget && (
        <div className="space-y-1.5">
          <label htmlFor="nt-limit" className="text-sm font-medium">Monthly limit (optional)</label>
          <input id="nt-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" className="h-11 w-full rounded-lg border bg-background px-3 text-base" />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl border text-base font-semibold hover:bg-muted">Cancel</button>
        <button type="button" onClick={save} disabled={saving} data-testid="nt-save" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-70">{saving && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{editing ? "Save" : "Create type"}</button>
      </div>
    </div>
  );
}
