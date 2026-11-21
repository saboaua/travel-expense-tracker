"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { ReceiptType } from "@/lib/receipt-types";

/** "This does not look like groceries": the best guess is selected; Move it files the receipt there, Keep leaves it. */
export function NotGroceriesBanner({ types, pick, why, onMove, onKeep }: { types: ReceiptType[]; pick: string; why: string; onMove: (choice: string) => void; onKeep: () => void }) {
  const [sel, setSel] = useState(pick);
  const chips = [...types.map((t) => ({ key: t.id, label: t.name })), { key: "shopping", label: "Shopping" }].sort((a, b) => (a.key === pick ? -1 : b.key === pick ? 1 : 0));
  return (
    <div role="status" data-testid="not-groceries" className="mb-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex gap-2">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div><p className="text-sm font-bold">This does not look like groceries</p><p className="text-xs opacity-80">{why} Pick where it belongs.</p></div>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where it belongs">
        {chips.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={sel === c.key} onClick={() => setSel(c.key)} className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${sel === c.key ? "border-primary bg-primary text-primary-foreground" : "border-amber-300 bg-background text-foreground"}`}>{c.label}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" data-testid="ng-move" onClick={() => onMove(sel)} className="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground">Move it</button>
        <button type="button" data-testid="ng-keep" onClick={onKeep} className="h-11 flex-1 rounded-xl border bg-background text-sm font-semibold">Keep in Groceries</button>
      </div>
    </div>
  );
}
